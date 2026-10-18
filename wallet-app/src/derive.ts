/**
 * Key derivation shared with the desktop wallet (SCDOLAB/scdowallet) and the
 * Android wallet: BIP-39 English, empty passphrase, m/44'/60'/0'/0/0.
 * Shard0 address is the EVM address (keccak256 of the uncompressed pubkey
 * without the 04 prefix, last 20 bytes). Classic shards follow go-scdo
 * GetAddress: keccak256(rlp(pub64)), then byte0 = shard and the last nibble = 1.
 */
import { HDKey } from '@scure/bip32'
import { mnemonicToSeedSync, validateMnemonic, generateMnemonic } from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english'
import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import { bytesToHex, hexToBytes, rlp } from './bytes'
import { DERIVATION_PATH, type Shard } from './chains'

export { DERIVATION_PATH }

const N = BigInt('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141')

export function normalizePriv(priv: string): `0x${string}` {
  let h = priv.trim().toLowerCase()
  if (h.startsWith('0x')) h = h.slice(2)
  if (!/^[0-9a-f]{64}$/.test(h)) throw new Error('invalid private key')
  const n = BigInt('0x' + h)
  if (n <= 0n || n >= N) throw new Error('invalid private key')
  return ('0x' + h) as `0x${string}`
}

export function pubkey64(priv: `0x${string}`): Uint8Array {
  const pub = secp256k1.getPublicKey(hexToBytes(priv), false)
  return pub.slice(1)
}

export interface DerivedAccount {
  priv: `0x${string}`
  shard: Shard
  /** 20-byte form with 0x. On classic shards this is the on-chain address. */
  onChain: `0x${string}`
  /** What we show: checksummed 0x on shard 0, or `1S…` on classic. */
  human: string
}

export function toChecksum(addr: string): string {
  const h = addr.toLowerCase().replace(/^0x/, '')
  const k = bytesToHex(keccak_256(new TextEncoder().encode(h)), false)
  let o = '0x'
  for (let i = 0; i < 40; i++) o += parseInt(k[i], 16) >= 8 ? h[i].toUpperCase() : h[i]
  return o
}

export function deriveAddress(privHex: string, shard: Shard): DerivedAccount {
  const priv = normalizePriv(privHex)
  const pub = pubkey64(priv)
  const hashed = shard === 0 ? keccak_256(pub) : keccak_256(rlp(pub))
  const addr = hashed.slice(-20)
  if (shard === 0) {
    const onChain = bytesToHex(addr) as `0x${string}`
    return { priv, shard, onChain, human: toChecksum(onChain) }
  }
  addr[0] = shard
  addr[19] = (addr[19] & 0xf0) | 1
  const onChain = bytesToHex(addr) as `0x${string}`
  const human = String(shard) + 'S' + bytesToHex(addr, false)
  return { priv, shard, onChain, human }
}

export function privateKeyFromPhrase(phrase: string): `0x${string}` {
  const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
  if (!validateMnemonic(words, wordlist)) throw new Error('bad phrase')
  const seed = mnemonicToSeedSync(words)
  const child = HDKey.fromMasterSeed(seed).derive(DERIVATION_PATH)
  if (!child.privateKey) throw new Error('no private key')
  return bytesToHex(child.privateKey) as `0x${string}`
}

export function generatePhrase(): string {
  return generateMnemonic(wordlist, 128)
}

export function phraseOk(phrase: string): boolean {
  const words = phrase.trim().toLowerCase().split(/\s+/).filter(Boolean).join(' ')
  return validateMnemonic(words, wordlist)
}
