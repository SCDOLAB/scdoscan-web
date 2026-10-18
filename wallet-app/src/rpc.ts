/** JSON-RPC with a primary host and one fallback. No other hosts. */
import { RPC_FALLBACK, RPC_PRIMARY, type Shard } from './chains'

export interface RpcOpts {
  timeoutMs?: number
  fetchImpl?: typeof fetch
}

export async function rpc(shard: Shard, method: string, params: unknown[], opts: RpcOpts = {}): Promise<unknown> {
  const fetchImpl = opts.fetchImpl || fetch
  const timeoutMs = opts.timeoutMs ?? 12000
  const urls = [RPC_PRIMARY + shard, RPC_FALLBACK + shard]
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
