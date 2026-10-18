/**
 * Signed remote UI config. Ed25519, same public key as the desktop wallet
 * updater (32-byte raw key, base64). A bad signature is ignored.
 */
import { ed25519 } from '@noble/curves/ed25519'
import { b64Decode, utf8 } from './bytes'
import { canonicalSigned } from './canonical'
import { APP_VERSION } from './version'
import { EXPLORER_TX, HUB_URL, hostAllowed, LEDGER_URLS, RPC_FALLBACK, RPC_PRIMARY } from './chains'

/** Desktop updater PUBKEY_B64. The private key stays offline. */
export const CONFIG_PUBKEY_B64 = '4qt9g0KOI32agOxfEU+/W28zA8iRjt8pYSkcj/VTW5k='

export interface HomeCard {
  id: string
  title: string
  body: string
  href: string
}

export interface WalletUi {
  minVersion: string
  strings: Record<string, Record<string, string>>
  homeCards: HomeCard[]
  banner: { text: string; level: 'info' | 'warn'; href?: string } | null
  flags: { send: boolean; agent: boolean; invite: boolean }
  links: { hub: string; explorer: string; ledger: string[]; rpc: string[] }
}

export const DEFAULT_UI: WalletUi = {
  minVersion: '0.0.0',
  strings: {},
  homeCards: [],
  banner: null,
  flags: { send: true, agent: true, invite: true },
  links: {
    hub: HUB_URL,
    explorer: EXPLORER_TX,
    ledger: [...LEDGER_URLS],
    rpc: [RPC_PRIMARY, RPC_FALLBACK],
  },
}

const VER = /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$/

export function compareVersions(a: string, b: string): number {
  const pa = parseVer(a)
  const pb = parseVer(b)
  if (!pa || !pb) return 0
  if (pa.major !== pb.major) return pa.major > pb.major ? 1 : -1
  if (pa.minor !== pb.minor) return pa.minor > pb.minor ? 1 : -1
  if (pa.patch !== pb.patch) return pa.patch > pb.patch ? 1 : -1
  if (pa.pre === pb.pre) return 0
  if (!pa.pre) return 1
  if (!pb.pre) return -1
  return pa.pre < pb.pre ? -1 : 1
}

function parseVer(s: string): { major: number; minor: number; patch: number; pre: string } | null {
  const m = /^(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.]+))?$/.exec(String(s || '').trim())
  if (!m) return null
  return { major: +m[1], minor: m[2] ? +m[2] : 0, patch: m[3] ? +m[3] : 0, pre: m[4] || '' }
}

export function verifyConfigSignature(obj: Record<string, unknown>, pubkeyB64 = CONFIG_PUBKEY_B64): boolean {
  try {
    if (typeof obj.signature !== 'string' || !obj.signature) return false
    const pub = b64Decode(pubkeyB64)
    if (pub.length !== 32) return false
    const sig = b64Decode(obj.signature)
    const msg = utf8(canonicalSigned(obj))
    return ed25519.verify(sig, msg, pub)
  } catch {
    return false
  }
}

function asStringRecord(v: unknown): Record<string, string> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null
  const out: Record<string, string> = {}
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'string' && k.length < 80 && val.length < 500) out[k] = val
  }
  return out
}

function safeHttps(url: unknown, fallback: string): string {
  if (typeof url !== 'string' || !hostAllowed(url)) return fallback
  return url
}

export interface AcceptResult {
  config: WalletUi
  accepted: boolean
  reason?: string
  updateRequired: boolean
}

/**
 * Verify and apply a fetched document. Unsigned, badly signed, or downgraded
 * (minVersion lower than one already accepted) documents are ignored.
 */
export function acceptConfig(raw: unknown, previousMin: string | null, appVersion = APP_VERSION, pubkeyB64 = CONFIG_PUBKEY_B64): AcceptResult {
  const fallback = { ...DEFAULT_UI, flags: { ...DEFAULT_UI.flags }, links: { ...DEFAULT_UI.links, ledger: [...DEFAULT_UI.links.ledger], rpc: [...DEFAULT_UI.links.rpc] } }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { config: fallback, accepted: false, reason: 'malformed', updateRequired: false }
  const obj = raw as Record<string, unknown>
  if (!verifyConfigSignature(obj, pubkeyB64)) return { config: fallback, accepted: false, reason: 'bad-signature', updateRequired: false }
  const minVersion = typeof obj.minVersion === 'string' && VER.test(obj.minVersion) ? obj.minVersion : '0.0.0'
  if (previousMin && VER.test(previousMin) && compareVersions(minVersion, previousMin) < 0) {
    return { config: fallback, accepted: false, reason: 'downgrade', updateRequired: false }
  }
  const strings: WalletUi['strings'] = {}
  if (obj.strings && typeof obj.strings === 'object') {
    for (const [lang, table] of Object.entries(obj.strings as Record<string, unknown>)) {
      const rec = asStringRecord(table)
      if (rec && ['en', 'zh-Hant', 'zh-Hans'].includes(lang)) strings[lang] = rec
    }
  }
  const homeCards: HomeCard[] = []
  if (Array.isArray(obj.homeCards)) {
    for (const card of obj.homeCards) {
      if (!card || typeof card !== 'object') continue
      const c = card as Record<string, unknown>
      if (typeof c.id !== 'string' || typeof c.title !== 'string' || typeof c.body !== 'string' || typeof c.href !== 'string') continue
      if (!hostAllowed(c.href)) continue
      homeCards.push({ id: c.id.slice(0, 40), title: c.title.slice(0, 80), body: c.body.slice(0, 240), href: c.href })
    }
  }
  let banner: WalletUi['banner'] = null
  if (obj.banner && typeof obj.banner === 'object') {
    const b = obj.banner as Record<string, unknown>
    if (typeof b.text === 'string' && (b.level === 'info' || b.level === 'warn')) {
      const href = typeof b.href === 'string' && hostAllowed(b.href) ? b.href : undefined
      banner = { text: b.text.slice(0, 240), level: b.level, href }
    }
  }
  const flags = { ...DEFAULT_UI.flags }
  if (obj.flags && typeof obj.flags === 'object') {
    const f = obj.flags as Record<string, unknown>
    if (typeof f.send === 'boolean') flags.send = f.send
    if (typeof f.agent === 'boolean') flags.agent = f.agent
    if (typeof f.invite === 'boolean') flags.invite = f.invite
  }
  const links = { ...fallback.links }
  if (obj.links && typeof obj.links === 'object') {
    const l = obj.links as Record<string, unknown>
    links.hub = safeHttps(l.hub, HUB_URL)
    links.explorer = safeHttps(l.explorer, EXPLORER_TX)
    if (Array.isArray(l.ledger)) links.ledger = l.ledger.filter((x): x is string => typeof x === 'string' && hostAllowed(x))
    if (Array.isArray(l.rpc)) {
      const rpc = l.rpc.filter((x): x is string => typeof x === 'string' && hostAllowed(x.endsWith('/') ? x : x + '/'))
      if (rpc.length) links.rpc = rpc
    }
    if (!links.ledger.length) links.ledger = [...LEDGER_URLS]
  }
  const updateRequired = compareVersions(appVersion, minVersion) < 0
  if (updateRequired) flags.send = false
  return {
    config: { minVersion, strings, homeCards, banner, flags, links },
    accepted: true,
    updateRequired,
  }
}

export async function fetchWalletUi(origin = 'https://scdo.com.au'): Promise<unknown> {
  const url = new URL('/wallet/wallet-ui.json', origin)
  if (!hostAllowed(url.toString()) && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('config host')
  }
  const res = await fetch(url.toString(), {
    headers: { accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  })
  const text = await res.text()
  if (!res.ok || text.trim().startsWith('<') || text.trim().startsWith('<!')) throw new Error('config not json')
  return JSON.parse(text)
}
