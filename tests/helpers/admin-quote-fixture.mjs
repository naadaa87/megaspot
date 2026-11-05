import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../assets/js/pages/admin.js',import.meta.url),'utf8');
export function quoteUi(){
 const elements={},messages=[],state={item:null,quotes:[],bookings:[]};
 const $=selector=>elements[selector]??={innerHTML:'',hidden:false,appendChild(node){this.child=node;}};
 const ctx=vm.createContext({window:{},$,esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),M:{CONFIG:{phone:'02-1234-5678',email:'test@example.com',kakaoChannel:'https://pf.kakao.com/test'},toast(){}},DEFAULT_SPACE:'megaspot-gundae',ADMIN_HOURS:{from:0,to:47},PUR:{party:'단체 파티·기념행사'},SLOT_H:{},todayIso:()=> '2026-11-05',quoteDirty:false,quoteHistorical:false,savedQuoteSnapshot:null,savedQuoteCreatedAt:'',quoteSettlement:null,cur:null,document:{createElement:()=>({})},confirm:()=>true,note:(el,text)=>messages.push(text),guard:()=>false,readForm(){},fillForm(){},setQuoteHistorical(on){ctx.quoteHistorical=on;}});
 for(const file of ['data/holidays-kr.js','data/pricing-gundae.js','data/pricing-gundae2.js','data/reception-quote.js','reception-calc.js','food-services.js','settlement.js','pricing-engine.js'])vm.runInContext(readFileSync(new URL('../../assets/js/'+file,import.meta.url),'utf8'),ctx);
 ctx.E0=ctx.window.MEGASPOT_PRICE;ctx.E=ctx.E0;ctx.D=ctx.E.data();ctx.useSpace=id=>{ctx.E=ctx.E0.forSpace(id);ctx.D=ctx.E.data();};ctx.spaceOk=id=>['megaspot-gundae','megaspot-gundae-2'].includes(id)?id:'megaspot-gundae';ctx.spaceName=id=>ctx.E0.forSpace(id).data().spaceName;ctx.won=n=>Math.round(n).toLocaleString('ko-KR')+'원';ctx.currentAmount=it=>it.data?.total??null;ctx.A=async()=>state;
 for(const [from,to]of [['  function invalidateQuote(', '  Q=blankQ();'],['  function compute(', '  var R=null;'],['  function quoteVatNote(', '  function calc('],['  function quoteFromInquiry(', '  function setQuoteHistorical('],['  function quoteInquiryConditions(', '  function payload('],['  function payload(', "  $('#q-save').addEventListener"],['  function custParts(', "  $('#q-copy').addEventListener"],['  function quoteSettlementHtml(', '  function loadRecentQuotes(']]){
  const start=source.indexOf(from);if(start<0)throw Error(from);vm.runInContext(source.slice(start,source.indexOf(to,start)),ctx);
 }
 const hoursStart=source.indexOf('  function inqHours(');vm.runInContext(source.slice(hoursStart,source.indexOf('  function confirmFromInquiry(',hoursStart)),ctx);
 ctx.calc=()=>ctx.R=ctx.compute();ctx.Q=ctx.blankQ();
 return {ctx,state,messages,elements,open(item,quotes=[]){state.item=item;state.quotes=quotes;ctx.quoteFromInquiry(item,quotes[0]);ctx.calc();},async saved(q,item){state.item=item;state.quotes=[q];await ctx.loadSavedQuote(q,item.ref);},documents(){ctx.calc();ctx.renderSheet();return {html:$('#quote-print').innerHTML,text:ctx.kakaoText(),total:ctx.R.total,input:ctx.Q};}};
}
