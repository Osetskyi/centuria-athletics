// v12.36 own favorite-club editing + no old announcements for new accounts
const CACHE_VERSION="centuria-pwa-v12360-own-club-announcement-cutoff";
const ADD_PLAYER_SCRIPT="/arena-league-add-v1231.js?v=12.36";
const ADD_PLAYER_STYLE="/arena-league-add-v1231.css?v=12.36";
const TABLE_SCRIPT="/arena-league-table-v1232.js?v=12.36";
const TABLE_STYLE="/arena-league-table-v1232.css?v=12.36";
const ACTIVE_EVENT_SCRIPT="/arena-active-event-v1233.js?v=12.36";

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

const injectArenaPatchAssetsV1236=async response=>{
  const type=String(response.headers.get("content-type")||"").toLowerCase();
  if(!response.ok || !type.includes("text/html"))return response;
  let html=await response.text();
  if(!html.includes("arena-league-add-v1231.css")){
    html=html.replace(/<\/head>/i,`<link rel="stylesheet" href="${ADD_PLAYER_STYLE}">\n</head>`);
  }
  if(!html.includes("arena-league-table-v1232.css")){
    html=html.replace(/<\/head>/i,`<link rel="stylesheet" href="${TABLE_STYLE}">\n</head>`);
  }
  if(!html.includes("arena-league-add-v1231.js")){
    html=html.replace(/<\/body>/i,`<script src="${ADD_PLAYER_SCRIPT}"></script>\n</body>`);
  }
  if(!html.includes("arena-league-table-v1232.js")){
    html=html.replace(/<\/body>/i,`<script src="${TABLE_SCRIPT}"></script>\n</body>`);
  }
  if(!html.includes("arena-active-event-v1233.js")){
    html=html.replace(/<\/body>/i,`<script src="${ACTIVE_EVENT_SCRIPT}"></script>\n</body>`);
  }
  const headers=new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  headers.set("content-type","text/html; charset=utf-8");
  headers.set("cache-control","no-cache");
  return new Response(html,{status:response.status,statusText:response.statusText,headers});
};

self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET") return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  event.respondWith((async()=>{
    try{
      let response=await fetch(event.request,{cache:"no-store"});
      if(event.request.mode==="navigate")response=await injectArenaPatchAssetsV1236(response);
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
