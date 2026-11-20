import { ReviewRequired, memoFor, validatedEntry } from './guard.mjs';
import { calendarGridDates, parseCalendarEntry } from './calendar.mjs';

const previousDate=date=>new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10);
const monthOf=date=>date.slice(0,7).replace('-','.');
const numberOfMonth=month=>Number(month.slice(0,4))*12+Number(month.slice(5,7));
const normalize=text=>text.replace(/\s+/g,' ').trim();

export class SpacecloudReadiness {
  constructor(page,{now=()=>Date.now(),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),quietMs=750,timeoutMs=15000,report=()=>{}}={}) {
    this.now=now;this.pause=pause;this.quietMs=quietMs;this.timeoutMs=timeoutMs;this.epoch=0;this.version=0;this.pending=new Set();this.tracked=new WeakMap();this.failed=false;this.lastActivity=now();this.report=report;this.reported=0;this.navigating=false;
    const relevant=request=>{try{const url=new URL(request.url());return url.protocol==='https:' && (url.hostname==='spacecloud.kr' || url.hostname.endsWith('.spacecloud.kr')) && ['document','xhr','fetch'].includes(request.resourceType());}catch{return false;}};
    page.on('framenavigated',frame=>{if(this.navigating && frame===page.mainFrame()){this.epoch++;this.pending.clear();this.failed=false;this.version++;this.lastActivity=this.now();this.navigating=false;}});
    page.on('request',request=>{if(this.navigating || !relevant(request))return;const headers=request.headers();if(headers.purpose==='prefetch'||headers['next-router-prefetch'])return;this.tracked.set(request,this.epoch);this.pending.add(request);this.version++;this.lastActivity=this.now();});
    const finish=async(request,failed)=>{
      if(this.tracked.get(request)!==this.epoch || !this.pending.has(request))return;
      let status=null,failure=failed?'network-error':'missing-response';
      if(!failed){try{const response=await request.response();status=response?response.status():null;failed=!response || status>=400;failure=response?'http-error':'missing-response';}catch{failed=true;}}
      else {try{const reason=request.failure()?.errorText;const known=['net::ERR_ABORTED','net::ERR_FAILED','net::ERR_TIMED_OUT','net::ERR_CONNECTION_RESET','net::ERR_CONNECTION_CLOSED','net::ERR_NAME_NOT_RESOLVED'];if(known.includes(reason))failure=reason;}catch{}}
      if(this.tracked.get(request)!==this.epoch)return;
      this.pending.delete(request);this.failed ||= failed;this.version++;this.lastActivity=this.now();
      if(failed && this.reported++<3){try{this.report({status,failure});}catch{}}
    };
    page.on('requestfinished',request=>{void finish(request,false);});
    page.on('requestfailed',request=>{void finish(request,true);});
  }
  navigate(){this.epoch++;this.pending.clear();this.failed=false;this.reported=0;this.version++;this.lastActivity=this.now();this.navigating=true;}
  changed(){this.lastActivity=this.now();}
  async settle(){
    const deadline=this.now()+this.timeoutMs;
    while(this.now()<deadline){
      if(this.failed)throw new ReviewRequired('스페이스클라우드 일정 조회에 실패하여 최신 상태를 확인하지 못했습니다.');
      if(!this.navigating && !this.pending.size && this.now()-this.lastActivity>=this.quietMs)return this.version;
      await this.pause(100);
    }
    throw new ReviewRequired('스페이스클라우드 일정 조회가 끝나지 않아 최신 상태 확인을 중단했습니다.');
  }
}

export class SpacecloudUI {
  constructor(context) {this.context=context;this.readiness=new WeakMap();}
  async initialize() {
    this.host=await this.context.newPage();
    this.host.setDefaultTimeout(6500);
    this.observe(this.host);
  }
  observe(page){let state=this.readiness.get(page);if(!state){state=new SpacecloudReadiness(page,{report:diagnostic=>this.reportReview?.(diagnostic)});this.readiness.set(page,state);}return state;}
  async click(locator,label='화면 조작') {
    // Responsive layouts can retain hidden copies. Only one visible target may receive input.
    const target=locator.filter({visible:true});
    const count=await target.count();
    if(count!==1 || !await target.isVisible()) throw new ReviewRequired(label+': 보이는 조작 대상이 '+count+'개여서 중단했습니다.');
    await target.scrollIntoViewIfNeeded();
    const box=await target.boundingBox();if(!box) throw new ReviewRequired('화면의 조작 대상을 확인하지 못했습니다.');
    const page=target.page(),state=this.readiness.get(page);if(state)state.changed();
    await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  }
  async settle(page) {
    // First-party calendar requests and visible DOM are authoritative; analytics are unrelated.
    return this.observe(page).settle();
  }
  async openHost(entry) {
    this.entry=validatedEntry(entry);
    this.observe(this.host).navigate();
    await this.host.goto(this.entry.host_url,{waitUntil:'domcontentloaded'});
    if (!new URL(this.host.url()).pathname.startsWith('/reservation-calendar')) {
      throw new ReviewRequired('login_required');
    }
    try {
      await this.host.getByRole('heading',{name:this.entry.heading,exact:true}).waitFor({state:'visible'});
      await this.host.locator('.booking_wrap').first().waitFor({state:'visible'});
    } catch (error) {
      if (/로그인|sign in/i.test(await this.host.title()) || new URL(this.host.url()).pathname.includes('login')) {
        throw new ReviewRequired('login_required');
      }
      throw error;
    }
    await this.settle(this.host);
    await this.checkSelectedProduct();
  }
  async checkSelectedProduct() {
    const selection=await this.host.locator('select').evaluateAll(nodes=>nodes.slice(0,2).map(node=>node.value));
    if(selection[0]!==String(this.entry.space)||selection[1]!==String(this.entry.product)) {
      throw new ReviewRequired('host_unavailable');
    }
  }
  async hostMonth() {
    const text=normalize(await this.host.locator('a[title="달력레이어 팝업 열림"] em').innerText());
    const match=text.match(/^(\d{4})\.(\d{1,2})$/);
    if(!match)throw new ReviewRequired('host_unavailable');
    return match[1]+'.'+match[2].padStart(2,'0');
  }
  async moveHostMonth(date) {
    for(let tries=0;tries<15;tries++) {
      const current=await this.hostMonth(),target=monthOf(date);
      if(current===target) return;
      const direction=numberOfMonth(target)>numberOfMonth(current)?'다음달':'이전달';
      await this.click(this.host.getByText(direction,{exact:true}),'호스트 달력 월 이동');
      await this.host.waitForFunction(({selector,current})=>{const text=document.querySelector(selector)?.textContent.trim();return !!text && text.split('.')[0]+'.'+text.split('.')[1]?.padStart(2,'0')!==current;},{selector:'a[title="달력레이어 팝업 열림"] em',current});
      await this.settle(this.host);
    }
    throw new ReviewRequired('호스트 달력의 날짜 이동을 완료하지 못했습니다.');
  }
  async dateCell(date) {
    await this.moveHostMonth(date);
    const cells=this.host.locator('.booking_wrap');
    const labels=await cells.locator('span.date').allTextContents();
    const dates=calendarGridDates(await this.hostMonth(),labels.map(normalize));
    const index=dates.indexOf(date);
    if(index<0 || dates.indexOf(date,index+1)>=0) throw new ReviewRequired('달력에서 이용일을 확인하지 못했습니다.');
    return cells.nth(index);
  }
  async readDate(date) {
    const cell=await this.dateCell(date);
    const version=await this.settle(this.host);
    let entries=await cell.locator('.booking_list li').evaluateAll(nodes=>nodes.map((node,index)=>{
      const a=node.querySelector('a');
      return {index,text:a?.textContent?.replace(/\s+/g,' ').trim()||'',href:a?.getAttribute('href')||'',hours:a?[...a.querySelectorAll('em')].map(em=>em.textContent.trim()):[]};
    }));
    const settled=await this.settle(this.host);
    if(settled!==version) {
      const refreshed=await this.dateCell(date);
      entries=await refreshed.locator('.booking_list li').evaluateAll(nodes=>nodes.map((node,index)=>{const a=node.querySelector('a');return {index,text:a?.textContent?.replace(/\s+/g,' ').trim()||'',href:a?.getAttribute('href')||'',hours:a?[...a.querySelectorAll('em')].map(em=>em.textContent.trim()):[]};}));
      if(await this.settle(this.host)!==settled)throw new ReviewRequired('일정 조회 중 내용이 변경되어 다시 확인이 필요합니다.');
    }
    if(entries.length>300 || entries.some(e=>!e.text)) throw new ReviewRequired('예약 목록 구조를 확인하지 못했습니다.');
    return entries.map(e=>parseCalendarEntry(date,e));
  }
  async recordsFor(date) {
    // A full reload prevents reusing a previously rendered, stale calendar.
    await this.openHost(this.entry);
    const records=[...await this.readDate(previousDate(date)),...await this.readDate(date)];
    for(let i=0;i<records.length;i++) {
      if(records[i].name===this.entry?.marker) records[i]=await this.readOwnedDetail(records[i]);
    }
    return records;
  }
  async ownedPopup(record) {
    const cell=await this.dateCell(record.source.date);
    const entries=cell.locator('.booking_list li a');
    const entry=entries.nth(record.source.index);
    if(normalize(await entry.innerText())!==record.source.text || await entry.getAttribute('href')) throw new ReviewRequired('대상 외부 예약의 표식이 변경되었습니다.');
    await this.click(entry,'외부예약 상세 열기');
    const popup=this.host.locator('.layer_popup.reservation_state._popup4:visible');
    await popup.waitFor({state:'visible'});
    if(normalize(await popup.locator('.pop_header.type5').innerText())!=='직접 추가한 예약 건입니다.') throw new ReviewRequired('직접 등록한 외부 예약이 아닙니다.');
    const title=normalize(await popup.locator('article .title').innerText());
    if(!title.includes(this.entry.product_name)) throw new ReviewRequired('외부 예약의 방이 일치하지 않습니다.');
    return popup;
  }
  async readOwnedDetail(record,leaveOpen=false) {
    const popup=await this.ownedPopup(record),lines=(await popup.locator('ul.list_detail > li').allTextContents()).map(normalize);
    const nameLine=lines.find(x=>/^예약자명\s*:/.test(x)),period=lines.find(x=>/^예약내용\s*:/.test(x));
    const match=period?.match(/(\d{4})\.(\d{2})\.(\d{2})\([^)]*\),\s*(\d{1,2}):(\d{2})\s*~\s*(\d{1,2}):(\d{2})/);
    if(!nameLine || !match) throw new ReviewRequired('외부 예약 상세의 날짜와 시간을 확인하지 못했습니다.');
    const date=match[1]+'-'+match[2]+'-'+match[3],start_min=Number(match[4])*60+Number(match[5]);
    let end_min=Number(match[6])*60+Number(match[7]);if(end_min<start_min || (end_min===0&&record.end_min===1440))end_min+=1440;
    const memo=normalize(await popup.locator('.list_memo > div').innerText());
    const result={...record,date,start_min,end_min,name:nameLine.replace(/^예약자명\s*:\s*/,''),memo,manual:true};
    if(!leaveOpen) {
      const close=popup.locator('a').filter({hasText:/^\s*(닫기|확인|레이어팝업닫기)\s*$/}).filter({visible:true});
      if(await close.count()===1) await this.click(close);
      else {
        // Leaving the detail via a fresh calendar navigation is read-only and deterministic.
        await this.openHost(this.entry);
      }
    }
    return result;
  }
  async chooseFormDate(date) {
    await this.click(this.host.locator('#_dpicker1 a._miniCalOpen'),'예약 날짜 선택기 열기');
    const wrap=this.host.locator('.calendar_wrap:visible').filter({has:this.host.getByRole('table',{name:'달력 월간 테이블'})});
    await wrap.waitFor({state:'visible'});
    for(let tries=0;tries<15;tries++) {
      const parts=(await wrap.locator('.calendar_tit strong em').allTextContents()).map(normalize);
      const month=parts.length===2?parts[0]+'.'+parts[1].padStart(2,'0'):'';
      if(!/^\d{4}\.\d{2}$/.test(month)) throw new ReviewRequired('날짜 선택 창의 기준 월을 확인하지 못했습니다.');
      const target=monthOf(date);if(month===target)break;
      await this.click(wrap.locator(numberOfMonth(target)>numberOfMonth(month)?'.btn_month_next':'.btn_month_prev'),'예약 날짜 선택기 월 이동');
      await this.host.waitForFunction(({month})=>[...document.querySelectorAll('.calendar_wrap')].filter(e=>e.getBoundingClientRect().width).some(e=>{const p=[...e.querySelectorAll('.calendar_tit strong em')].map(n=>n.textContent.trim());return p.length===2 && p[0]+'.'+p[1].padStart(2,'0')!==month;}),{month});
      if(tries===14)throw new ReviewRequired('날짜 선택 창의 이동을 완료하지 못했습니다.');
    }
    const table=wrap.getByRole('table',{name:'달력 월간 테이블'}),cells=table.locator('tbody td');
    const labels=(await cells.allTextContents()).map(normalize);
    const dates=calendarGridDates(monthOf(date),labels);
    const index=dates.indexOf(date);
    if(index<0)throw new ReviewRequired('날짜 선택 창의 이용일을 확인하지 못했습니다.');
    const anchor=cells.nth(index).locator('a');
    if(await anchor.count()!==1 || !/^\d{1,2}$/.test(normalize(await anchor.innerText())) || Number(await anchor.innerText())!==Number(date.slice(8)))throw new ReviewRequired('날짜 선택 창의 이용일이 선택 가능한 상태가 아닙니다.');
    await this.click(anchor,'예약 날짜 선택');
    const value=await this.host.locator('#start_day').inputValue();
    if(value.replace(/[^0-9]/g,'')!==date.replaceAll('-','')) throw new ReviewRequired('외부 예약 양식의 날짜가 일치하지 않습니다.');
  }
  async createSegment(segment) {
    if(!this.beforeWrite)throw new ReviewRequired('외부 예약 쓰기가 비활성 상태입니다.');
    await this.click(this.host.getByText('예약추가',{exact:true}),'외부예약 추가 열기');
    await this.host.locator('#reserve_name').waitFor({state:'visible'});
    await this.chooseFormDate(segment.date);
    await this.host.locator('#shour').selectOption({label:`${segment.start_min/60} 시`});
    await this.host.locator('#ehour').selectOption({label:`${segment.end_min/60} 시`});
    await this.host.locator('#slct-repeatType').selectOption('-1');
    const allDay=this.host.locator('#chk_repeat');if(await allDay.isChecked())await allDay.uncheck();
    await this.host.locator('#reserve_name').fill(segment.marker);
    await this.host.locator('#reserve_memo').fill(memoFor(segment));
    await this.host.locator('#reserve_tel').fill('');
    if(await this.host.locator('#reserve_name').inputValue()!==segment.marker
      ||await this.host.locator('#reserve_memo').inputValue()!==memoFor(segment))throw new ReviewRequired('외부 예약 표식 입력을 확인하지 못했습니다.');
    await this.checkSelectedProduct();
    const hours=await this.host.locator('#shour,#ehour').evaluateAll(nodes=>nodes.map(el=>el.selectedOptions[0]?.textContent.trim()));
    if(hours[0]!==segment.start_min/60+' 시'||hours[1]!==segment.end_min/60+' 시')throw new ReviewRequired('host_unavailable');
    await this.beforeWrite();
    await this.click(this.host.locator('a#_addExternalSchedule'),'외부예약 등록 확인');
    await this.host.locator('#reserve_name').waitFor({state:'hidden'});
  }
  async removeSegment(segment,record) {
    if(!this.beforeWrite)throw new ReviewRequired('외부 예약 쓰기가 비활성 상태입니다.');
    const checked=await this.readOwnedDetail(record,true);
    if(checked.name!==segment.marker || checked.memo!==memoFor(segment) || checked.date!==segment.date
      ||checked.start_min!==segment.start_min ||checked.end_min!==segment.end_min)throw new ReviewRequired('해제할 외부 예약의 정보가 다릅니다.');
    const popup=this.host.locator('.layer_popup.reservation_state._popup4:visible');
    await this.click(popup.locator('a.btn_negative').filter({hasText:/^\s*예약\s*삭제\s*$/}),'자체 외부예약 삭제 요청');
    const confirm=this.host.locator('.layer_popup.confirm:visible').filter({has:this.host.getByText('예약을 삭제하시겠습니까?',{exact:true})});
    await confirm.waitFor({state:'visible'});
    await this.checkSelectedProduct();
    await this.beforeWrite();
    await this.click(confirm.getByText('확인',{exact:true}),'자체 외부예약 삭제 확인');
    await confirm.waitFor({state:'hidden'});
  }
}
