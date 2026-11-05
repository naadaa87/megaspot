/* Public selling prices only. Supplier costs never enter this module. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.MEGASPOT_FOOD_PRICING=factory();})(typeof window!=='undefined'?window:globalThis,function(){
 function apply(service,data,config){if(!config||!config.prices)return data;var p=config.prices;
 function value(key,old){return Number.isSafeInteger(p[key])&&p[key]>=0?p[key]:old;}
 if(service==='catering'){data.courses.forEach(function(c){if(c.kind==='flat')c.tiers.forEach(function(t){t.price=value('course.'+c.id+'.'+t.people,t.price);});else c.price=value('course.'+c.id,c.price);});data.bbq.rows.forEach(function(b){b.price=value('bbq.'+b.id,b.price);});data.beer.price=value('beer',data.beer.price);data.delivery.fee=value('delivery',data.delivery.fee);}
 else{data.courses.forEach(function(c){c.price=value('course.'+c.id,c.price);});if(data.course)data.course.price=value('course.'+data.course.id,data.course.price);Object.keys(data.feesByFormat).forEach(function(f){data.feesByFormat[f].forEach(function(b){b.price=value('fee.'+f+'.'+b.upto,b.price);});});}
 if(service==='reception'&&data.activeCatalog){data.activeCatalog.offerings.forEach(function(c){var v=p['course.'+c.id];if(v===null||Number.isSafeInteger(v)&&v>0)c.price=v;});if(data.activeCatalog.tableFeeIncrement){var step=p['fee.cf-table.step50'];if(step===null||Number.isSafeInteger(step)&&step>=0)data.activeCatalog.tableFeeIncrement.price=step;}Object.keys(data.activeCatalog.feesByFormat).forEach(function(f){data.activeCatalog.feesByFormat[f].forEach(function(b){var v=p['fee.cf-'+f+'.'+b.upto];if(v===null||Number.isSafeInteger(v)&&v>=0)b.price=v;});});}
 data.pricing_revision=config.revision||0;return data;}
 return {apply:apply};});
