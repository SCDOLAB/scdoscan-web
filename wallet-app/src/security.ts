/** URL, clipboard, and idle lock. Secrets are not logged. */

const SECRET_QUERY = ['s', 'secret', 'priv', 'mnemonic', 'seed']

export function cleanUrl(href: string, route = ''): string {
  const u = new URL(href)
  for (const key of SECRET_QUERY) u.searchParams.delete(key)
  u.hash = route ? (route.startsWith('#') ? route : '#' + route) : ''
  return u.pathname + u.search + u.hash
}

export function replaceUrl(route: string): void {
  const next = cleanUrl(location.href, route)
  history.replaceState(null, '', next)
}

export async function copyText(text: string, wipeAfterMs = 0): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
  await navigator.clipboard.writeText(text)
  if (wipeAfterMs > 0) {
    window.setTimeout(() => {
      void navigator.clipboard.readText?.().then((cur) => {
        if (cur === text) return navigator.clipboard.writeText('')
      }).catch(() => {
        /* the page may not be allowed to read the clipboard; the write already happened */
      })
    }, wipeAfterMs)
  }
}

export function startIdleLock(opts: { minutes: number; onLock: () => void; isUnlocked: () => boolean }): { poke: () => void; stop: () => void } {
  let timer = 0
  const arm = () => {
    window.clearTimeout(timer)
    if (!opts.isUnlocked()) return
    const ms = Math.max(1, opts.minutes) * 60_000
    timer = window.setTimeout(() => {
      if (opts.isUnlocked()) opts.onLock()
    }, ms)
  }
  const poke = () => arm()
  const events = ['pointerdown', 'keydown', 'touchstart'] as const
  for (const ev of events) window.addEventListener(ev, poke, { passive: true })
  arm()
  return {
    poke,
    stop() {
      window.clearTimeout(timer)
      for (const ev of events) window.removeEventListener(ev, poke)
    },
  }
}

export function platformName(): 'ios' | 'android' | 'web' {
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'web'
}

export function installId(store: { getItem(k: string): string | null; setItem(k: string, v: string): void }): string {
  const key = 'scdoapp_install'
  let id = store.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    store.setItem(key, id)
  }
  return id
}
