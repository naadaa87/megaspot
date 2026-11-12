import {readFileSync} from 'node:fs';
import vm from 'node:vm';
export function publicQuoteUi(){
 const sheet={innerHTML:''},M={CONFIG:{phone:'010-0000-0000'},esc:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),$(){},$$:()=>[]};
 const ctx=vm.createContext({window:{MEGASPOT:M},document:{getElementById:()=>sheet,body:{dataset:{}}},location:{pathname:'/inquiry/',search:''},URLSearchParams});
 for(const file of ['quote-policy.js','data/holidays-kr.js','data/pricing-gundae.js','data/pricing-gundae2.js','pricing-engine.js','pricing-ui.js'])vm.runInContext(readFileSync(new URL('../../assets/js/'+file,import.meta.url),'utf8'),ctx);
 return {ctx,render(space,options={}){const ui=M.pricing.forSpace(space),r=ui.E.quote({date:'2026-12-17',start:17,end:22,people:65});if(options.unknown)r.plan={unknownDate:true,html:'<p>상담 후 안내</p>'};ui.renderQuoteSheet(r,'단체 행사');return {html:sheet.innerHTML,total:r.total};}};
}
