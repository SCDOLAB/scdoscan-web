/**
 * Dry-run preview. Shard0 uses eth_call. The public RPC does not allow
 * debug_traceCall, so balance overrides are the third parameter of eth_call.
 */
import { decodeFunctionData, encodeFunctionData, type Address, type Hex } from 'viem'
import { erc20Abi } from 'viem'
import { asBig, hexQty, rpc } from './rpc'
import { inviteAbi } from './invite'
import { INVITE_REGISTRY } from './chains'

const UNLIMITED = 2n ** 255n

export interface DecodedCall {
  kind: 'native' | 'transfer' | 'approve' | 'invite' | 'cancel' | 'reclaim' | 'claim' | 'unknown'
  summary: string
  to: string
  tokenSpender?: string
  amount?: bigint
  unlimited: boolean
}

const previewAbi = [
  ...erc20Abi.filter((f) => f.type === 'function' && (f.name === 'transfer' || f.name === 'approve' || f.name === 'balanceOf')),
  ...inviteAbi.filter((f) => f.type === 'function' && ['invite', 'cancel', 'reclaim', 'claim'].includes(f.name)),
] as const

export function decodeCall(to: string, data: Hex, value: bigint): DecodedCall {
  if (!data || data === '0x') {
    return { kind: 'native', summary: 'Send SCDO', to, amount: value, unlimited: false }
  }
  try {
    const decoded = decodeFunctionData({ abi: previewAbi, data })
    if (decoded.functionName === 'transfer') {
      const [dest, amount] = decoded.args as [Address, bigint]
      return { kind: 'transfer', summary: 'Send token', to: dest, amount, unlimited: false }
    }
    if (decoded.functionName === 'approve') {
      const [spender, amount] = decoded.args as [Address, bigint]
      const unlimited = amount >= UNLIMITED
      return { kind: 'approve', summary: unlimited ? 'Unlimited token approval' : 'Token approval', to, tokenSpender: spender, amount, unlimited }
    }
    if (decoded.functionName === 'invite') {
      return { kind: 'invite', summary: 'Create invite', to, amount: value, unlimited: false }
    }
    if (decoded.functionName === 'cancel') return { kind: 'cancel', summary: 'Cancel invite', to, unlimited: false }
    if (decoded.functionName === 'reclaim') return { kind: 'reclaim', summary: 'Reclaim invite', to, unlimited: false }
    if (decoded.functionName === 'claim') return { kind: 'claim', summary: 'Claim invite', to, unlimited: false }
  } catch {
    /* unknown calldata */
  }
  return { kind: 'unknown', summary: 'Contract call', to, amount: value, unlimited: false }
}

export function erc20TransferData(to: Address, amount: bigint): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: 'transfer', args: [to, amount] })
}

export function erc20BalanceData(owner: Address): Hex {
  return encodeFunctionData({ abi: erc20Abi, functionName: 'balanceOf', args: [owner] })
}

export interface Preview {
  decoded: DecodedCall
  ok: boolean
  error?: string
  gas: bigint
  maxFeePerGas: bigint
  maxPriorityFeePerGas: bigint
  feeWei: bigint
  balanceWei: bigint
  /** True when the real call failed and a balance override was needed to see the call succeed. */
  usedOverride: boolean
  overrideOk: boolean
}

export async function previewShard0(opts: {
  from: Address
  to: Address
  value: bigint
  data: Hex
}): Promise<Preview> {
  const decoded = decodeCall(opts.to, opts.data, opts.value)
  const balanceWei = asBig(await rpc(0, 'eth_getBalance', [opts.from, 'latest']))
  let maxPriority = 1_000_000_000n
  try {
    const p = asBig(await rpc(0, 'eth_maxPriorityFeePerGas', []))
    if (p > 0n) maxPriority = p
  } catch {
    /* keep 1 gwei */
  }
  let base = 0n
  try {
    const block = (await rpc(0, 'eth_getBlockByNumber', ['latest', false])) as { baseFeePerGas?: string } | null
    if (block?.baseFeePerGas) base = asBig(block.baseFeePerGas)
  } catch {
    /* leave base at 0 */
  }
  const maxFeePerGas = base * 2n + maxPriority
  let gas = opts.data === '0x' ? 21000n : 100000n
  try {
    gas = asBig(await rpc(0, 'eth_estimateGas', [{ from: opts.from, to: opts.to, value: hexQty(opts.value), data: opts.data }]))
    if (gas < 21000n) gas = 21000n
  } catch {
    /* keep the fallback limit; the call below reports the revert */
  }
  const tx = { from: opts.from, to: opts.to, value: hexQty(opts.value), data: opts.data, gas: hexQty(gas) }
  let ok = false
  let error: string | undefined
  try {
    await rpc(0, 'eth_call', [tx, 'latest'])
    ok = true
  } catch (e) {
    error = e instanceof Error ? e.message : 'dry-run failed'
  }
  let usedOverride = false
  let overrideOk = false
  if (!ok) {
    usedOverride = true
    const boosted = opts.value + maxFeePerGas * gas + 10n ** 18n
    const state = { [opts.from]: { balance: hexQty(boosted) } }
    try {
      await rpc(0, 'eth_call', [tx, 'latest', state])
      overrideOk = true
    } catch {
      overrideOk = false
    }
  }
  return {
    decoded,
    ok,
    error,
    gas,
    maxFeePerGas,
    maxPriorityFeePerGas: maxPriority,
    feeWei: maxFeePerGas * gas,
    balanceWei,
    usedOverride,
    overrideOk,
  }
}

export function isInviteContract(addr: string): boolean {
  return addr.toLowerCase() === INVITE_REGISTRY.toLowerCase()
}
