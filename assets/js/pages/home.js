/* 홈 */
(function(){
  var M=window.MEGASPOT;
  var pg=M.$('#purpose-grid'); if(pg){ pg.innerHTML=(window.MEGASPOT_PURPOSES||[]).map(function(p){ return M.purposeCard(p); }).join(''); }
  var fs=M.$('#featured-space'); if(fs){ var open=(window.MEGASPOT_SPACES||[]).filter(function(s){return s.status==='open';}); fs.innerHTML=open.map(function(s){ return M.spaceCard(s,{wide:true}); }).join(''); }
})();
