import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {quoteUi} from './admin-quote-fixture.mjs';
const source=readFileSync(new URL('../../assets/js/pages/admin.js',import.meta.url),'utf8');
export function bookingUi(){
 const ui=quoteUi(),c=ui.ctx;c.PUR.seminar='강연·세미나';c.OPTL={manager:'현장 매니저',cleaning:'뒷정리·청소',disposable:'1회용 세트',banner:'현수막',xbanner:'X배너'};
 for(const [from,to] of [['  function currentAmount(', '  function row('],['  function confirmFromInquiry(', '  function confirmFromRs('],['  function cdDefaults(', '  function cdFill('],['  function cdSave(', '  function cdBusy(']]){const i=source.indexOf(from);vm.runInContext(source.slice(i,source.indexOf(to,i)),c);}
 vm.runInContext(readFileSync(new URL('../../assets/js/confirm-doc.js',import.meta.url),'utf8'),c);
 return {...ui,convert(detail){c.cur=detail;return JSON.parse(JSON.stringify(c.confirmFromInquiry()));},defaults(detail){return JSON.parse(JSON.stringify(c.cdDefaults(detail)));},text(doc){return c.window.MEGASPOT_CONFIRM.kakaoText(doc,'');}};
}
