/** Shard0 EIP-1559 signing. Type 2 only. No contract bytecode is shipped. */
import type { Address, Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { asBig, hexQty, rpc } from './rpc'

export interface Shard0Tx {
  priv: `0x${string}`
  to: Address
  value: bigint
  data: Hex
  gas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
}

export async function signAndSendShard0(tx: Shard0Tx): Promise<`0x${string}`> {
  const account = privateKeyToAccount(tx.priv)
  const nonce = asBig(await rpc(0, 'eth_getTransactionCount', [account.address, 'pending']))
  const raw = await account.signTransaction({
    type: 'eip1559',
    chainId: 5680,
    nonce: Number(nonce),
    to: tx.to,
    value: tx.value,
    data: tx.data,
    gas: tx.gas,
    maxFeePerGas: tx.maxFeePerGas,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas,
  })
  if (!raw.startsWith('0x02')) throw new Error('expected an EIP-1559 transaction')
  const hash = await rpc(0, 'eth_sendRawTransaction', [raw])
  if (typeof hash !== 'string' || !hash.startsWith('0x')) throw new Error('node rejected the transaction')
  return hash as `0x${string}`
}

export async function shard0Balance(addr: Address): Promise<bigint> {
  return asBig(await rpc(0, 'eth_getBalance', [addr, 'latest']))
}

export async function erc20Balance(token: Address, owner: Address, data: Hex): Promise<bigint> {
  const out = await rpc(0, 'eth_call', [{ to: token, from: owner, data }, 'latest'])
  return asBig(out)
}

export { hexQty }
