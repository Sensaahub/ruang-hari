const SCOPE=new URL(self.registration.scope).pathname;
const PREFIX='ruang-hari:'+SCOPE+':';
const CACHE=PREFIX+'__BUILD_VERSION__';
const FILES=__PRECACHE_FILES__;
const ASSETS=new Set(FILES.map(f=>new URL(f,self.registration.scope).pathname));
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  // Never cache authentication responses, Supabase data, or other origins.
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  if(req.mode==='navigate'&&(url.pathname===SCOPE||url.pathname===SCOPE+'index.html')){
    event.respondWith(fetch(req).catch(()=>caches.match(new URL('./index.html',self.registration.scope))));return;
  }
  if(!url.search&&ASSETS.has(url.pathname))event.respondWith(caches.open(CACHE).then(async c=>{
    try{const response=await fetch(req);if(response.ok)await c.put(req,response.clone());return response;}
    catch(error){const saved=await c.match(req);if(saved)return saved;throw error;}
  }));
});
