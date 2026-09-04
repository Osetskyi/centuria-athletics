// v7.55 Bottom navigation lowered globally
const CACHE_VERSION="centuria-pwa-v847-login-buttons";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key!==CACHE_VERSION).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener("push",event=>{
  let data={};
  try{ data=event.data ? event.data.json() : {}; }catch(_e){ data={body:event.data?.text()||""}; }
  const title=data.title||"Centuria Athletics";
  const options={
    body:data.body||"",
    icon:"/icon-192.png",
    badge:"/icon-192.png",
    tag:data.tag||"centuria",
    renotify:true,
    silent:false,
    data:{url:data.url||"/"}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const target=new URL(event.notification.data?.url||"/",self.location.origin).href;
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:"window",includeUncontrolled:true});
    for(const client of windows){
      if(client.url.startsWith(self.location.origin)){
        await client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  })());
});


// v6.52: keep navigation fresh; cache only successful same-origin static responses as fallback.
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  event.respondWith((async()=>{
    try{
      const response=await fetch(event.request,{cache:"no-store"});
      if(response && response.ok){
        const cache=await caches.open(CACHE_VERSION);
        cache.put(event.request,response.clone()).catch(()=>{});
      }
      return response;
    }catch(_e){
      const cached=await caches.match(event.request);
      if(cached) return cached;
      if(event.request.mode==="navigate") return caches.match("/");
      throw _e;
    }
  })());
});
