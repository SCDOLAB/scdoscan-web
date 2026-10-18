/* SCDO wallet service worker. It may only control /wallet/app/. */
const SCOPE = '/wallet/app/'
const CACHE = 'scdo-wallet-app-v1'
const ASSETS = []

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => (ASSETS.length ? cache.addAll(ASSETS) : Promise.resolve()))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (!url.pathname.startsWith(SCOPE)) return
  if (url.pathname === SCOPE + 'sw.js') return
  const hashed = url.pathname.startsWith(SCOPE + 'assets/')
  event.respondWith(hashed ? cacheFirst(req) : networkFirst(req))
})

async function networkFirst(req) {
  const cache = await caches.open(CACHE)
  try {
    const res = await fetch(req)
    if (res && res.ok) await cache.put(req, res.clone())
    return res
  } catch (err) {
    const hit = (await cache.match(req)) || (await cache.match(SCOPE + 'index.html')) || (await cache.match(SCOPE))
    if (hit) return hit
    throw err
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  const res = await fetch(req)
  if (res && res.ok) await cache.put(req, res.clone())
  return res
}
