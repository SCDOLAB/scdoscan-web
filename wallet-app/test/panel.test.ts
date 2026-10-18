import { describe, expect, it } from 'vitest'
import { CONNECT_PATH, PANEL_PAGES, connectPath, connectUrl, panelLang, panelUrl, withPanelLang } from '../src/panel'

describe('panel language', () => {
  it('maps the wallet language onto en or zh', () => {
    expect(panelLang('en')).toBe('en')
    expect(panelLang('zh')).toBe('zh')
  })

  it('adds lang on each wallet panel and leaves other links alone', () => {
    for (const page of PANEL_PAGES) {
      const url = new URL(panelUrl('https://scdo.com.au', page, 'zh'))
      expect(url.origin).toBe('https://scdo.com.au')
      expect(url.pathname.replace(/\/$/, '')).toBe('/wallet/' + page)
      expect(url.searchParams.get('lang')).toBe('zh')
    }
    const en = new URL(withPanelLang('https://apeccapital.org/wallet/help?x=1', 'en'))
    expect(en.searchParams.get('lang')).toBe('en')
    expect(en.searchParams.get('x')).toBe('1')
    expect(withPanelLang('https://scdo.com.au/join?ref=abc', 'zh')).toBe('https://scdo.com.au/join?ref=abc')
    expect(withPanelLang('https://scdo.com.au/pay?to=0x1', 'en')).toBe('https://scdo.com.au/pay?to=0x1')
    expect(withPanelLang('https://scdo.com.au/wallet/app/', 'zh')).toBe('https://scdo.com.au/wallet/app/')
    expect(withPanelLang('https://scdo.com.au/tx/0xabc', 'en')).toBe('https://scdo.com.au/tx/0xabc')
    expect(withPanelLang('https://scdo.com.au/rpc/0', 'en')).toBe('https://scdo.com.au/rpc/0')
  })

  it('builds a same-origin connect link and keeps the configured path', () => {
    expect(connectUrl('https://scdo.com.au/wallet/app/', undefined, 'en')).toBe('https://scdo.com.au/wallet/connect/?lang=en')
    expect(connectUrl('https://apeccapital.org', CONNECT_PATH, 'zh')).toBe('https://apeccapital.org/wallet/connect/?lang=zh')
    expect(connectUrl('http://127.0.0.1:4173/wallet/app/', undefined, 'zh')).toBe('https://scdo.com.au/wallet/connect/?lang=zh')
    expect(connectPath('https://scdo.com.au/wallet/devices')).toBe('/wallet/devices/')
    expect(connectUrl('https://apeccapital.org', 'https://scdo.com.au/wallet/devices/', 'en')).toBe(
      'https://apeccapital.org/wallet/devices/?lang=en',
    )
    expect(connectPath('https://evil.example/wallet/connect/')).toBe(CONNECT_PATH)
    expect(connectPath('https://scdoscan.io/wallet/connect/')).toBe(CONNECT_PATH)
    expect(connectPath('//evil.example/wallet/connect/')).toBe(CONNECT_PATH)
    expect(connectPath('/wallet/../connect/')).toBe(CONNECT_PATH)
    expect(connectPath(undefined)).toBe(CONNECT_PATH)
  })
})
