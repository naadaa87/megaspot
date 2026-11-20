import { ReviewRequired,dateAt } from './guard.mjs';

const monthIndex=date=>Number(date.slice(0,4))*12+Number(date.slice(5,7));
async function visible(locator) {
  const target=locator.filter({visible:true});
  if(await target.count()!==1)throw new ReviewRequired('public_unverified');
  return target;
}
async function selectDate(page,date) {
  const title=await visible(page.locator('.calendar_tit'));
  const month=async()=>{const match=(await title.innerText()).match(/(\d{4})\s*\.\s*(\d{1,2})/);return match?Number(match[1])*12+Number(match[2]):null;};
  const desired=monthIndex(date);
  for(let step=0;step<12;step++){
    const current=await month();
    if(current===desired)break;
    if(current===null||step===11)throw new ReviewRequired('public_unverified');
    const arrow=await visible(page.locator(current<desired?'a.btn_month_next':'a.btn_month_prev'));
    await arrow.click();
    await page.waitForFunction(({previous})=>{
      const match=document.querySelector('.calendar_tit')?.textContent.match(/(\d{4})\s*\.\s*(\d{1,2})/);
      return match&&Number(match[1])*12+Number(match[2])!==previous;
    },{previous:current},{timeout:4000});
  }
  const cell=await visible(page.getByRole('table',{name:'달력 테이블'}).getByRole('cell',{name:String(Number(date.slice(8))),exact:true}));
  const unavailable=(await cell.getAttribute('class')||'').split(/\s+/).includes('disable');
  if(!unavailable)await cell.click();
  return unavailable;
}
async function choose(page,entry,kind) {
  const product=page.locator('label[for="sp'+entry.product+'"]');
  await (await visible(product)).click();
  if(!await page.locator('#sp'+entry.product).isChecked())throw new ReviewRequired('public_unverified');
  const label=kind==='hourly'
    ? new RegExp('^시간 단위 예약하기\\(최소 '+entry.minimum+'시간 부터\\)$')
    : '패키지로 예약하기';
  await (await visible(page.getByText(label,{exact:true}))).click();
}
function packagePeriod(name) {
  const match=name.match(/(\d{1,2})(?::00)?\s*[~–-]\s*(\d{1,2})(?::00)?\s*시/);
  if(!match)return null;
  const start=Number(match[1]),end=Number(match[2]);
  return start<24&&end<=24&&start!==end?[start,end<start?end+24:end]:null;
}
export async function verifyPublic(host,entry) {
  const page=await host.context.newPage();
  page.setDefaultTimeout(6500);
  host.observe(page).navigate();
  try{
    await page.goto(entry.public_url,{waitUntil:'domcontentloaded'});
    await host.settle(page);
    if(entry.mode==='hourly'){
      await choose(page,entry,'hourly');await host.settle(page);
      if(!await selectDate(page,entry.date)){
        await host.settle(page);
        const actual=await page.locator('.ts-row').evaluateAll((rows,{start,end})=>rows
          .filter(row=>{const hour=Number(row.getAttribute('data-row-idx'));return hour>=start&&hour<end;})
          .map(row=>row.classList.contains('is-disabled')),{start:entry.start,end:entry.end});
        if(actual.length!==entry.end-entry.start||actual.some(x=>!x))throw new ReviewRequired('public_unverified');
      }
      if(entry.product!==140188)return;
      // One product serves both time and package sales at Gundae 1.
    }
    // Reopen before choosing a different booking style or revisiting the same day.
    host.observe(page).navigate();await page.reload({waitUntil:'domcontentloaded'});
    await host.settle(page);await choose(page,entry,'package');await host.settle(page);
    if(entry.start<7&&entry.mode!=='all_day')await checkPackages(host,page,dateAt(entry.date,-1),entry.start+24,entry.end+24,entry.mode);
    await checkPackages(host,page,entry.date,entry.start,entry.end,entry.mode);
  }catch{throw new ReviewRequired('public_unverified');}
  finally{await page.close();}
}
async function checkPackages(host,page,date,start,end,mode) {
  if(await selectDate(page,date))return;
  await host.settle(page);
  const labels=await page.locator('.reserve_time_wrap.meetspace-package a').evaluateAll(rows=>rows.map(row=>({
    name:row.firstElementChild?.textContent?.trim()||'',disabled:row.classList.contains('disable')
  })));
  if(!labels.length)throw new ReviewRequired('public_unverified');
  for(const row of labels){
    const period=mode==='all_day'?[0,24]:packagePeriod(row.name);
    if(!period)throw new ReviewRequired('public_unverified');
    if(period[0]<end&&start<period[1]&&!row.disabled)throw new ReviewRequired('public_unverified');
  }
}
