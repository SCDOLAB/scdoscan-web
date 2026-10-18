/**
 * Wallet panel pages live at /wallet/{hub,news,events,invite,agents,pool,help}.
 * Those links carry ?lang=en or ?lang=zh so the page matches this UI.
 * 華語 in the wallet is Traditional script. Panel URLs still use lang=zh.
 */
import type { Lang } from './i18n'

const PANELS = ['hub', 'news', 'events', 'invite', 'agents', 'pool', 'help'] as const

export type PanelPage = (typeof PANELS)[number]

export const PANEL_PAGES: readonly PanelPage[] = PANELS

export function panelLang(lang: Lang): 'en' | 'zh' {
  return lang === 'en' ? 'en' : 'zh'
}

export function isPanelUrl(url: string): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.username || u.password) return false
  const parts = u.pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  return parts.length === 2 && parts[0] === 'wallet' && (PANELS as readonly string[]).includes(parts[1])
}

/** Add or replace lang on a panel URL. Any other URL is returned unchanged. */
export function withPanelLang(url: string, lang: Lang): string {
  if (!isPanelUrl(url)) return url
  const u = new URL(url)
  u.searchParams.set('lang', panelLang(lang))
  return u.toString()
}

export function panelUrl(origin: string, page: PanelPage, lang: Lang): string {
  const root = origin.replace(/\/$/, '')
  return withPanelLang(root + '/wallet/' + page + '/', lang)
}
