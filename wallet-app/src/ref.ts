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
