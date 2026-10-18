/**
 * Agent Ledger v2. The agent key is separate from the wallet account.
 * Signing is EIP-191 over `SCDO Agent Ledger v1\n` + canonical JSON.
 * Heartbeats run only while this page is open and visible.
 */
import { privateKeyToAccount } from 'viem/accounts'
import { canonical } from './canonical'
import { CHAIN_ID } from './chains'
import { sha256 } from '@noble/hashes/sha2'
import { bytesToHex, utf8 } from './bytes'

export const PREFIX = 'SCDO Agent Ledger v1\n'

export type Presence = 'online' | 'offline'

export function presence(opts: { registered: boolean; visible: boolean; running: boolean }): Presence {
  return opts.registered && opts.visible && opts.running ? 'online' : 'offline'
}

export function messageOf(payload: unknown): string {
  return PREFIX + canonical(payload)
}

export interface Envelope {
  payload: Record<string, unknown>
  sig: `0x${string}`
}

export async function signPayload(priv: `0x${string}`, payload: Record<string, unknown>): Promise<Envelope> {
  const account = privateKeyToAccount(priv)
  const body = { ...payload, agent: account.address }
  const sig = await account.signMessage({ message: messageOf(body) })
  return { payload: body, sig }
}

export function registerBody(opts: {
  version: string
  platform: string
  payout: `0x${string}`
  ref: string | null
  src: string | null
  device: string
  label?: string
}): Record<string, unknown> {
  const body: Record<string, unknown> = {
    version: opts.version,
    platform: opts.platform,
    role: 'wallet',
    payout: opts.payout,
    device: opts.device,
  }
  if (opts.label) body.label = opts.label.slice(0, 40)
  if (opts.ref) body.ref = opts.ref
  if (opts.src) body.src = opts.src
  return body
}

export function registerPayload(opts: {
  priv: `0x${string}`
  seq: number
  ts: number
  body: Record<string, unknown>
}): Record<string, unknown> {
  const account = privateKeyToAccount(opts.priv)
  return {
    v: 1,
    chainId: CHAIN_ID,
    type: 'register',
    agent: account.address,
    seq: opts.seq,
    ts: opts.ts,
    body: opts.body,
  }
}

export function refcodePayload(priv: `0x${string}`, ts: number): Record<string, unknown> {
  const account = privateKeyToAccount(priv)
  return { v: 1, chainId: CHAIN_ID, type: 'refcode', agent: account.address, ts }
}

/** The ledger rejects a heartbeat whose body omits this code. */
export const HEARTBEAT_CODE = 'ONLINE'

export function heartbeatPayload(priv: `0x${string}`, seq: number, ts: number, version: string): Record<string, unknown> {
  const account = privateKeyToAccount(priv)
  return {
    v: 1,
    chainId: CHAIN_ID,
    type: 'heartbeat',
    agent: account.address,
    seq,
    ts,
    body: { version, code: HEARTBEAT_CODE },
  }
}

export function deviceHash(installId: string): string {
  return bytesToHex(sha256(utf8(installId)), false)
}

export interface PostResult {
  ok: boolean
  status: number
  body: Record<string, unknown> | null
  error?: string
}

export async function postJson(url: string, obj: unknown, timeoutMs = 20000): Promise<PostResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(obj),
      signal: ctrl.signal,
    })
    const text = await res.text()
    let body: Record<string, unknown> | null = null
    try {
      body = JSON.parse(text) as Record<string, unknown>
    } catch {
      body = null
    }
    return { ok: res.ok && !!(body && body.ok === true), status: res.status, body }
  } catch (e) {
    return { ok: false, status: 0, body: null, error: e instanceof Error ? e.message : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/** Try each ledger origin once. Do not retry a 4xx/5xx against the same host. */
export async function postLedger(bases: string[], path: string, obj: unknown): Promise<PostResult> {
  let last: PostResult = { ok: false, status: 0, body: null, error: 'no ledger' }
  for (const base of bases) {
    const root = base.replace(/\/$/, '')
    last = await postJson(root + path, obj)
    if (last.ok) return last
    if (last.status >= 400 && last.status < 500) return last
  }
  return last
}

export interface HeartbeatController {
  stop(): void
  poke(): void
  presence(): Presence
}

/**
 * Visibility-aware heartbeat. While the document is hidden the timer stops
 * and presence is offline. A closed tab cannot keep the agent online; this
 * object only exists while the page is open.
 */
export function startHeartbeats(opts: {
  intervalMs: number
  isVisible: () => boolean
  isRegistered: () => boolean
  beat: () => Promise<void>
  onPresence: (p: Presence) => void
  setTimer?: (fn: () => void, ms: number) => number
  clearTimer?: (id: number) => void
}): HeartbeatController {
  const setTimer = opts.setTimer || ((fn, ms) => window.setTimeout(fn, ms) as unknown as number)
  const clearTimer = opts.clearTimer || ((id) => window.clearTimeout(id))
  let timer: number | null = null
  let stopped = false
  let running = true

  const publish = () => {
    opts.onPresence(presence({ registered: opts.isRegistered(), visible: opts.isVisible(), running: running && !stopped }))
  }

  const arm = () => {
    if (timer != null) clearTimer(timer)
    timer = null
    if (stopped) return
    publish()
    if (!opts.isVisible() || !opts.isRegistered()) return
    timer = setTimer(() => {
      timer = null
      void tick()
    }, opts.intervalMs)
  }

  const tick = async () => {
    if (stopped || !opts.isVisible() || !opts.isRegistered()) {
      publish()
      return
    }
    try {
      await opts.beat()
    } catch {
      /* a failed beat does not change the honest presence rule */
    }
    arm()
  }

  publish()
  if (opts.isVisible() && opts.isRegistered()) void tick()

  return {
    stop() {
      stopped = true
      running = false
      if (timer != null) clearTimer(timer)
      timer = null
      opts.onPresence('offline')
    },
    poke() {
      if (stopped) return
      if (timer != null) clearTimer(timer)
      timer = null
      if (opts.isVisible() && opts.isRegistered()) void tick()
      else publish()
    },
    presence() {
      return presence({ registered: opts.isRegistered(), visible: opts.isVisible(), running: running && !stopped })
    },
  }
}
