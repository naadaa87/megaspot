import { paymentSchedule } from './_booking_payment_schedule.js';
import { FOOD_SPACE, foodEvent } from './_food_booking.js';
import { err, isDate, json, log, now, readJson, sha256, str } from './_lib.js';
import { settlementFor } from './_settlement.js';

const stages = ['delivery', 'setup', 'teardown'];
const labels = {catering:'출장뷔페', reception:'출장 케이터링', cocktail:'출장 칵테일'};
const vendorStatuses = ['not_ordered', 'sent', 'confirmed', 'cancelled'];
const menuFields = {
  catering: ['course', 'course_name', 'bbq', 'beer', 'soju', 'note', 'meal_time'],
  reception: ['course', 'courseName', 'format', 'menu_ids', 'menuNames', 'note', 'request_note'],
  cocktail: ['menus', 'menu_names', 'nonalcohol', 'note'],
};

async function context(env, code) {
  const row = await env.DB.prepare(`SELECT b.booking_code, b.inquiry_ref, b.date, b.headcount, b.status,
    b.space_id, b.customer_name, i.data, i.status AS inquiry_status, s.value, s.updated_at,
    COALESCE((SELECT MAX(id) FROM booking_reconfirmations WHERE booking_code=b.booking_code),0) AS reconfirmation
    FROM bookings b JOIN inquiries i ON i.ref=b.inquiry_ref
    LEFT JOIN settings s ON s.key='food-operations:' || b.booking_code
    WHERE b.booking_code=? AND b.space_id=? AND i.space_id=?`).bind(code, FOOD_SPACE, FOOD_SPACE).first();
  if (!row) return null;
  const data = foodEvent(row.data) || {};
  const event = data.food_event || {};
  const saved = foodEvent(row.value) || {};
  const scheduleRevision = await sha256(JSON.stringify([row.reconfirmation, row.date, event.location, event.start, event.end]));
  const services = await Promise.all(Object.keys(labels).flatMap(kind => {
    const item = data[kind];
    if (!item || item.removed || item.status === 'cancelled') return [];
    return [sha256(JSON.stringify([scheduleRevision, row.headcount, event.quote_no, item])).then(revision => ({kind, item, revision}))];
  }));
  const headcountRevision = await sha256(JSON.stringify([row.reconfirmation, row.headcount, services.map(({kind,item}) => [kind,item.people ?? item.cups ?? null])]));
  const menuRevision = await sha256(JSON.stringify([row.reconfirmation, services.map(({kind,item}) => [kind, menuFields[kind].map(key => item[key] ?? null)])]));
  const bookingRevision = await sha256(JSON.stringify([scheduleRevision, headcountRevision, menuRevision, services.map(({revision}) => revision)]));
  return {
    row, event, saved, services, scheduleRevision, headcountRevision, menuRevision, bookingRevision,
    editable: row.status === 'confirmed' && row.inquiry_status !== '삭제됨',
  };
}

function dateAndTime(task) {
  if (!task || typeof task !== 'object') return null;
  const date = str(task.date, 20);
  const time = str(task.time, 20);
  if ((date && !isDate(date)) || (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || (time && !date)) return null;
  return {date, time, owner: str(task.owner, 80)};
}

function normalizedOperations(ctx, body) {
  const {saved, services, scheduleRevision, headcountRevision, menuRevision} = ctx;
  const schedule = {};
  for (const stage of stages) {
    const input = body.schedule?.[stage] ?? saved.schedule?.[stage] ?? {};
    const task = dateAndTime(input);
    if (!task) return {error:'현장 일정의 날짜·시각을 확인해 주세요. 시각을 지정할 때는 날짜도 입력해 주세요.'};
    if (task.date || task.time || task.owner) schedule[stage] = task;
  }
  const scheduleChanged = JSON.stringify(schedule) !== JSON.stringify(saved.schedule || {});
  const orders = {...saved.orders};
  for (const {kind,revision} of services) {
    const status = body.orders?.[kind];
    if (status == null || status === '') continue;
    if (!vendorStatuses.includes(status)) return {error:'발주 상태를 확인해 주세요.'};
    orders[kind] = {status, revision};
  }
  const checklist = {...saved.checklist};
  for (const [key,revision] of [['headcount',headcountRevision],['menu',menuRevision]]) {
    if (body.checklist?.[key] === true) checklist[key] = revision;
    if (body.checklist?.[key] === false && checklist[key] === revision) delete checklist[key];
  }
  return {
    version: (saved.version || 0) + 1, schedule,
    schedule_revision: scheduleChanged || body.review_schedule === true ? scheduleRevision : saved.schedule_revision || '',
    orders, checklist,
    memo: str(body.memo ?? saved.memo, 1200),
  };
}

function checklistStatus(checklist, key, revision) {
  if (!checklist?.[key]) return 'pending';
  return checklist[key] === revision ? 'confirmed' : 'needs_review';
}

async function reminder(env, ctx) {
  if (!ctx.editable) return {reason:'확정된 예약에서 잔금 안내문을 준비할 수 있습니다.'};
  const {row,event} = ctx;
  const settlement = await settlementFor(env, row.booking_code);
  if (!settlement || settlement.booking_status !== 'confirmed' || settlement.review_required || settlement.balance == null) {
    return {reason:'수납·환불 내역을 확인한 뒤 안내문을 준비해 주세요.'};
  }
  if (settlement.balance === 0) return {balance:0, reason:'안내할 잔금이 없습니다.'};
  const schedule = await paymentSchedule(env, row);
  const current = await env.DB.prepare(`SELECT 1 AS active FROM bookings b JOIN inquiries i ON i.ref=b.inquiry_ref
    WHERE b.booking_code=? AND b.status='confirmed' AND b.date IS ? AND b.customer_name IS ?
      AND i.status IS ? AND i.data IS ?
      AND COALESCE((SELECT MAX(id) FROM booking_reconfirmations WHERE booking_code=b.booking_code),0) IS ?`)
    .bind(row.booking_code,row.date,row.customer_name,row.inquiry_status,row.data,row.reconfirmation).first();
  if (!current) return {reason:'예약 조건이 변경되었습니다. 현재 잔금으로 안내문을 다시 준비해 주세요.'};
  const dueDate = schedule.due_date || event.balance_due || '';
  const lines = [
    `안녕하세요, ${row.customer_name}님. 메가스팟입니다.`,
    '식음료 예약의 잔금을 안내드립니다.',
    `예약번호 ${row.booking_code}`,
    `행사일 ${row.date}`,
    `남은 잔금 ${settlement.balance.toLocaleString('ko-KR')}원`,
  ];
  if (dueDate) lines.push(`납부일 ${dueDate}`);
  lines.push('입금하신 뒤 회신 부탁드립니다. 감사합니다.');
  return {balance:settlement.balance, due_date:dueDate, text:lines.join('\n')};
}

function present(ctx) {
  const {row, event, saved, services, scheduleRevision, headcountRevision, menuRevision} = ctx;
  return {
    ok:true, editable:ctx.editable, version:saved.version || 0, booking_revision:ctx.bookingRevision,
    booking:{code:row.booking_code, name:row.customer_name, date:row.date,
      location:event.location || '', start:event.start || '', end:event.end || '', headcount:row.headcount},
    schedule:saved.schedule || {},
    schedule_needs_review: Boolean(Object.keys(saved.schedule || {}).length && saved.schedule_revision !== scheduleRevision),
    orders:services.map(({kind,item,revision}) => {
      const previous = saved.orders?.[kind];
      const stale = Boolean(previous && previous.revision !== revision && previous.status !== 'not_ordered');
      return {
        kind, label:labels[kind],
        item:str(item.courseName || item.course_name || item.menu_names?.join(', ') || item.title || labels[kind], 250),
        people:item.people ?? null, cups:item.cups ?? null, format:str(item.formatName, 100),
        status:previous?.status || 'not_ordered', needs_review:stale,
      };
    }),
    checklist:{
      headcount:checklistStatus(saved.checklist, 'headcount', headcountRevision),
      menu:checklistStatus(saved.checklist, 'menu', menuRevision),
    },
    memo:saved.memo || '', updated_at:row.updated_at || null,
  };
}

export async function foodOperationsAdmin({env, request, path, method}) {
  const match = path.match(/^bookings\/([A-Z0-9-]{1,40})\/food-operations(\/reminder)?$/);
  if (!match) return err('식음료 예약을 찾을 수 없습니다.',404);
  if (method !== 'GET' && (method !== 'PUT' || match[2])) return err('지원하지 않는 작업입니다.',405);
  const ctx = await context(env, match[1]);
  if (!ctx) return err('식음료 예약을 찾을 수 없습니다.',404);
  if (method === 'GET') {
    return match[2] ? json({ok:true, ...await reminder(env,ctx)}) : json(present(ctx));
  }
  if (!ctx.editable) return err('확정된 식음료 예약에서 현장 운영을 수정해 주세요.',409,'FOOD_OPERATIONS_READ_ONLY');
  const changed = () => err('다른 관리자가 현장 운영 또는 예약 조건을 변경했습니다. 최신 내용을 확인한 뒤 다시 저장해 주세요.',409,'FOOD_OPERATIONS_STALE');
  const body = await readJson(request,16000);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return err('현장 운영 정보의 형식을 확인해 주세요.');
  if (body.version !== (ctx.saved.version || 0) || body.booking_revision !== ctx.bookingRevision) return changed();
  const operations = normalizedOperations(ctx,body);
  if (operations.error) return err(operations.error);
  const key = 'food-operations:' + match[1];
  const updated = now();
  // Keep operations separate from the contract and compare both records before writing.
  const result = await env.DB.prepare(`INSERT INTO settings(key,value,updated_at)
    SELECT ?,?,? FROM bookings b JOIN inquiries i ON i.ref=b.inquiry_ref
    WHERE b.booking_code=? AND b.space_id=? AND b.status='confirmed'
      AND b.date IS ? AND b.headcount IS ? AND i.ref=? AND i.space_id=? AND i.status IS ? AND i.data IS ?
      AND COALESCE((SELECT MAX(id) FROM booking_reconfirmations WHERE booking_code=b.booking_code),0) IS ?
      AND (SELECT value FROM settings WHERE key=?) IS ?
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`)
    .bind(key, JSON.stringify(operations), updated, ctx.row.booking_code, FOOD_SPACE, ctx.row.date,
      ctx.row.headcount, ctx.row.inquiry_ref, FOOD_SPACE, ctx.row.inquiry_status, ctx.row.data,
      ctx.row.reconfirmation, key, ctx.row.value).run();
  if (!Number(result.meta?.changes ?? result.changes ?? 0)) return changed();
  await log(env,'food.operations.updated',ctx.row.inquiry_ref,'admin',{booking_code:match[1],version:operations.version});
  return json(present({...ctx, saved:operations, row:{...ctx.row,updated_at:updated}}));
}
