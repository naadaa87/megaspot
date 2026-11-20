// Visible SpaceCloud products for the two MegaSpot venues.
export const targets = Object.freeze({
  140188:{space:81999,product_name:'메가스팟 시간단위',heading:'건대파티룸 190평,200명 대형, 메가스팟 시간단위',mode:'hourly',minimum:3},
  110429:{space:67179,product_name:'건대2호점 시간단위 대관',heading:'건대파티룸 360평,350명 대형, 건대2호점 시간단위 대관',mode:'hourly',minimum:1},
  110782:{space:67179,product_name:'건대2호점 낮올나잇 대관',heading:'건대파티룸 360평,350명 대형, 건대2호점 낮올나잇 대관',mode:'split'},
  110785:{space:67179,product_name:'건대2호점 올데이 전체대관',heading:'건대파티룸 360평,350명 대형, 건대2호점 올데이 전체대관',mode:'all_day'},
});

export class ReviewRequired extends Error {}
export const dateAt = (date, offset) => new Date(Date.parse(date+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
export const memoFor = segment => '메가스팟 홈페이지 확정 예약 · '+segment.marker;
export function validatedEntry(entry) {
  const target=targets[entry?.product];
  if(!target)throw new ReviewRequired('host_unavailable');
  const host_url=`https://partner.spacecloud.kr/reservation-calendar?product=${entry.product}&space=${target.space}`;
  const public_url=`https://www.spacecloud.kr/space/${target.space}`;
  if(!['block','release'].includes(entry.action)||!/^MSWEB-[A-F\d]{16}$/.test(entry.marker)||
    !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)||Number.isNaN(Date.parse(entry.date+'T00:00:00Z'))||dateAt(entry.date,0)!==entry.date||
    !Number.isInteger(entry.start)||!Number.isInteger(entry.end)||entry.start<0||entry.end>24||entry.start>=entry.end||
    entry.host_url!==host_url||entry.public_url!==public_url)throw new ReviewRequired('host_unavailable');
  return {...entry,...target,host_url,public_url,start_min:entry.start*60,end_min:entry.end*60};
}
const absolute=(x,key)=>Date.parse(x.date+'T00:00:00Z')/60000+x[key];
const overlaps=(a,b)=>absolute(a,'start_min')<absolute(b,'end_min')&&absolute(b,'start_min')<absolute(a,'end_min');
export function inspect(records,target) {
  const marked=records.filter(x=>x.name===target.marker||x.memo===memoFor(target));
  const own=marked.filter(x=>x.manual&&x.name===target.marker&&x.memo===memoFor(target)&&x.date===target.date&&
    x.start_min===target.start_min&&x.end_min===target.end_min);
  if(marked.length!==own.length||own.length>1)throw new ReviewRequired('unknown_result');
  return {own:own[0],conflict:records.some(x=>x!==own[0]&&overlaps(x,target))};
}
