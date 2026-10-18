import { describe, expect, it } from 'vitest'
import { LEDGER_URLS, orderByOrigin, rpcUrl } from '../src/chains'
import { postLedger } from '../src/agent'
import { rpc, rpcEndpoints } from '../src/rpc'
import { routeWithLegacy } from '../src/app'

const SCDO_LEDGER = 'https://scdo.com.au/agent-ledger/api'
const APEC_LEDGER = 'https://apeccapital.org/agent-ledger/api'
const APEC = 'https://apeccapital.org/wallet/app/'
const SCDO = 'https://scdo.com.au/wallet/app/'

describe('same-origin service order', () => {
  it('puts the page host first for ledger and RPC, then the other domain', () => {
    expect(orderByOrigin(LEDGER_URLS, APEC, LEDGER_URLS)).toEqual([APEC_LEDGER, SCDO_LEDGER])
    expect(orderByOrigin(LEDGER_URLS, SCDO, LEDGER_URLS)).toEqual([SCDO_LEDGER, APEC_LEDGER])
    expect(orderByOrigin(LEDGER_URLS, 'http://127.0.0.1:4173/wallet/app/', LEDGER_URLS)).toEqual([SCDO_LEDGER, APEC_LEDGER])
    expect(orderByOrigin([SCDO_LEDGER], APEC, LEDGER_URLS)).toEqual([APEC_LEDGER, SCDO_LEDGER])
    expect(orderByOrigin([APEC_LEDGER], SCDO, LEDGER_URLS)).toEqual([SCDO_LEDGER, APEC_LEDGER])
    expect(orderByOrigin(['https://scdoscan.io/agent-ledger/api', SCDO_LEDGER], APEC, LEDGER_URLS)).toEqual([APEC_LEDGER, SCDO_LEDGER])
    expect(rpcEndpoints(0, APEC)).toEqual(['https://apeccapital.org/rpc/0', 'https://scdo.com.au/rpc/0'])
    expect(rpcEndpoints(2, SCDO)).toEqual(['https://scdo.com.au/rpc/2', 'https://apeccapital.org/rpc/2'])
    expect(rpcUrl(1, 'primary', APEC)).toBe('https://apeccapital.org/rpc/1')
    expect(rpcUrl(1, 'fallback', APEC)).toBe('https://scdo.com.au/rpc/1')
  })

  it('keeps a configured path and still falls back to the other host', async () => {
    const bases = orderByOrigin(['https://scdo.com.au/agent-ledger/custom'], APEC, LEDGER_URLS)
    expect(bases).toEqual([APEC_LEDGER, 'https://scdo.com.au/agent-ledger/custom'])
    const seen: string[] = []
    const original = globalThis.fetch
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      seen.push(String(input))
      if (seen.length === 1) throw new Error('cors')
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }) as typeof fetch
    try {
      const res = await postLedger(bases, '/register', { ping: 1 })
      expect(res.ok).toBe(true)
      expect(seen).toEqual([APEC_LEDGER + '/register', 'https://scdo.com.au/agent-ledger/custom/register'])
    } finally {
      globalThis.fetch = original
    }
  })

  it('tries RPC on the page origin before the fallback', async () => {
    const seen: string[] = []
    const result = await rpc(0, 'eth_chainId', [], {
      origin: APEC,
      bases: ['https://scdo.com.au/rpc/', 'https://apeccapital.org/rpc/'],
      fetchImpl: (async (input: RequestInfo | URL) => {
        seen.push(String(input))
        if (String(input).includes('apeccapital.org')) throw new Error('down')
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x1630' }), { status: 200 })
      }) as typeof fetch,
    })
    expect(result).toBe('0x1630')
    expect(seen).toEqual(['https://apeccapital.org/rpc/0', 'https://scdo.com.au/rpc/0'])
  })
})

describe('legacy import route', () => {
  it('sends #/legacy home when there is nothing to import', () => {
    expect(routeWithLegacy('legacy', false)).toBe('home')
    expect(routeWithLegacy('legacy', true)).toBe('legacy')
    expect(routeWithLegacy('home', false)).toBe('home')
    expect(routeWithLegacy('send', false)).toBe('send')
  })
})
