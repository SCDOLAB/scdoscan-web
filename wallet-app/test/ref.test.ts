import { describe, expect, it } from 'vitest'
import { extractInviteCode } from '../src/ref'

const ADDR = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'

describe('extractInviteCode', () => {
  it('keeps a bare code and sanitizes it', () => {
    expect(extractInviteCode('  Ab.cd_1  ')).toBe('Ab.cd_1')
    expect(extractInviteCode(ADDR)).toBe(ADDR.toLowerCase())
    expect(extractInviteCode('bad code')).toBeNull()
    expect(extractInviteCode('')).toBeNull()
    expect(extractInviteCode(null)).toBeNull()
  })

  it('extracts ref from a join URL, then sanitizes', () => {
    expect(extractInviteCode('https://scdo.com.au/join?ref=Ab.cd_1')).toBe('Ab.cd_1')
    expect(extractInviteCode('https://scdo.com.au/join/?ref=' + ADDR + '&src=spring')).toBe(ADDR.toLowerCase())
    expect(extractInviteCode('https://apeccapital.org/join?ref=hello_1')).toBe('hello_1')
    expect(extractInviteCode('scdowallet://join?ref=Ab.cd_1')).toBe('Ab.cd_1')
    expect(extractInviteCode('https://apeccapital.org/join?ref=bad%20code')).toBeNull()
    expect(extractInviteCode('https://scdo.com.au/join?ref=')).toBeNull()
  })

  it('rejects other hosts, schemes, and paths', () => {
    expect(extractInviteCode('http://scdo.com.au/join?ref=abc')).toBeNull()
    expect(extractInviteCode('https://evil.example/join?ref=abc')).toBeNull()
    expect(extractInviteCode('https://scdoscan.io/join?ref=abc')).toBeNull()
    expect(extractInviteCode('https://user:pw@scdo.com.au/join?ref=abc')).toBeNull()
    expect(extractInviteCode('https://scdo.com.au/pay?to=' + ADDR + '&ref=abc')).toBeNull()
    expect(extractInviteCode('https://scdo.com.au/wallet/app/?ref=abc')).toBeNull()
    expect(extractInviteCode('scdowallet://pay?ref=abc')).toBeNull()
    expect(extractInviteCode('scdowallet://invite?s=aa')).toBeNull()
  })
})
