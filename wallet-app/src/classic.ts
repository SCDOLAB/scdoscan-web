/**
 * Classic shard transaction (scdo_addTx), ported from the live web wallet and
 * the desktop stx signer: RLP of the nine fields, keccak256, recoverable
 * secp256k1 signature, base64 of (64-byte compact sig || recovery id).
 */
import { secp256k1 } from '@noble/curves/secp256k1'
import { keccak_256 } from '@noble/hashes/sha3'
import { b64Encode, bytesToHex, hexToBytes, rlp } from './bytes'
import type { Shard } from './chains'
import { deriveAddress } from './derive'

export interface ClassicTxInput {
  priv: string
  shard: Exclude<Shard, 0>
  toOnChain: `0x${string}`
  /** Base units (1 SCDO = 1e8). */
  amount: bigint
  /** Account nonce already incremented the way the node expects (stored + 1). */
  nonce: number
  gasPrice?: number
  gasLimit?: number
  payload?: `0x${string}`
}

export interface SignedClassicTx {
  hash: `0x${string}`
  from: `0x${string}`
  body: {
    Data: {
      Type: number
      From: string
      To: string
      Amount: string
      AccountNonce: number
      GasPrice: number
      GasLimit: number
      Timestamp: number
      Payload: string
    }
    Hash: string
    Signature: { Sig: string; Pubkey: string }
  }
  /** JSON with Amount as a raw integer so values above 2^53 stay exact. */
  json: string
}

export function signClassicTx(input: ClassicTxInput): SignedClassicTx {
  const from = deriveAddress(input.priv, input.shard)
  const gasPrice = input.gasPrice ?? 1
  const gasLimit = input.gasLimit ?? 21000
  const payload = input.payload && input.payload !== '0x' ? input.payload : '0x'
  if (input.amount < 0n) throw new Error('negative amount')
  const list = [0, from.onChain, input.toOnChain, input.amount, input.nonce, gasPrice, gasLimit, 0, payload]
  const encoded = rlp(list)
  const hashBytes = keccak_256(encoded)
  const hash = bytesToHex(hashBytes) as `0x${string}`
  const sig = secp256k1.sign(hashBytes, hexToBytes(from.priv))
  const compact = sig.toCompactRawBytes()
  const packed = new Uint8Array(65)
  packed.set(compact, 0)
  packed[64] = sig.recovery
  const data = {
    Type: 0,
    From: from.onChain,
    To: input.toOnChain,
    Amount: '__AMT__',
    AccountNonce: input.nonce,
    GasPrice: gasPrice,
    GasLimit: gasLimit,
    Timestamp: 0,
    Payload: payload,
  }
  const envelope = {
    Data: data,
    Hash: hash,
    Signature: { Sig: b64Encode(packed), Pubkey: '' },
  }
  const json = JSON.stringify(envelope).replace('"__AMT__"', input.amount.toString())
  return { hash, from: from.onChain, body: { ...envelope, Data: { ...data, Amount: input.amount.toString() } }, json }
}

export function classicAddTxParam(signed: SignedClassicTx): unknown {
  return JSON.parse(signed.json)
}
