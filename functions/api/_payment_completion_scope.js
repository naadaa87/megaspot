// Conservative completion classification shared by one-time migration and receipt inference.
export function completionScopeSql(data='i.data',ref='i.ref',booking='b.booking_code',bookingAmount='b.amount'){
 const d=`(CASE WHEN json_valid(${data}) THEN ${data} ELSE '{}' END)`;
 const active=k=>`(COALESCE(json_type(${d},'$.${k}'),'')='object' AND COALESCE(json_extract(${d},'$.${k}.removed'),0)=0 AND COALESCE(json_extract(${d},'$.${k}.status'),'pending')<>'cancelled')`;
 const price=k=>k==='cocktail'?`CASE WHEN json_extract(${d},'$.cocktail.vat_excluded')=1 THEN json_extract(${d},'$.cocktail.total') ELSE json_extract(${d},'$.cocktail.price') END`:`json_extract(${d},'$.${k}.total')`;
 const known=k=>`(${active(k)} AND json_extract(${d},'$.${k}.status') IN ('confirmed','ordered','completed') AND (${price(k)})>0 AND json_extract(${d},'$.included_${k}_amount')=(${price(k)}))`;
 const keys=['catering','reception','cocktail'],any=keys.map(active).join(' OR '),all=keys.map(k=>`(NOT ${active(k)} OR ${known(k)})`).join(' AND ');
 const external=`SELECT 1 FROM catering_orders co WHERE (co.inquiry_ref=${ref} OR co.booking_code=${booking}) AND co.status<>'cancelled' AND COALESCE(json_extract(CASE WHEN json_valid(co.data) THEN co.data ELSE '{}' END,'$.removed'),0)=0`;
 const unmatched=`EXISTS(${external} AND NOT(COALESCE(json_extract(${d},'$.catering.order_ref'),'')=co.ref AND ${known('catering')} AND json_extract(${d},'$.catering.total')=co.total))`;
 const foodTotal=keys.map(k=>`CASE WHEN ${active(k)} THEN COALESCE((${price(k)}),0) ELSE 0 END`).join('+');
 const covers=`CAST(COALESCE(${bookingAmount},json_extract(${d},'$.total')) AS REAL)>=(${foodTotal})`;
 const text=`COALESCE(json_extract(${d},'$.message'),'')||COALESCE(json_extract(${d},'$.summary'),'')`;
 const mentions=['뷔페','케이터링','칵테일'].map(k=>`instr((${text}),'${k}')>0`).join(' OR ');
 const extras=`EXISTS(SELECT 1 FROM json_each(CASE WHEN json_type(${d},'$.quote_input.extras')='array' THEN json_extract(${d},'$.quote_input.extras') ELSE '[]' END) ex WHERE json_extract(CASE WHEN json_valid(ex.value) THEN ex.value ELSE '{}' END,'$.kind') IN ('catering','reception','cocktail'))`;
 const invalid=keys.map(k=>`(json_type(${d},'$.${k}') IS NOT NULL AND json_type(${d},'$.${k}') NOT IN ('null','object'))`).join(' OR ');
 return `CASE WHEN (${invalid}) THEN 'needs_review' WHEN ${ref} IS NULL OR NOT json_valid(${data}) THEN 'needs_review' WHEN (${any}) AND (${all}) AND (${covers}) AND NOT ${unmatched} THEN 'fully_paid' WHEN NOT(${any}) AND NOT EXISTS(${external}) AND NOT(${mentions}) AND NOT ${extras} THEN 'venue_fully_paid' ELSE 'needs_review' END`;
}
