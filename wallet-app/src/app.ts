/**
 * SCDO wallet screens. DOM is built with createElement / textContent.
 * Pay links and referral links are built locally. Panel links get ?lang=.
 * Heartbeats use heartbeatPayload, whose body code is ONLINE.
 */
import type { Address, Hex } from 'viem'
import { APP_VERSION } from './version'
import { bytesToHex, randomBytes, wipe } from './bytes'
import { CHAIN_ID, CLASSIC_DECIMALS, INVITE_REGISTRY, LEDGER_URLS, SHARD0_DECIMALS, hostAllowed, orderByOrigin, tokenBySymbol, tokensFor, txExplorerUrl, type Shard, type TokenInfo } from './chains'
import { deriveAddress, generatePhrase, normalizePriv, phraseOk, privateKeyFromPhrase, toChecksum } from './derive'
import { classicAddTxParam, signClassicTx } from './classic'
import { rpc, useRpcBases } from './rpc'
import { erc20Balance, shard0Balance, signAndSendShard0 } from './evm'
import { erc20BalanceData, erc20TransferData, previewShard0, type Preview } from './simulate'
import { HEARTBEAT_CODE, deviceHash, heartbeatPayload, postLedger, refcodePayload, registerBody, registerPayload, signPayload, startHeartbeats, type HeartbeatController, type PostResult } from './agent'
import { claimKeyOf, claimRelayBody, decodeGetInvite, encodeCancel, encodeClaim, encodeGetInvite, encodeInvite, encodeReclaim, signAccept, signClaim, type InviteView } from './invite'
import { acceptConfig, fetchWalletUi, DEFAULT_UI, type WalletUi } from './config'
import { buildEip681, buildPayLink, buildShareLink, linkOrigin, parseLink, type ParsedLink } from './links'
import { lockAttribution, lockedRef, lockedSrc } from './ref'
import { copyText, installId, platformName, replaceUrl, startIdleLock } from './security'
import { createPasskey, passkeyAvailable, passkeyIds, readPrf } from './passkey'
import { emptyVault, idbGetVault, idbPutVault, importLegacyVault, openVault, openWithPrf, resealData, sealVault, wipePlain, wrapDekWithPrf, type StoredVault, type VaultAccount, type VaultPlain } from './vault'
import { detectLang, getLang, setLang, setStringOverrides, t, type Lang } from './i18n'
import { PANEL_PAGES, panelUrl, withPanelLang, type PanelPage } from './panel'
import { formatUnits, parseUnits, shortAddr } from './format'
import { drawQr } from './qr'
import { button, el, field, input } from './dom'

type Route =
  | 'welcome'
  | 'create'
  | 'import'
  | 'import-key'
  | 'legacy'
  | 'unlock'
  | 'home'
  | 'send'
  | 'confirm'
  | 'receive'
  | 'agent'
  | 'invite'
  | 'claim'
  | 'backup'
  | 'settings'

const PUBLIC_ROUTES = new Set<Route>(['welcome', 'create', 'import', 'import-key', 'legacy', 'unlock'])
const NAV: Array<{ route: Route; key: string }> = [
  { route: 'home', key: 'home' },
  { route: 'send', key: 'send' },
  { route: 'receive', key: 'receive' },
  { route: 'agent', key: 'agent' },
  { route: 'invite', key: 'invite' },
]

const PAGE_KEY: Record<PanelPage, string> = {
  hub: 'hub',
  news: 'pageNews',
  events: 'pageEvents',
  invite: 'pageInvite',
  agents: 'pageAgents',
  pool: 'pagePool',
  help: 'pageHelp',
}

interface FormState {
  to: string
  amount: string
  token: string
  memo: string
}

type Draft =
  | { kind: 'transfer'; to: string; amount: string; token: string; memo: string }
  | { kind: 'invite'; gift: string; sponsor: string; secret: `0x${string}`; claimKey: Address }
  | { kind: 'manage'; action: 'cancel' | 'reclaim'; claimKey: Address }

interface Box {
  key: string
  mode: 'checking' | 'ready' | 'classic' | 'error'
  preview: Preview | null
  error: string
}

interface InstallPrompt extends Event {
  prompt(): Promise<void>
}

interface Hist {
  hash: string
  summary: string
  ts: number
}

const session: {
  stored: StoredVault | null
  plain: VaultPlain | null
  dek: Uint8Array | null
  route: Route
  after: Route | null
  shard: Shard
  token: string
  form: FormState
  draft: Draft | null
  box: Box | null
  ui: WalletUi
  updateRequired: boolean
  presence: 'online' | 'offline'
  beats: HeartbeatController | null
  secret: Uint8Array | null
  wiped: boolean
  ton: string
  error: string
  info: string
  busy: boolean
  statusLine: string
  legacy: boolean
  balanceText: string
  phrase: string
  claimView: InviteView | null
  claimPhase: 'idle' | 'submitting' | 'soon' | 'done' | 'error'
  install: InstallPrompt | null
  idle: { poke: () => void; stop: () => void } | null
} = {
  stored: null,
  plain: null,
  dek: null,
  route: 'welcome',
  after: null,
  shard: 0,
  token: 'SCDO',
  form: { to: '', amount: '', token: 'SCDO', memo: '' },
  draft: null,
  box: null,
  ui: DEFAULT_UI,
  updateRequired: false,
  presence: 'offline',
  beats: null,
  secret: null,
  wiped: false,
  ton: '',
  error: '',
  info: '',
  busy: false,
  statusLine: '',
  legacy: false,
  balanceText: '…',
  phrase: '',
  claimView: null,
  claimPhase: 'idle',
  install: null,
  idle: null,
}

function lockMinutes(): number {
  try {
    const n = Number(localStorage.getItem('scdoapp_lock_min') || '5')
    if (!Number.isFinite(n) || n < 1) return 5
    return Math.min(120, Math.floor(n))
  } catch {
    return 5
  }
}

function active(): VaultAccount {
  const plain = session.plain
  if (!plain) throw new Error('locked')
  const acct = plain.accounts.find((a) => a.id === plain.active) || plain.accounts[0]
  if (!acct) throw new Error('locked')
  return acct
}

function freshPriv(): `0x${string}` {
  for (let i = 0; i < 16; i++) {
    const hex = bytesToHex(randomBytes(32)) as `0x${string}`
    try {
      return normalizePriv(hex)
    } catch {
      /* outside the curve order */
    }
  }
  throw new Error('key')
}

function accountFrom(priv: `0x${string}`, mnemonic?: string): VaultAccount {
  return { id: bytesToHex(randomBytes(8), false), name: 'Main', priv: normalizePriv(priv), mnemonic }
}

async function save(): Promise<void> {
  if (!session.plain || !session.dek || !session.stored) return
  session.stored = await resealData(session.stored, session.dek, session.plain)
  await idbPutVault(session.stored)
}

function markUseful(): void {
  try {
    if (localStorage.getItem('scdoapp_backup_dismissed') === '1') return
    if (!active().mnemonic) return
    localStorage.setItem('scdoapp_backup_due', '1')
  } catch {
    /* private mode */
  }
}

function backupDue(): boolean {
  try {
    if (!session.plain || !active().mnemonic) return false
    return localStorage.getItem('scdoapp_backup_due') === '1' && localStorage.getItem('scdoapp_backup_dismissed') !== '1'
  } catch {
    return false
  }
}

function pushHistory(hash: string, summary: string): void {
  if (!hash) return
  let list: Hist[] = []
  try {
    const parsed = JSON.parse(localStorage.getItem('scdoapp_history') || '[]') as Hist[]
    if (Array.isArray(parsed)) list = parsed
  } catch {
    list = []
  }
  list.unshift({ hash, summary, ts: Date.now() })
  try {
    localStorage.setItem('scdoapp_history', JSON.stringify(list.slice(0, 30)))
  } catch {
    /* ignore */
  }
}

function readHistory(): Hist[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('scdoapp_history') || '[]') as Hist[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function noteDismissed(): boolean {
  try {
    return localStorage.getItem('scdoapp_agent_note_dismissed') === '1'
  } catch {
    return false
  }
}

/** #/legacy is the import screen only when a legacy vault is stored. */
export function routeWithLegacy(route: Route, hasLegacyVault: boolean): Route {
  if (route === 'legacy' && !hasLegacyVault) return 'home'
  return route
}

function legacyVaultPresent(): boolean {
  try {
    return !!localStorage.getItem('scdo_vault')
  } catch {
    return false
  }
}

function ledgerBases(): string[] {
  const here = typeof location !== 'undefined' ? location.origin : undefined
  return orderByOrigin(session.ui.links.ledger, here, LEDGER_URLS)
}

function go(route: Route): void {
  route = routeWithLegacy(route, legacyVaultPresent())
  if (!session.plain && !PUBLIC_ROUTES.has(route)) {
    session.after = route
    route = session.stored ? 'unlock' : 'welcome'
  }
  if (route === 'create' && !session.phrase) session.phrase = generatePhrase()
  if (route === 'welcome') session.phrase = ''
  session.route = route
  session.error = ''
  session.info = ''
  replaceUrl(route === 'welcome' ? '#/' : '#/' + route)
  render()
}

function openSession(plain: VaultPlain, dek: Uint8Array, stored: StoredVault): void {
  session.plain = plain
  session.dek = dek
  session.stored = stored
  session.busy = false
  session.statusLine = ''
  startBeats()
  const next = session.after
  session.after = null
  go(next && !PUBLIC_ROUTES.has(next) ? next : 'home')
}

function lock(): void {
  stopBeats()
  if (session.dek) wipe(session.dek)
  session.dek = null
  wipePlain(session.plain)
  session.plain = null
  wipeSecret()
  session.draft = null
  go(session.stored ? 'unlock' : 'welcome')
}

function wipeSecret(): void {
  if (session.secret) wipe(session.secret)
  session.secret = null
}

function wipeClipboard(): void {
  void navigator.clipboard?.writeText('').catch(() => {
    /* clipboard may be blocked */
  })
}

function startBeats(): void {
  if (session.beats) return
  document.addEventListener('visibilitychange', onVis)
  session.beats = startHeartbeats({
    intervalMs: 60_000,
    isVisible: () => document.visibilityState === 'visible',
    isRegistered: () => !!session.plain?.agent?.registered,
    beat: () => sendHeartbeat(),
    onPresence: (p) => {
      session.presence = p
      paintPresence()
    },
  })
}

function stopBeats(): void {
  session.beats?.stop()
  session.beats = null
  document.removeEventListener('visibilitychange', onVis)
  session.presence = 'offline'
}

function onVis(): void {
  session.beats?.poke()
}

function paintPresence(): void {
  if (session.busy) return
  const online = session.presence === 'online'
  const text = online ? t('online') : t('offline')
  document.querySelectorAll('[data-presence]').forEach((node) => {
    node.textContent = text
    node.classList.toggle('online', online)
    node.classList.toggle('offline', !online)
  })
}

function presenceLabel(): string {
  if (session.busy && session.statusLine) return session.statusLine
  return session.presence === 'online' ? t('online') : t('offline')
}

function armIdle(): void {
  session.idle?.stop()
  session.idle = startIdleLock({
    minutes: lockMinutes(),
    onLock: () => {
      if (session.plain) lock()
    },
    isUnlocked: () => !!session.plain,
  })
}

function findToken(symbol: string): TokenInfo {
  const built = tokenBySymbol(session.shard, symbol)
  if (built) return built
  if (session.shard === 0) {
    const extra = readExtras().find((item) => item.symbol.toLowerCase() === symbol.toLowerCase())
    if (extra) return { symbol: extra.symbol, name: extra.symbol, decimals: extra.decimals, address: extra.address, shard: 0 }
  }
  const native = tokenBySymbol(session.shard, 'SCDO')
  if (!native) throw new Error('token')
  return native
}

interface ExtraTok {
  symbol: string
  address: `0x${string}`
  decimals: number
}

function readExtras(): ExtraTok[] {
  try {
    const parsed = JSON.parse(localStorage.getItem('scdoapp_tokens') || '[]') as ExtraTok[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (item) =>
        !!item &&
        typeof item.symbol === 'string' &&
        /^[A-Za-z0-9]{1,12}$/.test(item.symbol) &&
        typeof item.address === 'string' &&
        /^0x[0-9a-fA-F]{40}$/.test(item.address) &&
        Number.isInteger(item.decimals) &&
        item.decimals >= 0 &&
        item.decimals <= 36,
    )
  } catch {
    return []
  }
}

function tokenChoices(): TokenInfo[] {
  const base = tokensFor(session.shard)
  if (session.shard !== 0) return base
  const extras = readExtras().map((item) => ({ symbol: item.symbol, name: item.symbol, decimals: item.decimals, address: item.address, shard: 0 as const }))
  return [...base, ...extras]
}

function parseDest(shard: Shard, raw: string): string | null {
  const v = raw.trim()
  if (shard === 0) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(v)) return null
    const body = v.slice(2)
    const summed = toChecksum(v)
    if (/[a-f]/.test(body) && /[A-F]/.test(body) && summed !== v) return null
    return summed
  }
  const matched = new RegExp('^' + shard + 'S([0-9a-fA-F]{40})$').exec(v)
  if (!matched) return null
  return shard + 'S' + matched[1].toLowerCase()
}

function readNonce(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    for (const key of ['Nonce', 'nonce', 'AccountNonce']) {
      if (obj[key] != null) return readNonce(obj[key])
    }
  }
  return 0
}

function readBalance(value: unknown): bigint {
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value))
  if (typeof value === 'string' && /^\d+$/.test(value)) return BigInt(value)
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    if (obj.Balance != null) return readBalance(obj.Balance)
    if (obj.balance != null) return readBalance(obj.balance)
  }
  return 0n
}

function asHex(value: unknown): Hex {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]*$/.test(value)) throw new Error('bad result')
  return value as Hex
}

function failText(res: PostResult): string {
  const msg = res.body?.message
  const err = res.body?.error
  if (typeof msg === 'string' && msg.length > 0 && msg.length < 200) return msg
  if (typeof err === 'string' && err.length > 0 && err.length < 80) return err
  return t('failed')
}

function txOf(draft: Draft): { to: Address; value: bigint; data: Hex } {
  if (draft.kind === 'transfer') {
    const tok = findToken(draft.token)
    const units = parseUnits(draft.amount, tok.decimals)
    if (units <= 0n) throw new Error('amount')
    if (!tok.address) return { to: draft.to as Address, value: units, data: '0x' }
    return { to: tok.address, value: 0n, data: erc20TransferData(draft.to as Address, units) }
  }
  if (draft.kind === 'invite') {
    const gift = parseUnits(draft.gift, SHARD0_DECIMALS)
    const sponsor = parseUnits(draft.sponsor || '0', SHARD0_DECIMALS)
    return { to: INVITE_REGISTRY, value: gift + sponsor, data: encodeInvite(draft.claimKey, sponsor) }
  }
  const data = draft.action === 'cancel' ? encodeCancel(draft.claimKey) : encodeReclaim(draft.claimKey)
  return { to: INVITE_REGISTRY, value: 0n, data }
}

function applyPay(link: Extract<ParsedLink, { kind: 'pay' }>): void {
  session.shard = 0
  session.token = link.token
  session.form = { to: link.to, amount: link.amount, token: link.token, memo: link.memo }
}

function inviteShare(secret: `0x${string}`): string {
  const q = new URLSearchParams()
  q.set('s', secret.slice(2))
  q.set('c', INVITE_REGISTRY)
  q.set('n', String(CHAIN_ID))
  return linkOrigin(location.origin) + '/wallet/app/#' + q.toString()
}

function receiveCode(): string {
  const human = deriveAddress(active().priv, session.shard).human
  if (session.shard !== 0) return human
  const amount = session.form.amount.trim()
  if (!amount) return human
  try {
    const units = parseUnits(amount, SHARD0_DECIMALS)
    if (units <= 0n) return human
    return buildPayLink(
      { kind: 'pay', to: toChecksum(human), token: 'SCDO', units, amount: formatUnits(units, SHARD0_DECIMALS), memo: '', chainId: CHAIN_ID },
      location.origin,
    )
  } catch {
    return human
  }
}

let balanceKey = ''

async function ensureBalance(): Promise<void> {
  if (!session.plain) return
  const token = session.route === 'send' ? session.token : 'SCDO'
  const key = session.route + ':' + session.shard + ':' + token + ':' + active().id
  if (session.balanceText !== '…' && balanceKey === key) return
  balanceKey = key
  try {
    const text = await balanceText(token)
    if (balanceKey !== key) return
    session.balanceText = text
  } catch {
    if (balanceKey !== key) return
    session.balanceText = '—'
  }
  const node = document.querySelector('[data-balance]')
  if (node) node.textContent = session.balanceText
}

async function balanceText(symbol: string): Promise<string> {
  const acct = active()
  if (session.shard === 0) {
    const addr = deriveAddress(acct.priv, 0).human as Address
    const tok = findToken(symbol)
    if (tok.address) {
      const raw = await erc20Balance(tok.address, addr, erc20BalanceData(addr))
      return formatUnits(raw, tok.decimals) + ' ' + tok.symbol
    }
    return formatUnits(await shard0Balance(addr), SHARD0_DECIMALS) + ' SCDO'
  }
  const onChain = deriveAddress(acct.priv, session.shard).onChain
  const raw = await rpc(session.shard, 'scdo_getBalance', [onChain, '', -1])
  return formatUnits(readBalance(raw), CLASSIC_DECIMALS) + ' SCDO'
}

async function ensurePreview(): Promise<void> {
  const draft = session.draft
  if (!draft || session.route !== 'confirm' || !session.plain) return
  const key = JSON.stringify(draft) + ':' + session.shard
  if (session.box?.key === key) return
  if (session.shard !== 0 && draft.kind === 'transfer') {
    session.box = { key, mode: 'classic', preview: null, error: '' }
    render()
    return
  }
  session.box = { key, mode: 'checking', preview: null, error: '' }
  try {
    const tx = txOf(draft)
    const from = deriveAddress(active().priv, 0).human as Address
    const preview = await previewShard0({ from, to: tx.to, value: tx.value, data: tx.data })
    if (session.route !== 'confirm' || session.box?.key !== key) return
    session.box = { key, mode: 'ready', preview, error: preview.error || '' }
  } catch (e) {
    if (session.box?.key !== key) return
    session.box = { key, mode: 'error', preview: null, error: e instanceof Error ? e.message : t('dryRunFail') }
  }
  if (session.route === 'confirm') render()
}

let claimLoadKey = ''

async function ensureInvite(): Promise<void> {
  if (session.route !== 'claim' || !session.secret || !session.plain) return
  if (session.claimPhase === 'submitting' || session.claimPhase === 'done') return
  const secret = bytesToHex(session.secret) as `0x${string}`
  const key = secret
  if (claimLoadKey === key && session.claimView) return
  claimLoadKey = key
  try {
    const claimKey = claimKeyOf(secret)
    const out = await rpc(0, 'eth_call', [{ to: INVITE_REGISTRY, data: encodeGetInvite(claimKey) }, 'latest'])
    if (claimLoadKey !== key) return
    session.claimView = decodeGetInvite(asHex(out))
  } catch {
    if (claimLoadKey !== key) return
    session.claimView = null
  }
  if (session.route === 'claim') render()
}

async function sendHeartbeat(): Promise<void> {
  const agent = session.plain?.agent
  if (!agent?.registered || !session.dek || !session.plain) return
  if (document.visibilityState !== 'visible') return
  agent.seq += 1
  const seq = agent.seq
  await save()
  const payload = heartbeatPayload(agent.priv, seq, Date.now(), APP_VERSION)
  if ((payload.body as { code?: string }).code !== HEARTBEAT_CODE) return
  const env = await signPayload(agent.priv, payload)
  await postLedger(ledgerBases(), '/heartbeat', env)
}

async function startAgent(): Promise<void> {
  if (!session.plain || !session.dek || session.busy || !session.ui.flags.agent) return
  session.busy = true
  session.statusLine = t('statusStarting')
  session.error = ''
  render()
  try {
    const payout = deriveAddress(active().priv, 0).human as `0x${string}`
    if (!session.plain.agent) {
      const priv = freshPriv()
      session.plain.agent = {
        priv,
        address: deriveAddress(priv, 0).human as `0x${string}`,
        seq: 0,
        registered: false,
        ref: lockedRef(localStorage),
        src: lockedSrc(localStorage),
        payout,
      }
    }
    const agent = session.plain.agent
    agent.payout = payout
    agent.seq += 1
    await save()
    const body = registerBody({
      version: APP_VERSION,
      platform: platformName(),
      payout,
      ref: agent.ref,
      src: agent.src,
      device: deviceHash(installId(localStorage)),
    })
    const env = await signPayload(agent.priv, registerPayload({ priv: agent.priv, seq: agent.seq, ts: Date.now(), body }))
    const res = await postLedger(ledgerBases(), '/register', env)
    if (!res.ok) throw new Error(failText(res))
    agent.registered = true
    await save()
    await fetchRefcode()
    session.beats?.poke()
    markUseful()
  } catch (e) {
    session.error = e instanceof Error ? e.message : t('failed')
  } finally {
    session.busy = false
    session.statusLine = ''
    render()
  }
}

async function fetchRefcode(): Promise<void> {
  const agent = session.plain?.agent
  if (!agent?.registered) return
  const env = await signPayload(agent.priv, refcodePayload(agent.priv, Date.now()))
  const res = await postLedger(ledgerBases(), '/refcode', env)
  const code = res.body?.code
  if (!res.ok || typeof code !== 'string' || !/^[A-Za-z0-9_.-]{1,64}$/.test(code)) return
  agent.refcode = code
  delete agent.shareUrl
  await save()
}

async function confirmSend(): Promise<void> {
  if (!session.plain || !session.dek || !session.draft || session.busy) return
  if (!session.ui.flags.send || session.updateRequired) return
  const draft = session.draft
  const box = session.box
  if (session.shard === 0 || draft.kind !== 'transfer') {
    if (!box?.preview || (!box.preview.ok && !box.preview.overrideOk)) return
  }
  session.busy = true
  session.statusLine = t('pending')
  render()
  try {
    let hash = ''
    if (draft.kind === 'transfer' && session.shard !== 0) hash = await sendClassic(draft)
    else {
      const tx = txOf(draft)
      const preview = session.box?.preview
      if (!preview) throw new Error('preview')
      hash = await signAndSendShard0({
        priv: active().priv,
        to: tx.to,
        value: tx.value,
        data: tx.data,
        gas: preview.gas,
        maxFeePerGas: preview.maxFeePerGas,
        maxPriorityFeePerGas: preview.maxPriorityFeePerGas,
      })
      if (draft.kind === 'invite') {
        session.plain.invites.push({
          claimKey: draft.claimKey,
          secret: draft.secret,
          giftWei: parseUnits(draft.gift, SHARD0_DECIMALS).toString(),
          sponsorFeeWei: parseUnits(draft.sponsor || '0', SHARD0_DECIMALS).toString(),
          expiresAt: 0,
          txHash: hash,
          createdAt: Date.now(),
        })
        await save()
      }
    }
    pushHistory(hash, draft.kind === 'transfer' ? 'Send' : draft.kind === 'invite' ? 'Invite' : draft.action)
    markUseful()
    session.draft = null
    session.box = null
    session.busy = false
    go('home')
  } catch (e) {
    session.error = e instanceof Error ? e.message : t('failed')
    session.busy = false
    session.statusLine = ''
    render()
  }
}

async function sendClassic(draft: Extract<Draft, { kind: 'transfer' }>): Promise<string> {
  const shard = session.shard
  if (shard === 0) throw new Error('shard')
  const from = deriveAddress(active().priv, shard)
  const to = ('0x' + draft.to.slice(2)) as `0x${string}`
  const nonce = readNonce(await rpc(shard, 'scdo_getAccountNonce', [from.onChain, '', -1])) + 1
  const signed = signClassicTx({
    priv: active().priv,
    shard,
    toOnChain: to,
    amount: parseUnits(draft.amount, CLASSIC_DECIMALS),
    nonce,
  })
  const res = await rpc(shard, 'scdo_addTx', [classicAddTxParam(signed)])
  return typeof res === 'string' && res.startsWith('0x') ? res : signed.hash
}

async function submitClaim(): Promise<void> {
  if (!session.plain || !session.dek || !session.secret || session.busy) return
  if (!session.ui.flags.invite) return
  const secretBytes = session.secret
  const secret = bytesToHex(secretBytes) as `0x${string}`
  const me = deriveAddress(active().priv, 0).human as Address
  const claimKey = claimKeyOf(secret)
  session.busy = true
  session.claimPhase = 'submitting'
  session.statusLine = t('claimSubmitting')
  session.error = ''
  render()
  try {
    const bal = await shard0Balance(me)
    if (bal > 0n) {
      session.info = t('selfClaim')
      const claimSig = await signClaim(secret, claimKey, me)
      const data = encodeClaim(claimKey, me, claimSig)
      const preview = await previewShard0({ from: me, to: INVITE_REGISTRY, value: 0n, data })
      if (!preview.ok && !preview.overrideOk) throw new Error(preview.error || t('dryRunFail'))
      const hash = await signAndSendShard0({
        priv: active().priv,
        to: INVITE_REGISTRY,
        value: 0n,
        data,
        gas: preview.gas,
        maxFeePerGas: preview.maxFeePerGas,
        maxPriorityFeePerGas: preview.maxPriorityFeePerGas,
      })
      finishClaim(hash)
      return
    }
    const deadline = Math.floor(Date.now() / 1000) + 3600
    const claimSig = await signClaim(secret, claimKey, me)
    const acceptSig = await signAccept(active().priv, claimKey, me, BigInt(deadline))
    const res = await postLedger(ledgerBases(), '/invite/claim', claimRelayBody({ claimKey, newAddr: me, claimSig, deadline, acceptSig }))
    if (res.status === 503 && res.body?.error === 'relay_disabled') {
      session.claimPhase = 'soon'
      session.statusLine = t('claimSoon')
      session.busy = false
      render()
      return
    }
    if (!res.ok) {
      const permanent = res.status >= 400
      session.claimPhase = 'error'
      session.error = failText(res)
      session.busy = false
      if (permanent) {
        wipeSecret()
        wipeClipboard()
      }
      render()
      return
    }
    const hash = typeof res.body?.txHash === 'string' ? res.body.txHash : ''
    session.statusLine = t('claimPending')
    finishClaim(hash)
  } catch (e) {
    session.claimPhase = 'error'
    session.error = e instanceof Error ? e.message : t('failed')
    session.busy = false
    wipeSecret()
    wipeClipboard()
    render()
  }
}

function finishClaim(hash: string): void {
  wipeSecret()
  wipeClipboard()
  session.claimPhase = 'done'
  session.busy = false
  session.statusLine = t('claimPending')
  if (hash) pushHistory(hash, 'Claim')
  markUseful()
  render()
}

async function createWallet(password: string, phrase: string, usePasskey: boolean): Promise<void> {
  if (session.stored) return
  const priv = privateKeyFromPhrase(phrase)
  const plain = emptyVault(accountFrom(priv, phrase))
  const { stored, dek } = await sealVault(plain, password)
  if (usePasskey) {
    try {
      const passkey = await createPasskey()
      if (passkey) {
        stored.passkey = await wrapDekWithPrf(dek, passkey.prf, passkey.credentialId, passkey.prfSalt)
        wipe(passkey.prf)
      }
    } catch {
      /* password unlock still works if the passkey step is cancelled */
    }
  }
  await idbPutVault(stored)
  session.phrase = ''
  openSession(plain, dek, stored)
}

async function importPhrase(password: string, phrase: string): Promise<void> {
  if (session.stored) return
  const priv = privateKeyFromPhrase(phrase)
  const plain = emptyVault(accountFrom(priv, phrase.trim().toLowerCase().split(/\s+/).join(' ')))
  const { stored, dek } = await sealVault(plain, password)
  await idbPutVault(stored)
  openSession(plain, dek, stored)
}

async function importKey(password: string, key: string): Promise<void> {
  if (session.stored) return
  const plain = emptyVault(accountFrom(normalizePriv(key)))
  const { stored, dek } = await sealVault(plain, password)
  await idbPutVault(stored)
  openSession(plain, dek, stored)
}

async function importLegacy(password: string): Promise<void> {
  if (session.stored) return
  const opened = await importLegacyVault(localStorage, password)
  if (!opened.accounts.length) throw new Error('empty')
  const accounts = opened.accounts.map((item, index) => {
    const acct = accountFrom(normalizePriv(item.priv), item.mn)
    if (item.name) acct.name = item.name
    if (index === 0) return acct
    return acct
  })
  const plain: VaultPlain = { v: 2, accounts, active: accounts[0].id, invites: [] }
  const { stored, dek } = await sealVault(plain, password)
  await idbPutVault(stored)
  openSession(plain, dek, stored)
}

async function unlockWithPassword(password: string): Promise<void> {
  if (!session.stored) return
  const opened = await openVault(session.stored, password)
  openSession(opened.plain, opened.dek, session.stored)
}

async function unlockWithPasskey(): Promise<void> {
  if (!session.stored) return
  const ids = passkeyIds(session.stored)
  if (!ids) return
  const prf = await readPrf(ids.id, ids.salt)
  if (!prf) throw new Error('PASSKEY_FAILED')
  const opened = await openWithPrf(session.stored, prf)
  wipe(prf)
  openSession(opened.plain, opened.dek, session.stored)
}

function passwordsOk(a: string, b: string, understood: boolean): string | null {
  if (a.length < 8) return t('passwordShort')
  if (a !== b) return t('passwordMismatch')
  if (!understood) return t('needTick')
  return null
}

function linkOut(href: string, label: string): HTMLAnchorElement {
  const node = el('a', {
    class: 'linkrow',
    text: label,
    attrs: { href: withPanelLang(href, getLang()), target: '_blank', rel: 'noopener noreferrer' },
  })
  return node
}

function statusNode(): HTMLParagraphElement {
  const online = !session.busy && session.presence === 'online'
  return el('p', {
    class: online ? 'status online' : 'status offline',
    text: presenceLabel(),
    attrs: { 'data-presence': '1' },
  })
}

function agentNote(parent: HTMLElement): void {
  if (noteDismissed()) return
  const note = el('div', { class: 'note' })
  note.append(el('p', { text: t('agentNote') }))
  note.append(
    button(t('agentNoteDismiss'), 'ghost', () => {
      try {
        localStorage.setItem('scdoapp_agent_note_dismissed', '1')
      } catch {
        /* ignore */
      }
      render()
    }),
  )
  parent.append(note)
}

function bannerBlock(parent: HTMLElement): void {
  if (session.updateRequired) parent.append(el('p', { class: 'banner warn', text: t('updateRequired') }))
  if (session.ui.banner) {
    const row = el('div', { class: session.ui.banner.level === 'warn' ? 'banner warn' : 'banner' })
    row.append(el('p', { text: session.ui.banner.text }))
    if (session.ui.banner.href && hostAllowed(session.ui.banner.href)) row.append(linkOut(session.ui.banner.href, t('openHub')))
    parent.append(row)
  }
  if (session.error) parent.append(el('p', { class: 'banner warn', text: session.error }))
  if (session.info) parent.append(el('p', { class: 'banner', text: session.info }))
  if (session.ton) {
    const row = el('div', { class: 'banner' })
    row.append(el('p', { text: t('tonHandoff') }))
    row.append(el('a', { class: 'linkrow', text: t('tonOpen'), attrs: { href: session.ton } }))
    parent.append(row)
  }
}

function shardChips(parent: HTMLElement): void {
  const row = el('div', { class: 'chips' })
  for (let n = 0; n <= 4; n++) {
    const shard = n as Shard
    const label = shard === 0 ? t('shard0') : t('classic', { n: shard })
    const chip = button(label, session.shard === shard ? 'chip on' : 'chip', () => {
      session.shard = shard
      if (shard !== 0) session.token = 'SCDO'
      session.balanceText = '…'
      balanceKey = ''
      render()
    })
    row.append(chip)
  }
  parent.append(row)
}

function drawWelcome(parent: HTMLElement): void {
  parent.append(el('h1', { text: t('appName') }))
  parent.append(el('p', { class: 'muted', text: t('tagline') }))
  parent.append(el('p', { class: 'muted', text: t('nonCustodial') }))
  parent.append(button(t('create'), 'primary', () => go('create')))
  parent.append(button(t('import'), 'ghost', () => go('import')))
  parent.append(button(t('importKey'), 'ghost', () => go('import-key')))
  if (session.legacy) {
    parent.append(el('p', { class: 'muted', text: t('legacyHint') }))
    parent.append(button(t('importLegacy'), 'ghost', () => go('legacy')))
  }
  parent.append(langRow())
}

function langRow(): HTMLElement {
  const row = el('div', { class: 'chips' })
  const choices: Array<[Lang, string]> = [
    ['en', 'English'],
    ['zh-Hant', '繁體'],
    ['zh-Hans', '简体'],
  ]
  for (const [code, label] of choices) {
    row.append(
      button(label, getLang() === code ? 'chip on' : 'chip', () => {
        setLang(code)
        setStringOverrides(session.ui.strings[code])
        render()
      }),
    )
  }
  return row
}

function drawCreate(parent: HTMLElement): void {
  parent.append(el('h1', { text: t('create') }))
  parent.append(el('p', { class: 'muted', text: t('phraseOnce') }))
  parent.append(el('p', { class: 'phrase mono', text: session.phrase }))
  const understood = el('input', { attrs: { type: 'checkbox' } })
  const tick = el('label', { class: 'check' })
  tick.append(understood, el('span', { text: t('understand') }))
  const pw = input({ type: 'password', autocomplete: 'new-password' })
  const pw2 = input({ type: 'password', autocomplete: 'new-password' })
  const passkey = el('input', { attrs: { type: 'checkbox' } })
  parent.append(tick)
  parent.append(field(t('password'), pw))
  parent.append(field(t('confirmPassword'), pw2))
  if (passkeyAvailable()) {
    const row = el('label', { class: 'check' })
    row.append(passkey, el('span', { text: t('passkey') }))
    parent.append(row)
    parent.append(el('p', { class: 'tiny muted', text: t('passkeyHint') }))
  }
  const submit = button(t('continue'), 'primary', () => {
    const problem = passwordsOk(pw.value, pw2.value, understood.checked)
    if (problem) {
      session.error = problem
      render()
      return
    }
    session.busy = true
    session.statusLine = t('creating')
    render()
    void createWallet(pw.value, session.phrase, passkey.checked).catch((e: unknown) => {
      session.busy = false
      session.error = e instanceof Error && e.message === 'bad phrase' ? t('phrase') : t('failed')
      render()
    })
  })
  if (session.busy) submit.disabled = true
  parent.append(submit)
  parent.append(button(t('back'), 'ghost', () => go('welcome')))
}

function drawImport(parent: HTMLElement, mode: 'phrase' | 'key'): void {
  parent.append(el('h1', { text: mode === 'phrase' ? t('import') : t('importKey') }))
  const secret = input({ type: 'text', autocomplete: 'off' })
  secret.placeholder = mode === 'phrase' ? t('phrase') : t('privateKey')
  const understood = el('input', { attrs: { type: 'checkbox' } })
  const tick = el('label', { class: 'check' })
  tick.append(understood, el('span', { text: t('understand') }))
  const pw = input({ type: 'password', autocomplete: 'new-password' })
  const pw2 = input({ type: 'password', autocomplete: 'new-password' })
  parent.append(field(mode === 'phrase' ? t('recovery') : t('privateKey'), secret))
  parent.append(tick, field(t('password'), pw), field(t('confirmPassword'), pw2))
  parent.append(
    button(session.busy ? t('creating') : t('continue'), 'primary', () => {
      const problem = passwordsOk(pw.value, pw2.value, understood.checked)
      if (problem) {
        session.error = problem
        render()
        return
      }
      if (mode === 'phrase' && !phraseOk(secret.value)) {
        session.error = t('phrase')
        render()
        return
      }
      session.busy = true
      render()
      const task = mode === 'phrase' ? importPhrase(pw.value, secret.value) : importKey(pw.value, secret.value)
      void task.catch(() => {
        session.busy = false
        session.error = t('failed')
        render()
      })
    }),
  )
  parent.append(button(t('back'), 'ghost', () => go('welcome')))
}

function drawLegacy(parent: HTMLElement): void {
  parent.append(el('h1', { text: t('importLegacy') }))
  parent.append(el('p', { text: t('legacyHint') }))
  const pw = input({ type: 'password', autocomplete: 'current-password' })
  parent.append(field(t('password'), pw))
  parent.append(
    button(t('continue'), 'primary', () => {
      if (pw.value.length < 1) return
      session.busy = true
      session.statusLine = t('creating')
      render()
      void importLegacy(pw.value).catch((e: unknown) => {
        session.busy = false
        session.error = e instanceof Error && e.message === 'WRONG_PASSWORD' ? t('wrongPassword') : t('failed')
        render()
      })
    }),
  )
  parent.append(button(t('back'), 'ghost', () => go('welcome')))
}

function drawUnlock(parent: HTMLElement): void {
  parent.append(el('h1', { text: t('unlock') }))
  parent.append(el('p', { class: 'muted', text: t('saved') }))
  const pw = input({ type: 'password', autocomplete: 'current-password' })
  pw.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') void submit()
  })
  parent.append(field(t('password'), pw))
  const submit = async () => {
    try {
      await unlockWithPassword(pw.value)
    } catch (e) {
      session.error = e instanceof Error && e.message === 'WRONG_PASSWORD' ? t('wrongPassword') : t('failed')
      render()
    }
  }
  parent.append(button(t('unlock'), 'primary', () => void submit()))
  if (session.stored && passkeyIds(session.stored) && passkeyAvailable()) {
    parent.append(
      button(t('passkeyButton'), 'ghost', () => {
        void unlockWithPasskey().catch(() => {
          session.error = t('failed')
          render()
        })
      }),
    )
  }
}

function drawHome(parent: HTMLElement): void {
  const human = deriveAddress(active().priv, session.shard).human
  parent.append(el('p', { class: 'k', text: t('bookkeeping') }))
  shardChips(parent)
  parent.append(el('p', { class: 'balance', text: session.balanceText === '…' ? '…' : session.balanceText, attrs: { 'data-balance': '1' } }))
  parent.append(el('p', { class: 'mono tiny', text: human }))
  parent.append(
    button(t('copy'), 'ghost', () => {
      void copyText(human).then(() => {
        const node = document.querySelector('[data-copy]')
        if (node) node.textContent = t('copied')
      })
    }),
  )
  parent.lastElementChild?.setAttribute('data-copy', '1')
  if (backupDue()) {
    const note = el('div', { class: 'note warn' })
    note.append(el('p', { text: t('backupAsk') }))
    const row = el('div', { class: 'row' })
    row.append(button(t('backupNow'), 'primary', () => go('backup')))
    row.append(
      button(t('backupDismiss'), 'ghost', () => {
        try {
          localStorage.setItem('scdoapp_backup_dismissed', '1')
        } catch {
          /* ignore */
        }
        render()
      }),
    )
    note.append(row)
    parent.append(note)
  }
  const card = el('div', { class: 'card', attrs: { 'data-agent-card': '1' } })
  card.append(el('h2', { text: t('agentCard') }))
  card.append(statusNode())
  card.append(el('p', { class: 'tiny muted', text: session.plain?.agent?.registered ? t('payout') : t('notStarted') }))
  agentNote(card)
  card.append(button(t('agent'), 'ghost', () => go('agent')))
  parent.append(card)
  if (session.ui.homeCards.length) {
    const cards = el('div', { class: 'card' })
    for (const item of session.ui.homeCards) {
      const block = el('div', {})
      block.append(el('p', { text: item.title }))
      block.append(el('p', { class: 'tiny muted', text: item.body }))
      block.append(linkOut(item.href, item.title))
      cards.append(block)
    }
    parent.append(cards)
  }
  parent.append(linkOut(session.ui.links.hub, t('openHub')))
  const hist = readHistory()
  parent.append(el('h2', { text: t('history') }))
  if (!hist.length) parent.append(el('p', { class: 'muted', text: t('noHistory') }))
  else {
    const list = el('div', { class: 'list' })
    for (const item of hist.slice(0, 8)) {
      const href = txExplorerUrl(item.hash, session.ui.links.explorer)
      list.append(linkOut(hostAllowed(href) ? href : txExplorerUrl(item.hash), shortAddr(item.hash) + ' · ' + item.summary))
    }
    parent.append(list)
  }
  parent.append(button(t('settings'), 'ghost', () => go('settings')))
}

function drawSend(parent: HTMLElement): void {
  parent.append(el('h1', { text: t('send') }))
  if (!session.ui.flags.send || session.updateRequired) parent.append(el('p', { class: 'banner warn', text: session.updateRequired ? t('updateRequired') : t('sendPaused') }))
  shardChips(parent)
  parent.append(el('p', { class: 'k', text: t('balance') }))
  parent.append(el('p', { attrs: { 'data-balance': '1' }, text: session.balanceText }))
  const to = input({ value: session.form.to })
  const amount = input({ value: session.form.amount })
  const memo = input({ value: session.form.memo })
  const sel = el('select')
  for (const tok of tokenChoices()) {
    const opt = el('option', { text: tok.symbol, attrs: { value: tok.symbol } })
    if (tok.symbol === session.token) opt.selected = true
    sel.append(opt)
  }
  sel.addEventListener('change', () => {
    session.token = sel.value
    session.form.token = sel.value
    session.balanceText = '…'
    balanceKey = ''
    void ensureBalance()
  })
  const remember = () => {
    session.form.to = to.value
    session.form.amount = amount.value
    session.form.memo = memo.value
    session.form.token = session.token
  }
  to.addEventListener('input', remember)
  amount.addEventListener('input', remember)
  memo.addEventListener('input', remember)
  parent.append(field(t('to'), to), field(t('amount'), amount), field(t('token'), sel))
  if (session.shard === 0) parent.append(field(t('memo'), memo))
  parent.append(
    button(t('review'), 'primary', () => {
      remember()
      const dest = parseDest(session.shard, session.form.to)
      if (!dest) {
        session.error = t('linkBad')
        render()
        return
      }
      try {
        const tok = findToken(session.token)
        if (parseUnits(session.form.amount, tok.decimals) <= 0n) throw new Error('amount')
      } catch {
        session.error = t('amount')
        render()
        return
      }
      if (session.shard === 0 && session.form.memo) {
        try {
          const parsed = parseLink('https://scdo.com.au/pay?to=' + dest + '&amount=' + session.form.amount + '&token=' + session.token + '&memo=' + encodeURIComponent(session.form.memo))
          if (!parsed.ok) {
            session.error = t('linkBad')
            render()
            return
          }
        } catch {
          session.error = t('linkBad')
          render()
          return
        }
      }
      session.draft = { kind: 'transfer', to: dest, amount: session.form.amount.trim(), token: session.token, memo: session.form.memo.trim() }
      session.box = null
      go('confirm')
    }),
  )
}

function drawConfirm(parent: HTMLElement): void {
  const draft = session.draft
  parent.append(el('h1', { text: t('review') }))
  if (!draft) {
    parent.append(button(t('back'), 'ghost', () => go('send')))
    return
  }
  const box = session.box
  const mode = box?.mode || 'checking'
  if (draft.kind === 'transfer') {
    parent.append(el('p', { class: 'k', text: t('to') }))
    parent.append(el('p', { class: 'mono', text: draft.to }))
    parent.append(el('p', { class: 'balance', text: draft.amount + ' ' + draft.token }))
    if (draft.memo) parent.append(el('p', { text: t('memo') + ': ' + draft.memo }))
  } else if (draft.kind === 'invite') {
    parent.append(el('p', { text: t('givingOwn', { amount: draft.gift }) }))
    parent.append(el('p', { class: 'muted', text: t('sponsorFee') + ' ' + (draft.sponsor || '0') }))
    parent.append(el('p', { class: 'mono tiny', text: draft.claimKey }))
  } else {
    parent.append(el('p', { text: draft.action === 'cancel' ? t('cancelInvite') : t('reclaim') }))
    parent.append(el('p', { class: 'mono tiny', text: draft.claimKey }))
  }
  parent.append(el('p', { class: 'k', text: t('network') }))
  parent.append(el('p', { text: session.shard === 0 ? t('shard0') : t('classic', { n: session.shard }) }))
  let previewText = t('checking')
  if (mode === 'classic') previewText = t('classicNote')
  else if (mode === 'error') previewText = t('dryRunFail')
  else if (mode === 'ready' && box?.preview) {
    if (box.preview.ok) previewText = t('dryRunOk')
    else if (box.preview.overrideOk) previewText = t('dryRunOverride')
    else previewText = t('dryRunStill')
  }
  parent.append(el('p', { attrs: { 'data-preview': mode }, text: previewText }))
  if (box?.preview) {
    parent.append(el('p', { class: 'tiny', text: t('networkFee') + ': ' + t('feeUpTo', { fee: formatUnits(box.preview.feeWei, SHARD0_DECIMALS) }) }))
    if (box.preview.decoded.unlimited) parent.append(el('p', { class: 'banner warn', text: t('unlimited') }))
    parent.append(el('p', { class: 'tiny muted', text: box.preview.decoded.summary }))
  } else if (mode === 'classic') {
    parent.append(el('p', { class: 'tiny', text: t('networkFee') + ': ' + formatUnits(21000n, CLASSIC_DECIMALS) + ' SCDO' }))
  }
  if (box?.error && mode === 'error') parent.append(el('p', { class: 'tiny muted', text: box.error }))
  const can =
    session.ui.flags.send &&
    !session.updateRequired &&
    !session.busy &&
    (mode === 'classic' || (mode === 'ready' && !!box?.preview && (box.preview.ok || box.preview.overrideOk)))
  const sendBtn = button(session.busy ? t('pending') : t('confirm'), 'primary', () => void confirmSend())
  sendBtn.disabled = !can
  sendBtn.setAttribute('data-action', 'confirm-send')
  parent.append(sendBtn)
  parent.append(button(t('back'), 'ghost', () => go(draft.kind === 'transfer' ? 'send' : 'invite')))
}

function drawReceive(parent: HTMLElement): void {
  parent.append(el('h1', { text: t('receive') }))
  shardChips(parent)
  const human = deriveAddress(active().priv, session.shard).human
  parent.append(el('p', { class: 'k', text: t('yourAddress') }))
  parent.append(el('p', { class: 'mono', text: human }))
  parent.append(el('p', { class: 'tiny muted', text: t('receiveHint') }))
  const amount = input({ value: session.form.amount })
  if (session.shard === 0) parent.append(field(t('amount'), amount))
  const canvas = el('canvas', { class: 'qr', attrs: { 'data-qr': '1' } })
  parent.append(canvas)
  const payLine = el('p', { class: 'mono tiny', attrs: { 'data-paylink': '1' }, text: session.shard === 0 ? receiveCode() : human })
  parent.append(payLine)
  const redraw = () => {
    session.form.amount = amount.value
    const code = receiveCode()
    drawQr(canvas, code)
    payLine.textContent = code
  }
  amount.addEventListener('input', redraw)
  drawQr(canvas, receiveCode())
  parent.append(button(t('copy'), 'ghost', () => void copyText(human)))
  if (session.shard === 0) {
    parent.append(
      button(t('shareLink'), 'ghost', () => {
        const code = receiveCode()
        if (code.startsWith('https://')) void copyText(code)
      }),
    )
    parent.append(
      button('EIP-681', 'ghost', () => {
        try {
          const units = parseUnits(session.form.amount || '0', SHARD0_DECIMALS)
          if (units <= 0n) return
          const link = buildEip681({
            kind: 'pay',
            to: toChecksum(human),
            token: 'SCDO',
            units,
            amount: formatUnits(units, SHARD0_DECIMALS),
            memo: '',
            chainId: CHAIN_ID,
          })
          void copyText(link)
        } catch {
          /* amount not ready */
        }
      }),
    )
  }
}

function drawAgent(parent: HTMLElement): void {
  parent.append(el('h1', { text: t('startAgent') }))
  parent.append(statusNode())
  parent.append(el('p', { text: t('agentIntro') }))
  agentNote(parent)
  parent.append(el('p', { class: 'tiny muted', text: t('rewardsNote') }))
  parent.append(el('p', { class: 'tiny muted', text: t('activityNote') }))
  const agent = session.plain?.agent
  if (agent?.registered) {
    parent.append(el('p', { class: 'k', text: t('payout') }))
    parent.append(el('p', { class: 'mono tiny', text: agent.payout }))
    if (agent.ref) parent.append(el('p', { class: 'tiny', text: t('refLocked') }))
    if (agent.refcode) {
      const link = buildShareLink(agent.refcode, location.origin)
      parent.append(el('p', { class: 'k', text: t('shareCode') }))
      parent.append(el('p', { class: 'mono', text: agent.refcode }))
      parent.append(el('p', { class: 'mono tiny', text: link, attrs: { 'data-share': '1' } }))
      parent.append(button(t('share'), 'primary', () => void copyText(link, 60_000)))
    } else {
      parent.append(
        button(t('share'), 'ghost', () => {
          void fetchRefcode().then(() => render())
        }),
      )
    }
  } else {
    const start = button(session.busy ? t('statusStarting') : t('startAgent'), 'primary', () => void startAgent())
    start.disabled = session.busy || !session.ui.flags.agent
    start.setAttribute('data-action', 'start-agent')
    parent.append(start)
  }
  const install = button(t('installApp'), 'ghost', () => {
    void session.install?.prompt()
  })
  install.setAttribute('data-install', '1')
  if (!session.install) install.hidden = true
  parent.append(install)
}

function drawInvite(parent: HTMLElement): void {
  parent.append(el('h1', { text: t('createInvite') }))
  if (!session.ui.flags.invite) parent.append(el('p', { class: 'banner warn', text: t('sendPaused') }))
  const gift = input({ value: '' })
  const sponsor = input({ value: '0' })
  parent.append(field(t('gift'), gift), field(t('sponsorFee'), sponsor))
  parent.append(el('p', { class: 'tiny muted', text: t('rewardsNote') }))
  const create = button(t('review'), 'primary', () => {
    let units = 0n
    try {
      units = parseUnits(gift.value.trim(), SHARD0_DECIMALS)
      parseUnits(sponsor.value.trim() || '0', SHARD0_DECIMALS)
    } catch {
      session.error = t('amount')
      render()
      return
    }
    if (units <= 0n) {
      session.error = t('amount')
      render()
      return
    }
    const secret = freshPriv()
    session.shard = 0
    session.draft = { kind: 'invite', gift: gift.value.trim(), sponsor: sponsor.value.trim() || '0', secret, claimKey: claimKeyOf(secret) }
    session.box = null
    go('confirm')
  })
  create.disabled = !session.ui.flags.invite
  parent.append(create)
  const invites = session.plain?.invites || []
  if (invites.length) {
    parent.append(el('h2', { text: t('invites') }))
    for (const inv of invites) {
      const card = el('div', { class: 'card' })
      card.append(el('p', { class: 'mono tiny', text: inv.claimKey }))
      card.append(el('p', { class: 'tiny', text: formatUnits(BigInt(inv.giftWei || '0'), SHARD0_DECIMALS) + ' SCDO' }))
      card.append(button(t('share'), 'ghost', () => void copyText(inviteShare(inv.secret), 60_000)))
      card.append(
        button(t('cancelInvite'), 'ghost', () => {
          session.shard = 0
          session.draft = { kind: 'manage', action: 'cancel', claimKey: inv.claimKey }
          session.box = null
          go('confirm')
        }),
      )
      card.append(
        button(t('reclaim'), 'ghost', () => {
          session.shard = 0
          session.draft = { kind: 'manage', action: 'reclaim', claimKey: inv.claimKey }
          session.box = null
          go('confirm')
        }),
      )
      parent.append(card)
    }
  }
}

function drawClaim(parent: HTMLElement): void {
  parent.append(el('h1', { text: t('claimTitle') }))
  if (session.wiped) parent.append(el('p', { class: 'tiny muted', text: t('wiped') }))
  const phaseText =
    session.claimPhase === 'submitting'
      ? t('claimSubmitting')
      : session.claimPhase === 'soon'
        ? t('claimSoon')
        : session.claimPhase === 'done'
          ? session.statusLine || t('claimPending')
          : ''
  if (phaseText) parent.append(el('p', { attrs: { 'data-claim-status': '1' }, text: phaseText }))
  const view = session.claimView
  const open = !!view && view.state === 1
  if (open && view) {
    parent.append(el('p', { text: t('claimFrom', { referrer: shortAddr(view.referrer), amount: formatUnits(view.gift, SHARD0_DECIMALS) }) }))
  } else if (view && view.state > 1) parent.append(el('p', { text: t('alreadyUsed') }))
  else parent.append(el('p', { attrs: { 'data-claim': 'closed' }, text: t('notOpen') }))
  const consent = el('input', { attrs: { type: 'checkbox' } })
  if (open && view) {
    const tick = el('label', { class: 'check' })
    tick.append(consent, el('span', { text: t('claimConsent', { referrer: shortAddr(view.referrer) }) }))
    parent.append(tick)
  }
  const submit = button(session.claimPhase === 'submitting' ? t('claimSubmitting') : t('claimSubmit'), 'primary', () => {
    if (!consent.checked) {
      session.error = t('needTick')
      render()
      return
    }
    void submitClaim()
  })
  submit.disabled = session.busy || !session.secret || !view || view.state !== 1 || session.claimPhase === 'done'
  submit.setAttribute('data-action', 'claim')
  parent.append(submit)
  if (!session.ui.flags.invite) parent.append(el('p', { class: 'banner warn', text: t('sendPaused') }))
  parent.append(button(t('home'), 'ghost', () => go('home')))
}

function drawBackup(parent: HTMLElement): void {
  parent.append(el('h1', { text: t('backup') }))
  parent.append(el('p', { text: t('phraseOnce') }))
  const phrase = el('p', { class: 'phrase mono', attrs: { 'data-phrase': '1' } })
  const hold = button(t('reveal'), 'primary', () => {})
  const show = () => {
    phrase.textContent = active().mnemonic || ''
  }
  const hide = () => {
    phrase.textContent = ''
  }
  hold.addEventListener('pointerdown', show)
  hold.addEventListener('pointerup', hide)
  hold.addEventListener('pointerleave', hide)
  parent.append(phrase, hold)
  parent.append(button(t('back'), 'ghost', () => go('home')))
}

function drawSettings(parent: HTMLElement): void {
  parent.append(el('h1', { text: t('settings') }))
  parent.append(el('p', { class: 'k', text: t('language') }))
  parent.append(langRow())
  const minutes = input({ type: 'number', value: String(lockMinutes()) })
  minutes.min = '1'
  minutes.max = '120'
  minutes.addEventListener('change', () => {
    const n = Math.min(120, Math.max(1, Math.floor(Number(minutes.value) || 5)))
    try {
      localStorage.setItem('scdoapp_lock_min', String(n))
    } catch {
      /* ignore */
    }
    armIdle()
  })
  parent.append(field(t('autoLock'), minutes))
  parent.append(el('h2', { text: t('more') }))
  const origin = linkOrigin(location.origin)
  const list = el('div', { class: 'list' })
  for (const page of PANEL_PAGES) list.append(linkOut(panelUrl(origin, page, getLang()), t(PAGE_KEY[page])))
  parent.append(list)
  parent.append(el('h2', { text: t('addToken') }))
  const symbol = input({})
  const contract = input({})
  const decimals = input({ type: 'number', value: '18' })
  parent.append(field(t('symbol'), symbol), field(t('contract'), contract), field(t('decimals'), decimals))
  parent.append(
    button(t('addToken'), 'ghost', () => {
      const addr = toChecksum(contract.value.trim())
      if (!/^0x[0-9a-fA-F]{40}$/.test(contract.value.trim())) return
      const dec = Number(decimals.value)
      if (!Number.isInteger(dec) || dec < 0 || dec > 36) return
      if (!/^[A-Za-z0-9]{1,12}$/.test(symbol.value.trim())) return
      const next = readExtras().filter((item) => item.symbol.toLowerCase() !== symbol.value.trim().toLowerCase())
      next.push({ symbol: symbol.value.trim(), address: addr as `0x${string}`, decimals: dec })
      try {
        localStorage.setItem('scdoapp_tokens', JSON.stringify(next.slice(0, 12)))
      } catch {
        /* ignore */
      }
      session.info = t('saved')
      render()
    }),
  )
  parent.append(el('p', { class: 'tiny muted', text: t('nonCustodial') }))
  parent.append(el('p', { class: 'tiny muted', text: t('version') + ' ' + APP_VERSION }))
  parent.append(button(t('lock'), 'danger', () => lock()))
  parent.append(button(t('back'), 'ghost', () => go('home')))
}

function render(): void {
  if (session.route === 'legacy' && !legacyVaultPresent()) {
    session.legacy = false
    if (session.plain) session.route = 'home'
    else {
      session.after = 'home'
      session.route = session.stored ? 'unlock' : 'welcome'
    }
    replaceUrl(session.route === 'welcome' ? '#/' : '#/' + session.route)
  }
  const root = document.getElementById('app')
  if (!root) return
  document.title = t('appName')
  root.replaceChildren()
  const shell = el('div', { class: 'shell', attrs: { 'data-screen': session.route } })
  const top = el('div', { class: 'top' })
  const brand = el('div', { class: 'brand' })
  const icon = el('img', { attrs: { src: import.meta.env.BASE_URL + 'icon-256.png', alt: '' } })
  brand.append(icon, el('strong', { text: t('appName') }))
  top.append(brand)
  if (session.plain) top.append(button(t('lock'), 'ghost', () => lock()))
  shell.append(top)
  bannerBlock(shell)
  if (session.route === 'welcome') drawWelcome(shell)
  else if (session.route === 'create') drawCreate(shell)
  else if (session.route === 'import') drawImport(shell, 'phrase')
  else if (session.route === 'import-key') drawImport(shell, 'key')
  else if (session.route === 'legacy') drawLegacy(shell)
  else if (session.route === 'unlock') drawUnlock(shell)
  else if (!session.plain) drawWelcome(shell)
  else if (session.route === 'home') drawHome(shell)
  else if (session.route === 'send') drawSend(shell)
  else if (session.route === 'confirm') drawConfirm(shell)
  else if (session.route === 'receive') drawReceive(shell)
  else if (session.route === 'agent') drawAgent(shell)
  else if (session.route === 'invite') drawInvite(shell)
  else if (session.route === 'claim') drawClaim(shell)
  else if (session.route === 'backup') drawBackup(shell)
  else drawSettings(shell)
  root.append(shell)
  if (session.plain && NAV.some((item) => item.route === session.route)) {
    const nav = el('nav', { class: 'nav' })
    const inner = el('div', { class: 'nav-inner' })
    for (const item of NAV) {
      const tab = button(t(item.key), session.route === item.route ? 'on' : '', () => go(item.route))
      inner.append(tab)
    }
    nav.append(inner)
    root.append(nav)
  }
  queueMicrotask(() => {
    if (session.route === 'home' || session.route === 'send' || session.route === 'receive') void ensureBalance()
    if (session.route === 'confirm') void ensurePreview()
    if (session.route === 'claim') void ensureInvite()
  })
}

function routeFromHash(hash = location.hash): Route | null {
  if (hash === '' || hash === '#' || hash === '#/') return 'welcome'
  const matched = /^#\/([a-z-]+)/.exec(hash)
  if (!matched) return null
  const name = matched[1] as Route
  const all: Route[] = ['welcome', 'create', 'import', 'import-key', 'legacy', 'unlock', 'home', 'send', 'confirm', 'receive', 'agent', 'invite', 'claim', 'backup', 'settings']
  return all.includes(name) ? name : null
}

function onHash(): void {
  const parsed = parseLink(location.href)
  if (parsed.ok) {
    lockAttribution(localStorage, parsed.ref, parsed.src)
    if (parsed.link.kind === 'invite') {
      wipeSecret()
      session.secret = parsed.link.secret
      session.wiped = true
      session.claimView = null
      claimLoadKey = ''
      session.claimPhase = 'idle'
      if (session.plain) go('claim')
      else {
        session.after = 'claim'
        replaceUrl('#/claim')
      }
      return
    }
    if (parsed.link.kind === 'pay') {
      applyPay(parsed.link)
      if (session.plain) go('send')
      else session.after = 'send'
      return
    }
  }
  const route = routeFromHash()
  if (route && route !== session.route) go(route)
}

async function loadConfig(): Promise<void> {
  try {
    const origin = hostAllowed(location.origin) ? location.origin : 'https://scdo.com.au'
    const raw = await fetchWalletUi(origin)
    let previous: string | null = null
    try {
      previous = localStorage.getItem('scdoapp_cfg_min')
    } catch {
      previous = null
    }
    const accepted = acceptConfig(raw, previous)
    if (!accepted.accepted) return
    try {
      localStorage.setItem('scdoapp_cfg_min', accepted.config.minVersion)
    } catch {
      /* ignore */
    }
    session.ui = accepted.config
    useRpcBases(accepted.config.links.rpc)
    session.updateRequired = accepted.updateRequired
    setStringOverrides(accepted.config.strings[getLang()])
    render()
  } catch {
    /* keep the built-in config */
  }
}

let suppressLegacy = false

export function boot(): void {
  const root = document.getElementById('app')
  try {
    setLang(detectLang())
    const parsed = parseLink(location.href)
    if (parsed.ok) {
      lockAttribution(localStorage, parsed.ref, parsed.src)
      if (parsed.link.kind === 'pay') {
        applyPay(parsed.link)
        session.after = 'send'
      }
      if (parsed.link.kind === 'invite') {
        session.secret = parsed.link.secret
        session.wiped = true
        session.after = 'claim'
      }
      if (parsed.link.kind === 'ton') session.ton = parsed.link.uri
      if (parsed.link.kind === 'join' && !session.after) session.after = 'home'
    }
    session.legacy = legacyVaultPresent()
    const hashed = routeFromHash()
    const routed = hashed ? routeWithLegacy(hashed, session.legacy) : null
    if (hashed === 'legacy' && !session.legacy && session.after !== 'claim' && session.after !== 'send') suppressLegacy = true
    if (!session.after && routed && routed !== 'welcome' && !suppressLegacy) session.after = routed
    replaceUrl(session.after && session.after !== 'welcome' ? '#/' + session.after : '#/')
    window.addEventListener('beforeinstallprompt', (ev) => {
      ev.preventDefault()
      session.install = ev as InstallPrompt
      const node = document.querySelector('[data-install]')
      if (node instanceof HTMLButtonElement) node.hidden = false
    })
    window.addEventListener('hashchange', onHash)
    armIdle()
    void continueBoot()
  } catch (e) {
    if (root) root.textContent = e instanceof Error ? e.message : 'Failed to start'
  }
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  const url = import.meta.env.BASE_URL + 'sw.js'
  const factory = (globalThis as { trustedTypes?: { createPolicy(name: string, rules: { createScriptURL(input: string): string }): { createScriptURL(input: string): string } } }).trustedTypes
  const script = factory
    ? factory.createPolicy('scdo', {
        createScriptURL: (input) => {
          if (input !== url) throw new Error('script')
          return input
        },
      }).createScriptURL(url)
    : url
  void navigator.serviceWorker.register(script, { scope: import.meta.env.BASE_URL }).catch(() => {
    /* install is optional */
  })
}

async function continueBoot(): Promise<void> {
  try {
    session.stored = await idbGetVault()
  } catch {
    session.stored = null
  }
  session.legacy = legacyVaultPresent()
  const askedLegacy = suppressLegacy || session.after === 'legacy' || routeFromHash() === 'legacy'
  suppressLegacy = false
  if (askedLegacy && !session.legacy && session.after !== 'claim' && session.after !== 'send') {
    go('home')
    void loadConfig()
    registerServiceWorker()
    return
  }
  session.route = session.stored ? 'unlock' : 'welcome'
  render()
  void loadConfig()
  registerServiceWorker()
}
