import { describe, expect, it } from 'vitest'
import { buildEip681, buildPayLink, buildShareLink, payLinkOrder, parseLink, shareLinkOrder } from '../src/links'
import { INVITE_REGISTRY } from '../src/chains'

const TO = '0x9858EfFD232B4033E47d90003D41EC34EcaEda94'
const SECRET = '11'.repeat(32)

function pay(result: ReturnType<typeof parseLink>) {
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('parse')
  expect(result.link.kind).toBe('pay')
  return result
}

describe('link parser', () => {
  it('reads EIP-681, scdowallet, and https pay links', () => {
    const eip = pay(parseLink('ethereum:' + TO + '@5680?value=1e18'))
    if (eip.link.kind === 'pay') expect(eip.link.amount).toBe('1')
    pay(parseLink('scdowallet://pay?to=' + TO + '&amount=1.5&token=SCDO&memo=rent'))
    pay(parseLink('https://scdo.com.au/pay?to=' + TO + '&amount=1&token=SCDO'))
    pay(parseLink('https://scdo.com.au/wallet/#/pay?to=' + TO + '&amount=2&token=tUSDT'))
    const joined = parseLink('https://scdo.com.au/join?ref=Ab.cd_1&src=spring')
    expect(joined.ok && joined.ref).toBe('Ab.cd_1')
    expect(joined.ok && joined.link.kind).toBe('join')
    const invite = parseLink('scdowallet://invite?s=' + SECRET + '&c=' + INVITE_REGISTRY + '&n=5680')
    expect(invite.ok && invite.link.kind).toBe('invite')
    const ton = parseLink('ton://transfer/EQexample')
    expect(ton.ok && ton.link.kind).toBe('ton')
  })

  it('recognises legacy pay and wallet QR codes and ignores other paths', () => {
    pay(parseLink('https://scdoscan.io/pay?to=' + TO + '&amount=1&token=SCDO'))
    pay(parseLink('https://scdoscan.io/wallet/#/pay?to=' + TO + '&amount=1&token=SCDO'))
    pay(parseLink('https://scdoscan.io/pay/?to=' + TO + '&amount=1&token=SCDO'))
    expect(parseLink('https://scdoscan.io/rpc/0').ok).toBe(false)
    expect(parseLink('https://scdoscan.io/kyc').ok).toBe(false)
    expect(parseLink('https://scdoscan.io/lib/paylink.mjs').ok).toBe(false)
    expect(parseLink('https://scdoscan.io/wallet/hub/').ok).toBe(false)
  })

  it('rejects a bad checksum', () => {
    const bad = TO.replace('E', 'e')
    expect(parseLink('ethereum:' + bad + '@5680?value=1').ok).toBe(false)
  })

  it('creates pay and share links only on an allowed origin', () => {
    const link = { kind: 'pay' as const, to: TO, token: 'SCDO', units: 10n ** 18n, amount: '1', memo: 'hi', chainId: 5680 }
    expect(buildPayLink(link, 'https://scdo.com.au/wallet/app/')).toBe('https://scdo.com.au/pay?to=' + TO + '&amount=1&token=SCDO&memo=hi')
    expect(buildPayLink(link, 'https://apeccapital.org/wallet/app/').startsWith('https://apeccapital.org/pay?')).toBe(true)
    expect(buildPayLink(link, 'http://127.0.0.1:4173/wallet/app/').startsWith('https://scdo.com.au/pay?')).toBe(true)
    expect(buildPayLink(link)).not.toContain('scdoscan')
    expect(buildEip681(link)).toBe('ethereum:' + TO + '@5680?value=1000000000000000000')
    expect(buildShareLink('ab.CD_12', 'https://apeccapital.org/wallet/app/')).toBe('https://apeccapital.org/join?ref=ab.CD_12')
    expect(buildShareLink('abc', 'https://evil.example/wallet')).toBe('https://scdo.com.au/join?ref=abc')
    expect(() => buildShareLink('bad code', 'https://scdo.com.au')).toThrow()
    const payOrder = payLinkOrder(link, 'https://apeccapital.org/wallet/app/')
    expect(payOrder[0].startsWith('https://apeccapital.org/pay?')).toBe(true)
    expect(payOrder[1].startsWith('https://scdo.com.au/pay?')).toBe(true)
    expect(payLinkOrder(link, 'https://scdo.com.au/wallet/app/')[1].startsWith('https://apeccapital.org/pay?')).toBe(true)
    expect(payLinkOrder(link, 'http://127.0.0.1:4173/wallet/app/')[0].startsWith('https://scdo.com.au/pay?')).toBe(true)
    expect(shareLinkOrder('ab.CD_12', 'https://apeccapital.org/wallet/app/')).toEqual([
      'https://apeccapital.org/join?ref=ab.CD_12',
      'https://scdo.com.au/join?ref=ab.CD_12',
    ])
    expect(shareLinkOrder('abc', 'https://scdo.com.au/wallet/app/')[1]).toBe('https://apeccapital.org/join?ref=abc')
    expect(payOrder.join(' ') + shareLinkOrder('abc', 'https://apeccapital.org')[0]).not.toContain('scdoscan')
  })

})
