// Older web inquiries saved the generated price breakdown without a quotes row.
// Accept only the complete hourly rental + people + cleaning format we can verify.
// These are saved amounts; this path never recalculates a current selling price.
const selected=value=>value===true||value===1||(value&&typeof value==='object'&&value.on!==false&&value.on!==0);
const savedMoney=value=>value==null||value===''||!Number.isSafeInteger(Number(value))||Number(value)<0?null:Number(value);
const won=value=>/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(value)?savedMoney(value.replaceAll(',','')):null;

export function savedCleaningEstimateQuote(booking,context) {
  const data=context?.inquiry_data,amount=booking.settlement.amount;
  if(!data||context.quote_data||context.inquiry_date!==booking.event_date||context.inquiry_space!==booking.space_id||context.event_sibling_count!==1||
    !selected(data.options?.cleaning)||Object.entries(data.options||{}).some(([key,value])=>key!=='cleaning'&&selected(value)))return null;
  if(amount==null||(data.total!=null&&savedMoney(data.total)!==amount)||typeof data.estimate!=='string'||data.estimate.length>3000)return null;
  const text=data.estimate.trim().split(/\r?\n/).map(line=>line.trimEnd());
  const header=text[0]?.match(/^\[메가스팟 건대 ([12])호 예상 금액\] .+$/);
  if(!header||booking.space_id!==(header[1]==='1'?'megaspot-gundae':'megaspot-gundae-2'))return null;
  const separators=text.flatMap((line,index)=>line==='--------------------'?[index]:[]);
  if(separators.length!==2)return null;
  const [first,last]=separators,head=text.slice(1,first);
  if(head.length<3||head.length>4||!/^인원: \d+명(?: .*)?$/.test(head[2])||(head.length===4&&!head[3].startsWith('모임: ')))return null;
  if(context.booking_headcount!=null&&Number(head[2].match(/^인원: (\d+)명/)[1])!==Number(context.booking_headcount))return null;
  const date=head[0]?.match(/^이용일: (\d{4})년 (\d{1,2})월 (\d{1,2})일(?:\([^)]*\))?(?: .*)?$/);
  if(!date||date[1]+'-'+date[2].padStart(2,'0')+'-'+date[3].padStart(2,'0')!==booking.event_date)return null;
  const time=head[1]?.match(/^시간: (\d{1,2}):([0-5]\d)\s*[–-]\s*(\d{1,2}):([0-5]\d)(?: \(.*\))?$/);
  if(!time||booking.start_h==null||booking.end_h==null||Number(time[1])+Number(time[2])/60!==Number(booking.start_h)||
    Number(time[3])+Number(time[4])/60!==Number(booking.end_h))return null;
  const tail=text.slice(last+1);
  const total=tail[0]?.match(/^합계 ([\d,]+)원 \(부가세 포함\)$/);
  if(!total||won(total[1])!==amount||!/^보증금 [\d,]+원 별도 \(이용 뒤 반환\)$/.test(tail[1]||'')||tail.slice(2).some(line=>!line.startsWith('※ ')))return null;
  const lines=[];let rental=false,people=false,cleaning=false;
  for(const line of text.slice(first+1,last)) {
    let match;
    if((match=line.match(/^공간료 ([\d,]+)원$/))) {
      if(rental)return null;rental=true;lines.push({label:'공간 대관료',amount:won(match[1])});
    }else if((match=line.match(/^인원 추가 \d+명 × [\d,]+원 = ([\d,]+)원$/))) {
      if(people)return null;people=true;lines.push({label:'추가 인원',amount:won(match[1])});
    }else if((match=line.match(/^뒷정리·청소 지원 1회 = ([\d,]+)원$/))) {
      if(cleaning)return null;cleaning=true;lines.push({label:'청소 지원',amount:won(match[1])});
    }else if(rental&&/^  · (?:(?:아침|낮|저녁|심야|새벽) (?:다음 날 )?\d{2}:[0-5]\d[–-](?:다음 날 )?\d{2}:[0-5]\d \d+(?:\.\d+)?시간 × [\d,]+원|(?:기본 인원 가산액\(\d+명 포함 · 1건당\)|성수기 포함 인원 \d+명 가산) [\d,]+원)$/.test(line)) {
      // Hour-band rates and the included-person surcharge explain the space fee.
    }else return null;
  }
  if(!rental||!cleaning||lines.some(line=>line.amount==null)||lines.reduce((sum,line)=>sum+line.amount,0)!==amount)return null;
  return {total:amount,subtotal:amount,discount:0,lines,extras:[],options:data.options,source:'inquiry-estimate'};
}
