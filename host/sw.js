/* 메가스팟 호스트센터 — 홈 화면 앱(PWA)용 서비스 워커 (범위: /host/)
   하는 일은 하나뿐입니다: 인터넷이 끊겼을 때 호스트센터 화면 대신 '연결 끊김' 안내를 보여 줍니다.
   데이터(/api/)와 다른 파일은 저장하지 않고 늘 서버에서 새로 받습니다. 그래서 예전 화면이 남아 있는 문제가 생기지 않습니다. */
var CACHE = 'megaspot-host-v1', OFFLINE = '/host/offline.html';
self.addEventListener('install', function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){ return c.addAll([OFFLINE, '/assets/img/brand/host-app-192.png']); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){ return Promise.all(keys.filter(function(k){ return k.indexOf('megaspot-host-')===0 && k!==CACHE; }).map(function(k){ return caches.delete(k); })); }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var r=e.request; if(r.method!=='GET' || r.mode!=='navigate') return;   // 화면 이동만 다룹니다
  e.respondWith(fetch(r).catch(function(){ return caches.match(OFFLINE); }));
});
