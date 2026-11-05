/* A saved calculation is described by its own line items, never today's price table. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MEGASPOT_QUOTE_CALCULATION=factory();
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  var names={'megaspot-gundae':'메가스팟 건대 1호','megaspot-gundae-2':'메가스팟 건대 2호'};
  function money(value){return Math.round(Number(value)||0).toLocaleString('ko-KR')+'원';}
  function text(snapshot,context){
    context=context||{};snapshot=snapshot||{};
    if(!Array.isArray(snapshot.lines)||!snapshot.lines.length||snapshot.total==null||!Number.isFinite(Number(snapshot.total)))return '';
    var input=snapshot.input||{},space=context.space||input.space||snapshot.space;
    var name=context.spaceName||names[space]||snapshot.spaceName||'메가스팟',lines=[];
    lines.push('['+name+' 견적 계산 내역]'+(snapshot.version?' '+snapshot.version:''));
    var date=snapshot.date||input.date;if(date)lines.push('이용일: '+date+(snapshot.colLabel?' · '+snapshot.colLabel+' 요금':''));
    if(snapshot.range)lines.push('시간: '+snapshot.range);
    var people=snapshot.people??input.people;if(people!=null)lines.push('인원: '+people+'명');
    if(snapshot.purpose)lines.push('모임: '+snapshot.purpose);
    lines.push('--------------------');
    snapshot.lines.forEach(function(row){
      if(!row||typeof row!=='object')return;
      lines.push((row.label||'항목')+' '+money(row.amount));
      if(row.desc)lines.push('  · '+row.desc);
    });
    if(snapshot.discount||snapshot.extras?.length){
      if(snapshot.subtotal!=null)lines.push('요금표 기준 금액 '+money(snapshot.subtotal));
      if(snapshot.discount)lines.push((snapshot.discountLabel||'할인')+' −'+money(snapshot.discount)+(snapshot.discountWhy?' ('+snapshot.discountWhy+')':''));
      (snapshot.extras||[]).forEach(function(row){if(row&&typeof row==='object')lines.push((row.label||'추가 항목')+' '+money(row.amount));});
    }
    String(input.note||'').split('\n').filter(function(line){return /^케이터링 (?:상태|상담 필요): /.test(line);}).forEach(function(line){lines.push(line);});
    lines.push('--------------------','합계 '+money(snapshot.total)+(snapshot.taxNote?' ('+snapshot.taxNote+')':''));
    if(snapshot.deposit!=null)lines.push('보증금 '+money(snapshot.deposit)+' 별도 (이용 뒤 반환)');
    return lines.join('\n');
  }
  function inquiry(item,quotes){
    var data=item.data||{},saved=(quotes||[]).find(function(q){return q.quote_no===data.quote_no;});
    // Keep issued quotes immutable; the inquiry describes its current saved food draft.
    var snapshot=saved&&saved.data,draft=data.quote_input,total=item.effective_amount??data.total;
    if(data.amount_mode==='quote'&&snapshot&&draft&&Array.isArray(draft.extras)&&total!=null&&Number.isFinite(Number(total))){
      var sum=function(rows){return (Array.isArray(rows)?rows:[]).reduce(function(n,row){return n+(Number(row&&row.amount)||0);},0);};
      // A booking cancellation/settlement amount is not a new space quote.
      if(Number(snapshot.total)-sum(snapshot.extras)+sum(draft.extras)===Number(total))snapshot=Object.assign({},snapshot,{input:draft,extras:draft.extras,total:Number(total)});
    }
    var calculation=data.amount_mode==='quote'&&saved?text(snapshot):'';
    return {text:calculation||data.estimate||'',fromQuote:!!calculation,admin:!!calculation||data.source==='admin'||!!data.estimate_admin,
      customerOriginal:data.estimate_customer||(calculation&&data.source!=='admin'&&!data.estimate_admin?data.estimate||'':'')};
  }
  return {text:text,inquiry:inquiry};
});
