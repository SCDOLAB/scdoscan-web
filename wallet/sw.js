self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',e=>{e.waitUntil(self.registration.unregister().then(()=>self.clients.matchAll()).then(cs=>cs.forEach(c=>c.navigate('/wallet/'))));});
self.addEventListener('fetch',e=>{e.respondWith(fetch(e.request));});
