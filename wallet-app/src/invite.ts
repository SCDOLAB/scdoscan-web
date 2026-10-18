/**
 * InviteRegistry calls and EIP-712 signatures.
 * Domain: SCDO InviteRegistry, version 1, chainId 5680, pinned contract.
 */
import { encodeFunctionData, decodeFunctionResult, type Hex, type Address } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { INVITE_REGISTRY } from './chains'
import { deriveAddress } from './derive'

export const inviteAbi = [
  {
    type: 'function',
    name: 'invite',
    stateMutability: 'payable',
    inputs: [
      { name: 'claimKey', type: 'address' },
      { name: 'sponsorFee', type: 'uint96' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'cancel',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'claimKey', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'reclaim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'claimKey', type: 'address' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'claimKey', type: 'address' },
      { name: 'newAddr', type: 'address' },
      { name: 'claimSig', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getInvite',
    stateMutability: 'view',
    inputs: [{ name: 'claimKey', type: 'address' }],
    outputs: [
      { name: 'referrer', type: 'address' },
      { name: 'gift', type: 'uint256' },
      { name: 'sponsorFee', type: 'uint256' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'state', type: 'uint8' },
    ],
  },
  {
    type: 'function',
    name: 'referrerOf',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'MIN_GIFT',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'MAX_GIFT',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'TTL',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

export const INVITE_DOMAIN = {
  name: 'SCDO InviteRegistry',
  version: '1',
  chainId: 5680,
  verifyingContract: INVITE_REGISTRY,
} as const

export const CLAIM_TYPES = {
  Claim: [
    { name: 'claimKey', type: 'address' },
    { name: 'newAddr', type: 'address' },
  ],
} as const

export const ACCEPT_TYPES = {
  Accept: [
    { name: 'claimKey', type: 'address' },
    { name: 'newAddr', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export type InviteState = 0 | 1 | 2 | 3 | 4

export interface InviteView {
  referrer: Address
  gift: bigint
  sponsorFee: bigint
  expiresAt: bigint
  state: InviteState
}

export function claimKeyOf(secret: `0x${string}`): Address {
  return deriveAddress(secret, 0).human as Address
}

export function encodeInvite(claimKey: Address, sponsorFee: bigint): Hex {
  return encodeFunctionData({ abi: inviteAbi, functionName: 'invite', args: [claimKey, sponsorFee] })
}

export function encodeCancel(claimKey: Address): Hex {
  return encodeFunctionData({ abi: inviteAbi, functionName: 'cancel', args: [claimKey] })
}

export function encodeReclaim(claimKey: Address): Hex {
  return encodeFunctionData({ abi: inviteAbi, functionName: 'reclaim', args: [claimKey] })
}

export function encodeClaim(claimKey: Address, newAddr: Address, claimSig: Hex): Hex {
  return encodeFunctionData({ abi: inviteAbi, functionName: 'claim', args: [claimKey, newAddr, claimSig] })
}

export function encodeGetInvite(claimKey: Address): Hex {
  return encodeFunctionData({ abi: inviteAbi, functionName: 'getInvite', args: [claimKey] })
}

export function decodeGetInvite(data: Hex): InviteView {
  const [referrer, gift, sponsorFee, expiresAt, state] = decodeFunctionResult({
    abi: inviteAbi,
    functionName: 'getInvite',
    data,
  })
  return { referrer, gift, sponsorFee, expiresAt, state: Number(state) as InviteState }
}

export async function signClaim(secret: `0x${string}`, claimKey: Address, newAddr: Address): Promise<Hex> {
  const account = privateKeyToAccount(secret)
  return account.signTypedData({
    domain: INVITE_DOMAIN,
    types: CLAIM_TYPES,
    primaryType: 'Claim',
    message: { claimKey, newAddr },
  })
}

export async function signAccept(priv: `0x${string}`, claimKey: Address, newAddr: Address, deadline: bigint): Promise<Hex> {
  const account = privateKeyToAccount(priv)
  return account.signTypedData({
    domain: INVITE_DOMAIN,
    types: ACCEPT_TYPES,
    primaryType: 'Accept',
    message: { claimKey, newAddr, deadline },
  })
}

export interface ClaimRelayBody {
  claimKey: Address
  newAddr: Address
  claimSig: Hex
  deadline: number
  acceptSig: Hex
}

export function claimRelayBody(parts: ClaimRelayBody): ClaimRelayBody {
  return parts
}

export const INVITE_STATE_NAME = ['none', 'open', 'claimed', 'reclaimed', 'cancelled'] as const
