const CACHE_VERSION="centuria-push-v1";
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));

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
