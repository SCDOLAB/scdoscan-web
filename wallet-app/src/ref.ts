/** Referrer / campaign strings. First valid value wins and is not overwritten. */

const CODE = /^[A-Za-z0-9_.-]{1,64}$/
const ADDR = /^0x[0-9a-fA-F]{40}$/

export const REF_KEY = 'scdoapp_attr_ref'
export const SRC_KEY = 'scdoapp_attr_src'

export function sanitizeRef(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = raw.trim()
  if (!s) return null
  if (ADDR.test(s)) return s.toLowerCase()
  if (CODE.test(s)) return s
  return null
}

const JOIN_HOSTS = new Set(['scdo.com.au', 'apeccapital.org'])

/**
 * Invite code from a typed value or a join link.
 * https://scdo.com.au/join, https://apeccapital.org/join, and scdowallet://join
 * contribute only their ref. Anything else that looks like a URL is rejected.
 * The result is always sanitizeRef.
 */
export function extractInviteCode(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const text = raw.trim()
  if (!text) return null
  const fromJoin = refFromJoinUrl(text)
  if (fromJoin !== undefined) return sanitizeRef(fromJoin)
  return sanitizeRef(text)
}

function refFromJoinUrl(text: string): string | null | undefined {
  if (/^scdowallet:/i.test(text)) {
    try {
      const u = new URL(text)
      const host = (u.hostname || u.pathname.replace(/^\/+/, '')).toLowerCase()
      if (host !== 'join' || u.username || u.password) return null
      return u.searchParams.get('ref')
    } catch {
      return null
    }
  }
  if (/^https?:\/\//i.test(text)) {
    try {
      const u = new URL(text)
      if (u.protocol !== 'https:' || u.username || u.password) return null
      if (!JOIN_HOSTS.has(u.hostname.toLowerCase())) return null
      const path = u.pathname.replace(/\/+$/, '') || '/'
      if (path !== '/join') return null
      return u.searchParams.get('ref')
    } catch {
      return null
    }
  }
  return undefined
}

export function sanitizeSrc(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const s = raw.trim()
  if (!s || s.length > 64) return null
  if (!CODE.test(s)) return null
  return s
}

export interface AttrStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function lockedRef(store: AttrStore): string | null {
  return sanitizeRef(store.getItem(REF_KEY))
}

export function lockedSrc(store: AttrStore): string | null {
  return sanitizeSrc(store.getItem(SRC_KEY))
}

/** Lock the first acceptable ref and src. Later values are ignored. */
export function lockAttribution(store: AttrStore, ref: string | null, src: string | null): void {
  const r = sanitizeRef(ref)
  const s = sanitizeSrc(src)
  if (r && !store.getItem(REF_KEY)) store.setItem(REF_KEY, r)
  if (s && !store.getItem(SRC_KEY)) store.setItem(SRC_KEY, s)
}
