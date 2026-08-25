/* 밤톨이 서비스워커 — 앱 셸 오프라인 캐시(외부 API는 항상 네트워크) */
var CACHE='bamtol-v1';
var SHELL=['./','./index.html','./app.js','./coin.html','./manifest.json',
  './icon-192.png','./icon-512.png','./icon-maskable.png','./apple-touch-icon.png'];

self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(SHELL);}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){
    return Promise.all(ks.map(function(k){ if(k!==CACHE)return caches.delete(k); }));
  }).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  if(e.request.method!=='GET')return;
  var u=new URL(e.request.url);
  if(u.origin!==location.origin)return; // 외부(Binance·KIS 등)는 브라우저 기본 처리
  e.respondWith(
    fetch(e.request).then(function(r){
      var cp=r.clone(); caches.open(CACHE).then(function(c){c.put(e.request,cp);}); return r;
    }).catch(function(){
      return caches.match(e.request).then(function(m){ return m||caches.match('./index.html'); });
    })
  );
});
