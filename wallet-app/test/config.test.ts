import { describe, expect, it } from 'vitest'
import { ed25519 } from '@noble/curves/ed25519'
import { b64Encode, utf8 } from '../src/bytes'
import { canonicalSigned } from '../src/canonical'
import { acceptConfig, CONFIG_PUBKEY_B64, verifyConfigSignature } from '../src/config'
import { connectUrl } from '../src/panel'

const priv = ed25519.utils.randomPrivateKey()
const pubB64 = b64Encode(ed25519.getPublicKey(priv))

function sign(obj: Record<string, unknown>): Record<string, unknown> {
  const signature = b64Encode(ed25519.sign(utf8(canonicalSigned(obj)), priv))
  return { ...obj, signature }
}

describe('signed wallet ui', () => {
  it('pins the desktop updater public key', () => {
    expect(CONFIG_PUBKEY_B64).toBe('4qt9g0KOI32agOxfEU+/W28zA8iRjt8pYSkcj/VTW5k=')
    expect(verifyConfigSignature({ minVersion: '0.0.0', signature: 'aaaa' })).toBe(false)
  })

  it('accepts a signed document and ignores a tampered one', () => {
    const doc = sign({
      minVersion: '0.1.0',
      flags: { send: false, agent: true, invite: true },
      links: { hub: 'https://apeccapital.org/wallet/hub/' },
      homeCards: [{ id: 'news', title: 'News', body: 'Hello', href: 'https://scdo.com.au/wallet/news' }],
      strings: { en: { appName: 'SCDO' } },
    })
    const ok = acceptConfig(doc, null, '0.1.0', pubB64)
    expect(ok.accepted).toBe(true)
    expect(ok.config.flags.send).toBe(false)
    expect(ok.config.links.hub).toBe('https://apeccapital.org/wallet/hub/')
    expect(ok.config.homeCards).toHaveLength(1)
    const tampered = { ...doc, minVersion: '9.9.9' }
    expect(acceptConfig(tampered, null, '0.1.0', pubB64).accepted).toBe(false)
  })

  it('ignores a downgrade, HTML, and links on other hosts', () => {
    const older = sign({ minVersion: '0.0.1' })
    expect(acceptConfig(older, '0.2.0', '0.1.0', pubB64).reason).toBe('downgrade')
    expect(acceptConfig('<!doctype html><html></html>', null).accepted).toBe(false)
    const doc = sign({
      minVersion: '0.0.0',
      links: { hub: 'https://scdoscan.io/wallet/hub/' },
      homeCards: [{ id: 'x', title: 'x', body: 'x', href: 'https://scdoscan.io/pay' }],
    })
    const acc = acceptConfig(doc, null, '0.1.0', pubB64)
    expect(acc.accepted).toBe(true)
    expect(acc.config.links.hub).toBe('https://scdo.com.au/wallet/hub/')
    expect(acc.config.homeCards).toHaveLength(0)
  })

  it('keeps 華語 overrides and drops a simplified table', () => {
    const doc = sign({
      minVersion: '0.1.0',
      strings: {
        'zh-Hant': { appName: '傳統' },
        'zh-Hans': { appName: '简体名' },
        zh: { tagline: '華語' },
      },
    })
    const acc = acceptConfig(doc, null, '0.1.0', pubB64)
    expect(acc.config.strings.zh).toEqual({ tagline: '華語' })
    expect(acc.config.strings.en).toBeUndefined()
    expect(Object.keys(acc.config.strings)).toEqual(['zh'])
  })

  it('keeps a connect path from the signed config and drops other hosts', () => {
    const doc = sign({
      minVersion: '0.1.0',
      links: { connect: 'https://scdo.com.au/wallet/devices/' },
    })
    const acc = acceptConfig(doc, null, '0.1.0', pubB64)
    expect(acc.config.links.connect).toBe('/wallet/devices/')
    expect(connectUrl('https://apeccapital.org', acc.config.links.connect, 'zh')).toBe('https://apeccapital.org/wallet/devices/?lang=zh')
    const bad = sign({ minVersion: '0.1.0', links: { connect: 'https://evil.example/wallet/connect/' } })
    expect(acceptConfig(bad, null, '0.1.0', pubB64).config.links.connect).toBe('/wallet/connect/')
  })

  it('pauses send when this build is older than minVersion', () => {
    const doc = sign({ minVersion: '9.0.0', flags: { send: true } })
    const acc = acceptConfig(doc, null, '0.1.0', pubB64)
    expect(acc.accepted).toBe(true)
    expect(acc.updateRequired).toBe(true)
    expect(acc.config.flags.send).toBe(false)
  })
})
