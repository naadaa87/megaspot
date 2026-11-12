import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {publicQuoteUi} from './helpers/public-quote-fixture.mjs';
import {quoteUi} from './helpers/admin-quote-fixture.mjs';
const title='메가스팟 퇴실 시 청소 및 원상복구 기준';
function verify(html){
 assert.equal((html.match(/class="qp qp-cleanup"/g)||[]).length,1);
 for(const text of [title,'1. 시설 및 집기류 원상복구','2. 쓰레기 수거 및 정리','3. 테이블 및 주변 정리','4. 퇴실 전 최종 확인','지정된 출입문 앞 한곳','보증금에서 차감될 수 있습니다.','을 기본 청소 기준으로 합니다.'])assert.ok(html.includes(text),text);
 const appendix=html.slice(html.indexOf('class="qp qp-cleanup"'));assert.equal((appendix.match(/<li>/g)||[]).length,10);assert.match(appendix,/<strong>이용 과정에서 발생한 쓰레기와 오염물을 정리하고 시설 및 집기류를 원상복구하는 수준<\/strong>/);
}
for(const space of ['megaspot-gundae','megaspot-gundae-2']){
 test(`${space}: customer estimates include the shared policy after totals without duplicates`,()=>{
  const f=publicQuoteUi(),first=f.render(space);verify(first.html);assert.ok(first.html.indexOf('qp-cleanup')>first.html.indexOf('qp-foot'));assert.ok(first.html.includes(first.total.toLocaleString('ko-KR')+'원'));const again=f.render(space);verify(again.html);assert.equal(again.total,first.total);
  verify(f.render(space,{unknown:true}).html);
 });
 test(`${space}: administrator quotations include exactly the same policy and preserve totals`,()=>{
  const f=quoteUi();Object.assign(f.ctx.Q,{space,date:'2026-12-17',start:17,end:22,people:65,customer:'출력 검증 고객'});const doc=f.documents();verify(doc.html);const publicDoc=publicQuoteUi().render(space);const appendix=html=>html.slice(html.indexOf('<section class="qp qp-cleanup"'));assert.equal(appendix(doc.html),appendix(publicDoc.html));assert.ok(doc.html.includes(doc.total.toLocaleString('ko-KR')+'원'));
 });
}
test('every quote entry point loads the policy before its renderer with current asset versions',()=>{
 const pages=['index.html','guide/index.html','inquiry/index.html','spaces/megaspot-gundae/index.html','spaces/megaspot-gundae/pricing/index.html','spaces/megaspot-gundae-2/index.html','spaces/megaspot-gundae-2/pricing/index.html','admin/index.html'];
 const hash=file=>createHash('sha256').update(readFileSync(new URL('../'+file,import.meta.url))).digest('hex').slice(0,12);
 for(const page of pages){const html=readFileSync(new URL('../'+page,import.meta.url),'utf8'),renderer=page==='admin/index.html'?'assets/js/pages/admin.js':'assets/js/pricing-ui.js';assert.ok(html.indexOf('/assets/js/quote-policy.js?')<html.indexOf('/'+renderer+'?'),page);for(const file of [renderer,'assets/js/quote-policy.js','assets/css/quote-print.css'])assert.ok(html.includes('/'+file+'?v='+hash(file)),`${page}: ${file}`);}
});
test('policy escapes caller-provided space names',()=>{
 const ctx={window:{}};vm.runInNewContext(readFileSync(new URL('../assets/js/quote-policy.js',import.meta.url),'utf8'),ctx);const html=ctx.window.MEGASPOT_QUOTE_POLICY.html('<img src=x onerror=alert(1)>');assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img'));
});
