/** Small binary helpers. No network. */

export function hexToBytes(hex: string): Uint8Array {
  let h = hex.trim().toLowerCase()
  if (h.startsWith('0x')) h = h.slice(2)
  if (h.length % 2) h = '0' + h
  if (!/^[0-9a-f]*$/.test(h)) throw new Error('bad hex')
  const out = new Uint8Array(h.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function bytesToHex(bytes: Uint8Array, prefix = true): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0')
  return prefix ? '0x' + s : s
}

export function concat(parts: Uint8Array[]): Uint8Array {
  let n = 0
  for (const p of parts) n += p.length
  const out = new Uint8Array(n)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

export function wipe(bytes: Uint8Array | null | undefined): void {
  if (bytes) bytes.fill(0)
}

function n2b(n: number | bigint): Uint8Array {
  if (typeof n === 'bigint') {
    if (n < 0n) throw new Error('negative')
    if (n === 0n) return new Uint8Array(0)
    let h = n.toString(16)
    if (h.length % 2) h = '0' + h
    return hexToBytes(h)
  }
  if (!n) return new Uint8Array(0)
  let h = n.toString(16)
  if (h.length % 2) h = '0' + h
  return hexToBytes(h)
}

function encLen(off: number, len: number): Uint8Array {
  if (len < 56) return new Uint8Array([off + len])
  const lb = n2b(len)
  const r = new Uint8Array(lb.length + 1)
  r[0] = off + 55 + lb.length
  r.set(lb, 1)
  return r
}

export type RlpItem = number | bigint | string | Uint8Array | RlpItem[] | null

/** RLP matching the live web wallet and desktop scdo.js (empty integer is 0x80). */
export function rlp(e: RlpItem): Uint8Array {
  if (e == null) return new Uint8Array(0)
  if (typeof e === 'number' || typeof e === 'bigint') return rlp(n2b(e))
  if (typeof e === 'string') {
    if (e.startsWith('0x') || e.startsWith('0X')) return rlp(hexToBytes(e))
    return rlp(new TextEncoder().encode(e))
  }
  if (e instanceof Uint8Array) {
    if (e.length === 1 && e[0] < 0x80) return e
    return concat([encLen(0x80, e.length), e])
  }
  if (Array.isArray(e)) {
    const p = concat(e.map(rlp))
    return concat([encLen(0xc0, p.length), p])
  }
  return new Uint8Array(0)
}

export function b64Encode(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
  return btoa(s)
}

export function b64Decode(s: string): Uint8Array {
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export function b64urlDecode(s: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('bad base64url')
  let t = s.replace(/-/g, '+').replace(/_/g, '/')
  while (t.length % 4) t += '='
  return b64Decode(t)
}

export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n)
  crypto.getRandomValues(out)
  return out
}

export function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}
