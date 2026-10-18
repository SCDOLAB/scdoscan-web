import { describe, expect, it } from 'vitest'
import { PANEL_PAGES, panelLang, panelUrl, withPanelLang } from '../src/panel'

describe('panel language', () => {
  it('maps the wallet language onto en or zh', () => {
    expect(panelLang('en')).toBe('en')
    expect(panelLang('zh-Hant')).toBe('zh')
    expect(panelLang('zh-Hans')).toBe('zh')
  })

  it('adds lang on each wallet panel and leaves other links alone', () => {
    for (const page of PANEL_PAGES) {
      const url = new URL(panelUrl('https://scdo.com.au', page, 'zh-Hant'))
      expect(url.origin).toBe('https://scdo.com.au')
      expect(url.pathname.replace(/\/$/, '')).toBe('/wallet/' + page)
      expect(url.searchParams.get('lang')).toBe('zh')
    }
    const en = new URL(withPanelLang('https://apeccapital.org/wallet/help?x=1', 'en'))
    expect(en.searchParams.get('lang')).toBe('en')
    expect(en.searchParams.get('x')).toBe('1')
    expect(withPanelLang('https://scdo.com.au/join?ref=abc', 'zh-Hans')).toBe('https://scdo.com.au/join?ref=abc')
    expect(withPanelLang('https://scdo.com.au/pay?to=0x1', 'en')).toBe('https://scdo.com.au/pay?to=0x1')
    expect(withPanelLang('https://scdo.com.au/wallet/app/', 'zh-Hant')).toBe('https://scdo.com.au/wallet/app/')
    expect(withPanelLang('https://scdo.com.au/tx/0xabc', 'en')).toBe('https://scdo.com.au/tx/0xabc')
    expect(withPanelLang('https://scdo.com.au/rpc/0', 'en')).toBe('https://scdo.com.au/rpc/0')
  })
})
