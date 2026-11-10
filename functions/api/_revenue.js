import {PRODUCTS} from './_catalog.js';
import {DEFAULT_SPACE,err,isDate,json,kstToday,SPACES} from './_lib.js';
import {refundAmountSql} from './_payapp_refund_history.js';
import {legacyPaymentSourceSql} from './_settlement.js';

const verificationIds = PRODUCTS.items.filter(p => p.kind === 'verification').map(p => p.id);
const spaces = [...Object.keys(SPACES), 'unassigned'];
const pageSize = 50;
const totals = () => ({count:0, received:0, refunded:0, net:0});
function add(total, row) {
  total.count += row.count;
  total.received += row.received;
  total.refunded += row.refunded;
  total.net = total.received - total.refunded;
}

export async function revenueAdmin({env,url,method,operationalBookingSql,archivedStatus}) {
  if (method !== 'GET') return err('지원하지 않는 요청입니다.',405);
  const q = url.searchParams, today = kstToday();
  const month = today.slice(0,7), [year,monthNumber] = month.split('-').map(Number);
  const from = q.get('from') ?? month+'-01';
  const to = q.get('to') ?? new Date(Date.UTC(year,monthNumber,0)).toISOString().slice(0,10);
  const basis = q.get('basis'), space = q.get('space') ?? '', day = q.get('day') ?? '';
  const page = Number(q.get('page') ?? 1);
  if (!isDate(from) || !isDate(to) || from > to || Date.parse(to)-Date.parse(from) > 365*864e5)
    return err('조회 기간을 확인해 주세요. 최대 366일까지 조회할 수 있습니다.');
  if (basis !== null && basis !== 'event')
    return err('매출은 이용일 기준으로 조회합니다. 화면을 새로고침해 주세요.');
  if ((space && !spaces.includes(space)) ||
      (day && (!isDate(day) || day < from || day > to)) || !Number.isSafeInteger(page) || page < 1 || page > 100000)
    return err('조회 조건을 확인해 주세요.');

  const sql = `WITH
    online AS (
      SELECT o.oid,o.title,o.price,${refundAmountSql('o')} AS refund_total,
        COALESCE(o.paid_at,o.created_at) AS paid_at,o.paid_at IS NULL AS estimated_receipt,
        COALESCE((
          SELECT l.created_at FROM event_log l WHERE l.ref=o.oid AND
            (l.kind='order.refunded' OR (l.kind='order.updated' AND
              json_extract(CASE WHEN json_valid(l.detail) THEN l.detail END,'$.status')='refunded'))
          ORDER BY l.id DESC LIMIT 1
        ),o.updated_at,o.paid_at,o.created_at) AS legacy_refund_at,
        COALESCE(b.date,o.event_date,i.event_date) AS event_date,
        CASE WHEN o.product_id LIKE 'parking-%' THEN NULL
          ELSE COALESCE(b.space_id,i.space_id,CASE WHEN o.product_id LIKE 'pass-%' THEN '${DEFAULT_SPACE}' END)
        END AS space_id, b.booking_code
      FROM orders o
      LEFT JOIN bookings b ON b.booking_code=o.booking_code
      LEFT JOIN inquiries i ON i.ref=COALESCE(b.inquiry_ref,o.inquiry_ref)
      WHERE o.test=0 AND o.status IN ('paid','refunded') AND o.price>0
        AND o.product_id NOT IN (${verificationIds.map(() => '?').join(',')})
        AND ${operationalBookingSql} AND (b.booking_code IS NOT NULL OR i.status IS NOT ?)
    ),
    refund_rows AS (
      SELECT r.mul_no,r.oid,r.amount,r.created_at,
        SUM(r.amount) OVER (PARTITION BY r.oid ORDER BY r.created_at,r.mul_no) - r.amount AS previous
      FROM payapp_refunds r JOIN online o ON o.oid=r.oid
    ),
    manual AS (
      SELECT booking_code,kind,amount,created_at,'entry:'||id AS id,request_id='legacy-confirmation' AS estimated
      FROM booking_payment_current WHERE state='active'
      UNION ALL
      SELECT booking_code,'receipt',amount,created_at,'legacy:'||booking_code,1 FROM (${legacyPaymentSourceSql()})
    ),
    movements AS (
      SELECT m.id,b.booking_code AS ref,b.booking_code,'이용료 수납·환불' AS title,b.space_id,b.date AS event_date,
        m.created_at AS occurred_at,'manual' AS source,m.kind,m.amount,m.estimated
      FROM manual m JOIN bookings b ON b.booking_code=m.booking_code WHERE ${operationalBookingSql}
      UNION ALL
      SELECT 'paid:'||oid,oid,booking_code,title,space_id,event_date,paid_at,'online','receipt',price,estimated_receipt
      FROM online
      UNION ALL
      SELECT 'refund:'||r.mul_no,o.oid,o.booking_code,o.title,o.space_id,o.event_date,r.created_at,
        'online','refund',MIN(r.amount,o.refund_total-r.previous),0
      FROM refund_rows r JOIN online o ON o.oid=r.oid WHERE r.previous<o.refund_total
      UNION ALL
      SELECT 'legacy-refund:'||oid,oid,booking_code,title,space_id,event_date,legacy_refund_at,
        'online','refund',refund_total-COALESCE((SELECT SUM(r.amount) FROM payapp_refunds r WHERE r.oid=o.oid),0),1
      FROM online o
    ),
    dated AS (
      SELECT *,event_date AS day,
        date(occurred_at,'+9 hours') AS recorded_day,
        CASE WHEN space_id IN (?,?) THEN space_id ELSE 'unassigned' END AS branch
      FROM movements WHERE amount>0
    ),
    filtered AS (SELECT * FROM dated WHERE day BETWEEN ? AND ?${space ? ' AND branch=?' : ''}),
    details AS (
      SELECT * FROM filtered ${day ? 'WHERE day=?' : ''}
      ORDER BY day DESC,occurred_at DESC,id DESC LIMIT ? OFFSET ?
    )
    SELECT 'daily' AS section,day,branch,COUNT(*) AS count,
      SUM(CASE WHEN kind='receipt' THEN amount ELSE 0 END) AS received,
      SUM(CASE WHEN kind='refund' THEN amount ELSE 0 END) AS refunded,
      NULL AS occurred_at,NULL AS recorded_day,NULL AS event_date,NULL AS ref,NULL AS booking_code,NULL AS title,
      NULL AS source,NULL AS kind,NULL AS amount,NULL AS estimated,NULL AS id
    FROM filtered GROUP BY day,branch
    UNION ALL
    SELECT 'detail',day,branch,NULL,NULL,NULL,occurred_at,recorded_day,event_date,ref,booking_code,title,source,kind,amount,estimated,id
    FROM details ORDER BY section,day DESC,occurred_at DESC,id DESC`;
  const args = [...verificationIds,archivedStatus,...Object.keys(SPACES),from,to];
  if (space) args.push(space);
  if (day) args.push(day);
  args.push(pageSize,(page-1)*pageSize);
  const {results} = await env.DB.prepare(sql).bind(...args).all();
  const total = totals(), daily = new Map(), branches = Object.fromEntries(spaces.map(id => [id,totals()]));
  const items = [];
  for (const row of results || []) {
    if (row.section === 'detail') {
      const {section,count,received,refunded,id,...item} = row;
      items.push(item);
      continue;
    }
    if (!daily.has(row.day)) daily.set(row.day,{day:row.day,...totals(),branches:{}});
    const entry = daily.get(row.day);
    entry.branches[row.branch] = {count:row.count,received:row.received,refunded:row.refunded,net:row.received-row.refunded};
    add(entry,row);
    add(branches[row.branch],row);
    add(total,row);
  }
  const detailCount = day ? daily.get(day)?.count || 0 : total.count;
  return json({ok:true,total,branches,daily:[...daily.values()],items,detailCount,page,pageSize},200,{'cache-control':'no-store'});
}
