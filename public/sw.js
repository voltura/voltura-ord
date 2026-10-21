// Notifications only: never intercept or cache private game requests.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
  let data={};try{data=event.data?.json() || {};}catch{/* Show a useful fallback. */}
  const url=typeof data.url==='string' && /^\/#game=[0-9a-f-]{36}$/i.test(data.url)?data.url:'/';
  event.waitUntil(self.registration.showNotification('Voltura Ord',{
    body:typeof data.body==='string'?data.body:'Din match har uppdaterats. Öppna spelet.',
    icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',
    tag:typeof data.tag==='string'?data.tag:'voltura-ord',data:{url},
  }));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const url=new URL(event.notification.data?.url || '/',self.location.origin);
    if(url.origin!==self.location.origin)return;
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if(new URL(client.url).origin!==url.origin)continue;
      // Reload so an already-open app handles the match fragment as a fresh launch.
      try{const navigated=await client.navigate(url.href);if(navigated){await navigated.focus();return;}}catch{/* A suspended window may no longer be available. */}
    }
    await self.clients.openWindow(url.href);
  })());
});
