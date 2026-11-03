import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { buildOrder, dayCol, peakOf } from '../functions/api/pay/[[path]].js';
import { onRequest as auth } from '../functions/api/auth/[[path]].js';
import { PRODUCTS, PRICING } from '../functions/api/_catalog.js';
import { sha256, kstToday } from '../functions/api/_lib.js';

function passInput(){
  for(let n=1;n<400;n++){
    const date=kstToday(n);if(peakOf(date))continue;
    const p=PRODUCTS.items.find(x=>x.kind==='pass'&&x.pkg==='day'&&PRODUCTS.dayGroups[x.group].cols.includes(dayCol(date)));
    if(p)return {product_id:p.id,date,people:30};
  }
  throw Error('No future pass date');
}
const rate=id=>PRICING.options.find(x=>x.id===id).price;
test('견적의 매니저 인원·시간과 일회용품 인원을 서버 단가로 정확히 결제한다',()=>{
  const input={...passInput(),price:1,addons:{manager:{count:2,hours:7,price:1},disposable:{people:30,price:1}}};
  const o=buildOrder(input),base=PRODUCTS.get(input.product_id).price+10*PRODUCTS.people.extra;
  assert.equal(o.error,undefined);assert.equal(o.total,base+rate('manager')*14+rate('disposable')*30);
  const manager=o.lines.find(x=>x.id==='addon-manager'),disposable=o.lines.find(x=>x.id==='addon-disposable');
  assert.equal(manager.qty,14);assert.equal(manager.amount,350000);assert.match(manager.desc,/2명.*7시간/);
  assert.equal(disposable.qty,30);assert.equal(disposable.amount,150000);assert.match(disposable.desc,/30명/);
});
test('매니저와 일회용품의 지원 범위를 벗어난 옵션은 축소 결제하지 않고 거절한다',()=>{
  for(const manager of [{count:0,hours:7},{count:11,hours:7},{count:1.5,hours:7},{count:2,hours:25},{count:2,hours:0},{count:2,hours:7.5},{count:'2x',hours:7}]){
    assert.equal(buildOrder({...passInput(),addons:{manager}}).code,'BAD_OPTIONS',JSON.stringify(manager));
  }
  for(const people of [0,201,1.5,'30x'])assert.equal(buildOrder({...passInput(),addons:{disposable:{people}}}).code,'BAD_OPTIONS');
  assert.equal(buildOrder({...passInput(),addons:{cleaning:{qty:2}}}).code,'BAD_OPTIONS');
});
test('기존 4시간·20인분 단위 옵션 주문과 단독 상품은 가격 호환을 유지한다',()=>{
  const input=passInput(),o=buildOrder({...input,addons:{manager:2,disposable:2}});
  assert.equal(o.lines.find(x=>x.id==='addon-manager').amount,200000);assert.equal(o.lines.find(x=>x.id==='addon-disposable').amount,200000);
  assert.equal(buildOrder({product_id:'addon-manager',qty:2}).total,200000);
  assert.equal(buildOrder({product_id:'addon-disposable',qty:3}).total,300000);
});
async function memberFixture(){
  const db=new DatabaseSync(':memory:');db.exec(readFileSync(new URL('../schema.sql',import.meta.url),'utf8'));
  const DB={prepare(sql){const st=db.prepare(sql);let args=[];return {bind(...a){args=a;return this;},async first(){return st.get(...args)||null;},async all(){return {results:st.all(...args)};},async run(){return st.run(...args);}};}};
  for(const id of [1,2]){
    db.prepare("INSERT INTO members(id,email,name,phone,pw_hash,status,agreed_at,created_at) VALUES(?,?,?,?,?,'active',?,?)").run(id,'member'+id+'@example.invalid','회원'+id,'01012345678','unused','2026-01-01','2026-01-01');
    db.prepare('INSERT INTO sessions(token_hash,member_id,created_at,expires_at,ua) VALUES(?,?,?,?,?)').run(await sha256('token-'+id),id,'2026-01-01','2099-01-01','test');
    db.prepare('INSERT INTO orders(oid,product_id,title,price,buyer_name,buyer_phone,data,status,member_id,booking_code,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('MS-ORDER-'+id,'pass-day-wdfri','회원'+id+' 주문',900000,'회원'+id,'01012345678','{}','paid',id,'BK-'+id,'2026-11-03');
  }
  db.prepare('INSERT INTO orders(oid,product_id,title,price,buyer_name,buyer_phone,data,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)').run('MS-GUEST','addon-cleaning','같은 전화의 비회원 주문',200000,'회원1','01012345678','{}','paid','2026-11-03');
  db.prepare('INSERT INTO payapp_refunds(oid,mul_no,amount,created_at) VALUES(?,?,?,?)').run('MS-ORDER-1','REFUND-1',100000,'2026-11-03');
  async function call(cookie,path='orders'){
    const res=await auth({env:{DB},params:{path:path.split('?')[0].split('/')},request:new Request('https://local.test/api/auth/'+path,{headers:cookie?{cookie}:{}})});
    return {status:res.status,body:await res.json(),headers:res.headers};
  }
  return {db,call};
}
test('회원 주문은 표시 쿠키만으로 읽을 수 없고 검증된 세션 소유 주문만 반환한다',async()=>{
  const f=await memberFixture();
  for(const cookie of [undefined,'ms_in=1','ms_session=invalid'])assert.equal((await f.call(cookie)).status,401);
  const own=await f.call('ms_session=token-1','orders?member_id=2&email=member2@example.invalid');
  assert.equal(own.status,200);assert.deepEqual(own.body.items.map(x=>x.oid),['MS-ORDER-1']);
  assert.equal(own.body.items[0].refunded_amount,100000);assert.equal(own.body.items[0].booking_code,'BK-1');
  assert.equal(own.body.items[0].buyer_phone,undefined);assert.equal(own.headers.get('cache-control'),'no-store');
  const other=await f.call('ms_session=token-2');assert.deepEqual(other.body.items.map(x=>x.oid),['MS-ORDER-2']);
});
test('전액 환불 주문은 내역에서 원금 전체를 환불로 표시한다',async()=>{
  const f=await memberFixture();f.db.prepare("UPDATE orders SET status='refunded' WHERE oid='MS-ORDER-1'").run();
  const r=await f.call('ms_session=token-1');assert.equal(r.body.items[0].refunded_amount,900000);assert.equal(r.body.items[0].status,'refunded');
});
