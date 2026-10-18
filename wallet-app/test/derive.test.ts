import { describe, expect, it } from 'vitest'
import { deriveAddress, privateKeyFromPhrase } from '../src/derive'
import { signClassicTx } from '../src/classic'
import type { Shard } from '../src/chains'

const PHRASE = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'
const PRIV = '0x1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727'

/** abandon-phrase classic addresses. Byte 0 is the shard and the last nibble is 1. */
const CLASSIC = {
  1: '1S01622a2a9205e84318b2c7ab879b09d110075911',
  2: '2S02622a2a9205e84318b2c7ab879b09d110075911',
  3: '3S03622a2a9205e84318b2c7ab879b09d110075911',
  4: '4S04622a2a9205e84318b2c7ab879b09d110075911',
}

describe('derivation', () => {
  it('matches the BIP-39 abandon vector and the 0x01 address', () => {
    expect(privateKeyFromPhrase(PHRASE)).toBe(PRIV)
    expect(deriveAddress(PRIV, 0).human).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94')
    expect(deriveAddress('0x' + '0'.repeat(63) + '1', 0).human).toBe('0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf')
  })

  it('sets the classic shard byte and the trailing nibble', () => {
    const got: Record<number, string> = {}
    for (const shard of [1, 2, 3, 4] as const) {
      const derived = deriveAddress(PRIV, shard)
      expect(derived.human.startsWith(String(shard) + 'S0' + shard)).toBe(true)
      expect(derived.human.endsWith('1')).toBe(true)
      expect(derived.human.slice(2)).toBe(derived.onChain.slice(2))
      got[shard] = derived.human
    }
    expect(got).toEqual(CLASSIC)
  })
})

describe('classic signature', () => {
  it('puts Amount in as a raw integer and freezes the hash', () => {
    const to = deriveAddress(PRIV, 1).onChain
    const signed = signClassicTx({ priv: PRIV, shard: 1 as Exclude<Shard, 0>, toOnChain: to, amount: 100000000n, nonce: 1 })
    expect(signed.json.includes('"Amount":100000000')).toBe(true)
    expect(signed.json.includes('"Amount":"')).toBe(false)
    expect(signed.from).toBe(deriveAddress(PRIV, 1).onChain)
    expect(signed.body.Signature.Sig.length).toBeGreaterThan(40)
    expect(signed.hash).toBe('0xfd0b41c3506d3cd57e6f4a515fd0b9936ef1c8c622cc79993d2db927afc943ee')
  })
})
