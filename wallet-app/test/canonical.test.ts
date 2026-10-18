import { describe, expect, it } from 'vitest'
import { privateKeyToAccount } from 'viem/accounts'
import { recoverMessageAddress } from 'viem'
import { canonical, canonicalSigned } from '../src/canonical'
import { messageOf, signPayload } from '../src/agent'

const PRIV = '0x1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727' as const

describe('canonical json', () => {
  it('matches the desktop agent vector', () => {
    expect(canonical({ b: 1, a: [2, { d: 1, c: null }] })).toBe('{"a":[2,{"c":null,"d":1}],"b":1}')
  })

  it('drops undefined and keeps null', () => {
    expect(canonical({ z: undefined, a: null })).toBe('{"a":null}')
  })

  it('removes signature before signing a config', () => {
    expect(canonicalSigned({ b: 1, signature: 'nope', a: 2 })).toBe('{"a":2,"b":1}')
  })

  it('recovers the agent key from the EIP-191 message', async () => {
    const env = await signPayload(PRIV, { v: 1, type: 'register', seq: 1, ts: 1, body: { role: 'wallet' } })
    const addr = await recoverMessageAddress({ message: messageOf(env.payload), signature: env.sig })
    expect(addr.toLowerCase()).toBe(privateKeyToAccount(PRIV).address.toLowerCase())
    expect(messageOf(env.payload).startsWith('SCDO Agent Ledger v1\n')).toBe(true)
  })
})
