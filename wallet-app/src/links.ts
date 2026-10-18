/**
 * One parser for EIP-681, scdowallet:// and https pay / join / invite links.
 * TON links are recognised and handed off; this wallet does not hold TON keys.
 */
import { b64urlDecode, hexToBytes } from './bytes'
import { CHAIN_ID, INVITE_REGISTRY, tokenByAddress, tokenBySymbol, type Shard } from './chains'
import { toChecksum } from './derive'
import { sanitizeRef, sanitizeSrc } from './ref'

/** Hosts this app may put in a link it creates. Legacy QR hosts are not in this list. */
const LINK_ORIGINS = ['https://scdo.com.au', 'https://apeccapital.org']

/**
 * Read-only recognition of old pay and wallet QR codes.
 * The hostname is matched as text. This module never calls fetch.
 */
const LEGACY_QR_HOST = 'scdoscan.io'

const MEMO_MAX = 100
const AMOUNT_MAX_INT = 12

export type ParseResult =
  | { ok: true; link: ParsedLink; ref: string | null; src: string | null }
  | { ok: false; code: string; message: string }

export type ParsedLink =
  | { kind: 'none' }
  | { kind: 'pay'; to: string; token: string; units: bigint; amount: string; memo: string; chainId: number }
  | { kind: 'join' }
  | { kind: 'invite'; secret: Uint8Array; contract: `0x${string}`; chainId: number }
  | { kind: 'send'; to: string; amount: string; token: string; shard: Shard }
  | { kind: 'ton'; uri: string }

function fail(code: string, message: string): ParseResult {
  return { ok: false, code, message }
}

function checkAddress(s: string | null): string {
  const v = String(s ?? '').trim()
  if (!v) throw Object.assign(new Error('Recipient address is missing'), { code: 'to_missing' })
  if (/^[1-4]S[0-9a-fA-F]{40}$/.test(v)) throw Object.assign(new Error('Classic address'), { code: 'to_1s' })
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw Object.assign(new Error('Bad address'), { code: 'to_format' })
  if (/^0x0{40}$/i.test(v)) throw Object.assign(new Error('Zero address'), { code: 'to_zero' })
  const body = v.slice(2)
  const summed = toChecksum(v)
  if (/[a-f]/.test(body) && /[A-F]/.test(body) && summed !== v) {
    throw Object.assign(new Error('Bad checksum'), { code: 'to_checksum' })
  }
  return summed
}

function checkMemo(m: string | null): string {
  const v = String(m ?? '').normalize('NFC').trim()
  if (!v) return ''
  if ([...v].length > MEMO_MAX) throw Object.assign(new Error('Memo too long'), { code: 'memo_long' })
  if (/[\u0000-\u001f\u007f-\u009f]/.test(v)) throw Object.assign(new Error('Memo characters'), { code: 'memo_chars' })
  if (/[<>"`\\{}]/.test(v)) throw Object.assign(new Error('Memo characters'), { code: 'memo_chars' })
  return v
}

function toUnits(str: string, dec: number): bigint {
  const s = str.trim()
  if (!/^\d+(\.\d+)?$/.test(s)) throw Object.assign(new Error('Bad amount'), { code: 'amount' })
  let [i, f = ''] = s.split('.')
  i = i.replace(/^0+(?=\d)/, '')
  if (i.length > AMOUNT_MAX_INT) throw Object.assign(new Error('Amount too large'), { code: 'amount' })
  if (f.length > dec) {
    if (/[1-9]/.test(f.slice(dec))) throw Object.assign(new Error('Too many decimals'), { code: 'amount' })
    f = f.slice(0, dec)
  }
  const u = BigInt(i) * 10n ** BigInt(dec) + BigInt((f + '0'.repeat(dec)).slice(0, dec) || '0')
  if (u <= 0n) throw Object.assign(new Error('Amount must be greater than 0'), { code: 'amount' })
  return u
}

function fmtUnits(u: bigint, dec: number): string {
  const b = 10n ** BigInt(dec)
  if (!dec) return u.toString()
  const f = (u % b).toString().padStart(dec, '0').replace(/0+$/, '')
  return (u / b).toString() + (f ? '.' + f : '')
}

function eipNumber(v: string): bigint {
  const m = /^(\d+)(?:\.(\d+))?(?:[eE](\d{1,2}))?$/.exec(v.trim())
  if (!m) throw Object.assign(new Error('Bad EIP-681 value'), { code: 'amount' })
  let digits = m[1] + (m[2] || '')
  let exp = (m[3] ? parseInt(m[3], 10) : 0) - (m[2] || '').length
  if (exp < 0) {
    if (/[1-9]/.test(digits.slice(exp))) throw Object.assign(new Error('Not a whole number of units'), { code: 'amount' })
    digits = digits.slice(0, exp) || '0'
    exp = 0
  }
  return BigInt(digits) * 10n ** BigInt(exp)
}

function payFromParts(to: string | null, tokenName: string | null, units: bigint | null, amount: string | null, memo: string | null, chainId: string | null): ParsedLink {
  if (chainId && chainId !== '' && chainId !== String(CHAIN_ID) && chainId.toLowerCase() !== '0x1630') {
    throw Object.assign(new Error('Wrong network'), { code: 'chain' })
  }
  const token = tokenBySymbol(0, tokenName || 'SCDO')
  if (!token) throw Object.assign(new Error('Unsupported token'), { code: 'token' })
  const dest = checkAddress(to)
  const u = units != null ? units : toUnits(amount || '', token.decimals)
  if (u <= 0n) throw Object.assign(new Error('Amount'), { code: 'amount' })
  return { kind: 'pay', to: dest, token: token.symbol, units: u, amount: fmtUnits(u, token.decimals), memo: checkMemo(memo), chainId: CHAIN_ID }
}

export function parseEip681(uri: string): ParsedLink {
  const m = /^ethereum:(?:pay-)?(0x[0-9a-fA-F]{40}|[1-4]S[0-9a-fA-F]{40})(?:@(0x[0-9a-fA-F]+|\d+))?(?:\/(\w+))?(?:\?(.*))?$/i.exec(uri.trim())
  if (!m) throw Object.assign(new Error('Not an EIP-681 payment URI'), { code: 'eip681' })
  if (!m[2]) throw Object.assign(new Error('EIP-681 link must name the network'), { code: 'chain' })
  const chain = /^0x/i.test(m[2]) ? parseInt(m[2], 16) : parseInt(m[2], 10)
  if (chain !== CHAIN_ID) throw Object.assign(new Error('Wrong network'), { code: 'chain' })
  const q = new URLSearchParams(m[4] || '')
  if (m[3]) {
    if (m[3].toLowerCase() !== 'transfer') throw Object.assign(new Error('Only transfers are supported'), { code: 'eip681' })
    const tokenAddr = checkAddress(m[1])
    const tok = tokenByAddress(tokenAddr)
    if (!tok) throw Object.assign(new Error('Unsupported token contract'), { code: 'token' })
    const raw = q.get('uint256')
    return payFromParts(q.get('address'), tok.symbol, raw ? eipNumber(raw) : null, raw ? null : '', q.get('memo') || q.get('message'), String(chain))
  }
  const value = q.get('value')
  return payFromParts(m[1], 'SCDO', value ? eipNumber(value) : null, value ? null : '', q.get('memo') || q.get('message'), String(chain))
}

function decodeSecret(s: string): Uint8Array {
  const t = s.trim()
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(t)) return hexToBytes(t)
  if (/^[A-Za-z0-9_-]{43}$/.test(t)) {
    const b = b64urlDecode(t)
    if (b.length !== 32) throw Object.assign(new Error('Bad invite secret'), { code: 'secret' })
    return b
  }
  throw Object.assign(new Error('Bad invite secret'), { code: 'secret' })
}

function parseInviteParams(q: URLSearchParams): ParsedLink {
  const secretRaw = q.get('s')
  if (!secretRaw) throw Object.assign(new Error('Missing invite secret'), { code: 'secret' })
  const chainRaw = q.get('n') || String(CHAIN_ID)
  const chain = /^0x/i.test(chainRaw) ? parseInt(chainRaw, 16) : parseInt(chainRaw, 10)
  if (chain !== CHAIN_ID) throw Object.assign(new Error('Wrong network'), { code: 'chain' })
  const c = (q.get('c') || INVITE_REGISTRY).trim()
  if (!/^0x[0-9a-fA-F]{40}$/.test(c) || c.toLowerCase() !== INVITE_REGISTRY.toLowerCase()) {
    throw Object.assign(new Error('Unexpected invite contract'), { code: 'contract' })
  }
  return { kind: 'invite', secret: decodeSecret(secretRaw), contract: INVITE_REGISTRY, chainId: CHAIN_ID }
}

function attributionOf(q: URLSearchParams, hashParams: URLSearchParams | null): { ref: string | null; src: string | null } {
  const ref = sanitizeRef(q.get('ref') || hashParams?.get('ref') || null)
  const src = sanitizeSrc(q.get('src') || hashParams?.get('src') || null)
  return { ref, src }
}

function hashParams(hash: string): URLSearchParams {
  const h = hash.replace(/^#/, '')
  if (h.startsWith('/')) {
    const i = h.indexOf('?')
    return new URLSearchParams(i >= 0 ? h.slice(i + 1) : '')
  }
  return new URLSearchParams(h.startsWith('?') ? h.slice(1) : h)
}

function fromQuery(q: URLSearchParams, kindHint: 'pay' | 'join' | 'invite' | 'send' | 'auto'): ParsedLink {
  if (kindHint === 'invite' || q.has('s')) return parseInviteParams(q)
  if (kindHint === 'join') return { kind: 'join' }
  if (kindHint === 'send' || kindHint === 'pay' || q.has('to') || q.has('amount')) {
    if (kindHint === 'send') {
      const to = q.get('to') || ''
      const shard = Number(q.get('shard') || '0') as Shard
      return { kind: 'send', to, amount: q.get('amount') || '', token: q.get('token') || 'SCDO', shard: shard >= 0 && shard <= 4 ? shard : 0 }
    }
    return payFromParts(q.get('to'), q.get('token'), null, q.get('amount'), q.get('memo'), q.get('chainId'))
  }
  return { kind: 'none' }
}

export function parseLink(input: string): ParseResult {
  const s = String(input ?? '').trim()
  if (!s) return { ok: true, link: { kind: 'none' }, ref: null, src: null }
  if (s.length > 4096) return fail('long', 'Link is too long')
  try {
    if (/^ton:/i.test(s)) return { ok: true, link: { kind: 'ton', uri: s }, ref: null, src: null }
    if (/^ethereum:/i.test(s)) return { ok: true, link: parseEip681(s), ref: null, src: null }
    if (/^scdowallet:/i.test(s)) {
      const u = new URL(s)
      const host = (u.hostname || u.pathname.replace(/^\/+/, '')).toLowerCase()
      const q = u.searchParams
      const kind = host === 'invite' ? 'invite' : host === 'join' ? 'join' : host === 'send' ? 'send' : host === 'pay' ? 'pay' : 'auto'
      const link = fromQuery(q, kind)
      const attr = attributionOf(q, null)
      return { ok: true, link, ref: attr.ref, src: attr.src }
    }
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s)
      if (u.hostname === LEGACY_QR_HOST && !legacyQrPath(u.pathname)) {
        return fail('unrecognized', 'Unrecognised link')
      }
      const hp = hashParams(u.hash)
      const path = u.pathname.toLowerCase()
      let link: ParsedLink = { kind: 'none' }
      if (u.hash.includes('s=') || path.endsWith('/invite') || path.includes('/invite')) {
        const iq = u.hash.includes('s=') ? hp : u.searchParams
        if (iq.has('s') || hp.has('s')) link = parseInviteParams(iq.has('s') ? iq : hp)
      } else if (path.endsWith('/join') || path.includes('/join') || u.hash.startsWith('#/join')) {
        link = { kind: 'join' }
      } else if (path.endsWith('/pay') || u.hash.startsWith('#/pay') || u.searchParams.has('to')) {
        const q = u.hash.startsWith('#/pay') ? hp : u.searchParams
        link = fromQuery(q, 'pay')
      } else if (hp.has('s')) link = parseInviteParams(hp)
      else if (hp.has('ref') || u.searchParams.has('ref')) link = { kind: 'join' }
      const attr = attributionOf(u.searchParams, hp)
      return { ok: true, link, ref: attr.ref, src: attr.src }
    }
    if (s.startsWith('#') || s.startsWith('?')) {
      const q = s.startsWith('#') ? hashParams(s) : new URLSearchParams(s.slice(1))
      const link = s.includes('s=') ? parseInviteParams(q) : s.includes('ref=') ? ({ kind: 'join' } as ParsedLink) : fromQuery(q, 'auto')
      return { ok: true, link, ref: sanitizeRef(q.get('ref')), src: sanitizeSrc(q.get('src')) }
    }
    return fail('unrecognized', 'Unrecognised link')
  } catch (e) {
    const err = e as { code?: string; message?: string }
    return fail(err.code || 'bad', err.message || 'Could not read this link')
  }
}

function legacyQrPath(pathname: string): boolean {
  const p = pathname.toLowerCase().replace(/\/+$/, '') || '/'
  return p === '/pay' || p === '/wallet'
}

/** https://scdo.com.au, or the current https origin when it is apeccapital.org. */
export function linkOrigin(current?: string): string {
  if (current) {
    try {
      const u = new URL(current)
      const origin = u.origin
      if (LINK_ORIGINS.includes(origin)) return origin
    } catch {
      /* use the default */
    }
  }
  return 'https://scdo.com.au'
}

export function payQuery(link: Extract<ParsedLink, { kind: 'pay' }>): string {
  const q = new URLSearchParams()
  q.set('to', toChecksum(link.to))
  q.set('amount', link.amount)
  q.set('token', link.token)
  if (link.memo) q.set('memo', link.memo)
  return q.toString()
}

/** Pay links are created only on /pay of an allowed origin. */
export function buildPayLink(link: Extract<ParsedLink, { kind: 'pay' }>, current?: string): string {
  return linkOrigin(current) + '/pay?' + payQuery(link)
}

export function buildEip681(link: Extract<ParsedLink, { kind: 'pay' }>): string {
  if (link.token === 'SCDO') return 'ethereum:' + toChecksum(link.to) + '@' + CHAIN_ID + '?value=' + link.units.toString()
  const tok = tokenBySymbol(0, link.token)
  if (!tok?.address) throw new Error('token')
  return 'ethereum:' + toChecksum(tok.address) + '@' + CHAIN_ID + '/transfer?address=' + toChecksum(link.to) + '&uint256=' + link.units.toString()
}

/** Referral share link. The code is local; nothing is fetched to build it. */
export function buildShareLink(code: string, origin: string): string {
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(code)) throw new Error('bad code')
  return linkOrigin(origin) + '/join?ref=' + encodeURIComponent(code)
}
