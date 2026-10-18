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

/** Static page hosted beside the wallet. Default path when config omits links.connect. */
export const CONNECT_PATH = '/wallet/connect/'

/**
 * Path for the connected-wallets page. A full https URL on an allowed host
 * contributes only its path. Anything else falls back to /wallet/connect/.
 */
export function connectPath(raw: unknown): string {
  const path = readConnectPath(raw)
  return path || CONNECT_PATH
}

function readConnectPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const text = raw.trim()
  if (!text || text.length > 200) return null
  let path = text
  if (/^https:\/\//i.test(text)) {
    try {
      const u = new URL(text)
      if (u.username || u.password || u.protocol !== 'https:') return null
      if (u.hostname !== 'scdo.com.au' && u.hostname !== 'apeccapital.org') return null
      path = u.pathname
    } catch {
      return null
    }
  } else if (!path.startsWith('/') || path.startsWith('//')) {
    return null
  }
  path = path.split('?')[0].split('#')[0]
  if (path.includes('\\') || path.includes('..') || path.includes('.')) return null
  if (!/^\/wallet\/[A-Za-z0-9/_-]+$/.test(path)) return null
  const parts = path.split('/').filter(Boolean)
  if (parts[0] !== 'wallet' || parts.length < 2) return null
  return path.endsWith('/') ? path : path + '/'
}

/** Same origin as the wallet page, with ?lang=en or ?lang=zh. */
export function connectUrl(origin: string, connect: unknown, lang: Lang): string {
  let base: URL
  try {
    base = new URL(origin)
  } catch {
    base = new URL('https://scdo.com.au')
  }
  if (base.protocol !== 'https:' || (base.hostname !== 'scdo.com.au' && base.hostname !== 'apeccapital.org')) {
    base = new URL('https://scdo.com.au')
  }
  const u = new URL(connectPath(connect), base.origin)
  u.search = ''
  u.hash = ''
  u.searchParams.set('lang', panelLang(lang))
  return u.toString()
}
