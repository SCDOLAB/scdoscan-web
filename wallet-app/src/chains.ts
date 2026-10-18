/** Pinned chain facts. RPC hosts are only scdo.com.au and apeccapital.org. */

export const CHAIN_ID = 5680
export const CHAIN_HEX = '0x1630'

export const ALLOWED_HOSTS = ['scdo.com.au', 'apeccapital.org'] as const

export const RPC_PRIMARY = 'https://scdo.com.au/rpc/'
export const RPC_FALLBACK = 'https://apeccapital.org/rpc/'

export const LEDGER_URLS = [
  'https://scdo.com.au/agent-ledger/api',
  'https://apeccapital.org/agent-ledger/api',
] as const

export const INVITE_REGISTRY = '0x458F974CcC4F1DB16Fe9F57489b134D7013bAD0d' as const

/** Domain separator published with the deployed InviteRegistry. */
export const INVITE_DOMAIN_SEPARATOR = '0x70454f55db2996edf6c4e40f268800f835a811a830ffa70eea36ed12738fe3b2' as const

export const HUB_URL = 'https://scdo.com.au/wallet/hub/'
export const EXPLORER_TX = 'https://scdo.com.au/tx/'
export const JOIN_URL = 'https://scdo.com.au/join'

export const DERIVATION_PATH = "m/44'/60'/0'/0/0"

export const CLASSIC_DECIMALS = 8
export const SHARD0_DECIMALS = 18

export type Shard = 0 | 1 | 2 | 3 | 4

export interface TokenInfo {
  symbol: string
  name: string
  decimals: number
  address?: `0x${string}`
  native?: boolean
  shard: Shard
}

export const TOKENS: TokenInfo[] = [
  { symbol: 'SCDO', name: 'SCDO', decimals: 18, native: true, shard: 0 },
  {
    symbol: 'tUSDT',
    name: 'SCDO Test USD',
    decimals: 6,
    address: '0xb042c1833687d05cba414f04ec4013744ddeadcc',
    shard: 0,
  },
  {
    symbol: 'tAUD',
    name: 'SCDO Test AUD',
    decimals: 2,
    address: '0x13c22e6944eeeca58768dcaaa03dd485fb8c9ad0',
    shard: 0,
  },
  { symbol: 'SCDO', name: 'SCDO', decimals: 8, native: true, shard: 1 },
  { symbol: 'SCDO', name: 'SCDO', decimals: 8, native: true, shard: 2 },
  { symbol: 'SCDO', name: 'SCDO', decimals: 8, native: true, shard: 3 },
  { symbol: 'SCDO', name: 'SCDO', decimals: 8, native: true, shard: 4 },
]

export function tokensFor(shard: Shard): TokenInfo[] {
  return TOKENS.filter((t) => t.shard === shard)
}

export function tokenBySymbol(shard: Shard, symbol: string): TokenInfo | null {
  const s = symbol.trim().toLowerCase()
  return tokensFor(shard).find((t) => t.symbol.toLowerCase() === s) || null
}

export function tokenByAddress(addr: string): TokenInfo | null {
  const a = addr.toLowerCase()
  return TOKENS.find((t) => t.address && t.address.toLowerCase() === a) || null
}

export function rpcUrl(shard: Shard, which: 'primary' | 'fallback' = 'primary'): string {
  const base = which === 'primary' ? RPC_PRIMARY : RPC_FALLBACK
  return base + String(shard)
}

export function hostAllowed(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    if (u.username || u.password) return false
    return (ALLOWED_HOSTS as readonly string[]).includes(u.hostname)
  } catch {
    return false
  }
}

export function txExplorerUrl(hash: string, base = EXPLORER_TX): string {
  const root = hostAllowed(base.endsWith('/') ? base : base + '/') || hostAllowed(base) ? base : EXPLORER_TX
  return root + hash
}
