/** JSON-RPC. The page origin is tried first, then the other allowed host. */
import { orderByOrigin, RPC_FALLBACK, RPC_PRIMARY, type Shard } from './chains'

export interface RpcOpts {
  timeoutMs?: number
  fetchImpl?: typeof fetch
  origin?: string
  bases?: readonly string[]
}

const DEFAULT_RPC = [RPC_PRIMARY, RPC_FALLBACK]
let configuredRpc: readonly string[] = DEFAULT_RPC

/** Remember signed-config RPC bases. Each call still puts the page origin first. */
export function useRpcBases(bases: readonly string[]): void {
  configuredRpc = bases.length ? bases : DEFAULT_RPC
}

export function rpcEndpoints(shard: Shard, origin?: string, bases?: readonly string[]): string[] {
  const ordered = orderByOrigin(bases && bases.length ? bases : configuredRpc, origin ?? pageOrigin(), DEFAULT_RPC)
  return ordered.map((base) => base.replace(/\/+$/, '') + '/' + String(shard))
}

function pageOrigin(): string | undefined {
  try {
    if (typeof location !== 'undefined' && location.origin) return location.origin
  } catch {
    /* tests and workers have no page */
  }
  return undefined
}

export async function rpc(shard: Shard, method: string, params: unknown[], opts: RpcOpts = {}): Promise<unknown> {
  const fetchImpl = opts.fetchImpl || fetch
  const timeoutMs = opts.timeoutMs ?? 12000
  const urls = rpcEndpoints(shard, opts.origin, opts.bases)
  let last = 'rpc failed'
  for (const url of urls) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: ctrl.signal,
      })
      const text = await res.text()
      if (text.trim().startsWith('<')) throw new Error('rpc returned html')
      const json = JSON.parse(text) as { result?: unknown; error?: { message?: string } }
      if (json.error) throw new Error(json.error.message || method)
      return json.result
    } catch (e) {
      last = e instanceof Error ? e.message : 'rpc failed'
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(last)
}

export function hexQty(n: bigint): `0x${string}` {
  return ('0x' + n.toString(16)) as `0x${string}`
}

export function asBig(hex: unknown): bigint {
  if (typeof hex !== 'string' || !/^0x[0-9a-fA-F]*$/.test(hex)) return 0n
  if (hex === '0x') return 0n
  return BigInt(hex)
}
