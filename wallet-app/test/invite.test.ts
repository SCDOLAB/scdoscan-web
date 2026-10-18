import { describe, expect, it } from 'vitest'
import { encodeAbiParameters, encodeFunctionData, erc20Abi, keccak256, maxUint256, toBytes } from 'viem'
import { INVITE_DOMAIN_SEPARATOR, INVITE_REGISTRY } from '../src/chains'
import { decodeCall } from '../src/simulate'

describe('invite domain and decoded calls', () => {
  it('matches the published InviteRegistry domain separator', () => {
    const typeHash = keccak256(toBytes('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)'))
    const encoded = encodeAbiParameters(
      [{ type: 'bytes32' }, { type: 'bytes32' }, { type: 'bytes32' }, { type: 'uint256' }, { type: 'address' }],
      [typeHash, keccak256(toBytes('SCDO InviteRegistry')), keccak256(toBytes('1')), 5680n, INVITE_REGISTRY],
    )
    expect(keccak256(encoded)).toBe(INVITE_DOMAIN_SEPARATOR)
  })

  it('flags an unlimited approval', () => {
    const spender = '0x0000000000000000000000000000000000000001'
    const token = '0x0000000000000000000000000000000000000002'
    const unlimited = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, maxUint256] })
    expect(decodeCall(token, unlimited, 0n).unlimited).toBe(true)
    const limited = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, 5n] })
    expect(decodeCall(token, limited, 0n).unlimited).toBe(false)
    expect(decodeCall(spender, '0x', 1n).kind).toBe('native')
  })
})
