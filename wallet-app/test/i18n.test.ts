import { describe, expect, it } from 'vitest'
import { dictionary, LANG_CHOICES, normalizeLang } from '../src/i18n'
import { panelLang } from '../src/panel'

const BANNED = ['中文', '简体', '簡體', '繁體', '繁体']

describe('language picker', () => {
  it('offers English and 華語, and keeps panel lang=zh', () => {
    expect(LANG_CHOICES.map(([, label]) => label)).toEqual(['English', '華語'])
    expect(LANG_CHOICES.map(([code]) => code)).toEqual(['en', 'zh'])
    expect(panelLang('zh')).toBe('zh')
    expect(panelLang('en')).toBe('en')
  })

  it('uses Traditional script for 華語 and folds older codes', () => {
    const zh = dictionary('zh')
    const en = dictionary('en')
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    expect(zh.appName).toBe('SCDO 錢包')
    expect(zh.bookkeeping).toBe('記帳')
    expect(zh.networkFee).toBe('網路費')
    const blob = Object.values(zh).join('\n')
    for (const label of BANNED) expect(blob).not.toContain(label)
    expect(blob).not.toContain('钱包')
    expect(blob).not.toContain('记账')
    expect(normalizeLang('zh-Hans', 'en')).toBe('zh')
    expect(normalizeLang('zh-Hant', 'en-US')).toBe('zh')
    expect(normalizeLang(null, 'zh-CN')).toBe('zh')
    expect(normalizeLang(null, 'zh-TW')).toBe('zh')
    expect(normalizeLang('en', 'zh-TW')).toBe('en')
    expect(normalizeLang(null, 'en-AU')).toBe('en')
  })
})
