/**
 * Local vault.
 * New vaults live in IndexedDB. A random DEK encrypts the JSON (AES-256-GCM).
 * The DEK is wrapped by PBKDF2-SHA256 (600,000 iterations, matching the live
 * web wallet) and, when the device supports it, by a WebAuthn PRF output.
 * The legacy localStorage `scdo_vault` blob is read-only: this module never
 * deletes it.
 */
import { b64Decode, b64Encode, hexToBytes, randomBytes, utf8, wipe } from './bytes'

export const PBKDF2_ITERATIONS = 600_000
export const LEGACY_VAULT_KEY = 'scdo_vault'

export interface VaultAccount {
  id: string
  name: string
  priv: `0x${string}`
  mnemonic?: string
}

export interface VaultInvite {
  claimKey: `0x${string}`
  secret: `0x${string}`
  giftWei: string
  sponsorFeeWei: string
  expiresAt: number
  txHash?: string
  createdAt: number
}

export interface VaultAgent {
  priv: `0x${string}`
  address: `0x${string}`
  seq: number
  registered: boolean
  ref: string | null
  src: string | null
  refcode?: string
  shareUrl?: string
  payout: `0x${string}`
}

export interface VaultPlain {
  v: 2
  accounts: VaultAccount[]
  active: string
  agent?: VaultAgent
  invites: VaultInvite[]
}

export interface Wrap {
  salt?: string
  iv: string
  ct: string
  iterations?: number
  credentialId?: string
  prfSalt?: string
}

export interface StoredVault {
  v: 2
  cipher: 'AES-GCM'
  password: Wrap
  passkey?: Wrap
  dataIv: string
  data: string
}

export interface LegacyBlob {
  v: number
  data: string
  iv: string
  salt: string
  cipher?: string
  keyMetadata?: { algorithm?: string; params?: { iterations?: number; hash?: string } }
}

function requireSubtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto unavailable')
  return globalThis.crypto.subtle
}

/** Copy into a fresh ArrayBuffer. WebCrypto rejects a SharedArrayBuffer view. */
function rawBytes(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  return copy
}

async function pbkdf2Key(password: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const subtle = requireSubtle()
  const base = await subtle.importKey('raw', rawBytes(utf8(password)), 'PBKDF2', false, ['deriveKey'])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: rawBytes(salt), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

async function aesEncrypt(key: CryptoKey, plain: Uint8Array): Promise<{ iv: Uint8Array; ct: Uint8Array }> {
  const iv = randomBytes(12)
  const ct = new Uint8Array(await requireSubtle().encrypt({ name: 'AES-GCM', iv: rawBytes(iv) }, key, rawBytes(plain)))
  return { iv, ct }
}

async function aesDecrypt(key: CryptoKey, iv: Uint8Array, ct: Uint8Array): Promise<Uint8Array> {
  const pt = await requireSubtle().decrypt({ name: 'AES-GCM', iv: rawBytes(iv) }, key, rawBytes(ct))
  return new Uint8Array(pt)
}

async function importRawAes(raw: Uint8Array): Promise<CryptoKey> {
  return requireSubtle().importKey('raw', rawBytes(raw), 'AES-GCM', false, ['encrypt', 'decrypt'])
}

export function emptyVault(account: VaultAccount): VaultPlain {
  return { v: 2, accounts: [account], active: account.id, invites: [] }
}

export async function sealVault(plain: VaultPlain, password: string, iterations = PBKDF2_ITERATIONS): Promise<{ stored: StoredVault; dek: Uint8Array }> {
  if (password.length < 8) throw new Error('password too short')
  const dek = randomBytes(32)
  const salt = randomBytes(16)
  const pwKey = await pbkdf2Key(password, salt, iterations)
  const wrapped = await aesEncrypt(pwKey, dek)
  const dataKey = await importRawAes(dek)
  const data = await aesEncrypt(dataKey, utf8(JSON.stringify(plain)))
  const stored: StoredVault = {
    v: 2,
    cipher: 'AES-GCM',
    password: { salt: b64Encode(salt), iv: b64Encode(wrapped.iv), ct: b64Encode(wrapped.ct), iterations },
    dataIv: b64Encode(data.iv),
    data: b64Encode(data.ct),
  }
  return { stored, dek }
}

export async function openVault(stored: StoredVault, password: string): Promise<{ plain: VaultPlain; dek: Uint8Array }> {
  const salt = b64Decode(stored.password.salt || '')
  const iterations = stored.password.iterations || PBKDF2_ITERATIONS
  const pwKey = await pbkdf2Key(password, salt, iterations)
  let dek: Uint8Array
  try {
    dek = await aesDecrypt(pwKey, b64Decode(stored.password.iv), b64Decode(stored.password.ct))
  } catch {
    throw new Error('WRONG_PASSWORD')
  }
  return decryptWithDek(stored, dek)
}

export async function decryptWithDek(stored: StoredVault, dek: Uint8Array): Promise<{ plain: VaultPlain; dek: Uint8Array }> {
  if (dek.length !== 32) throw new Error('bad dek')
  const dataKey = await importRawAes(dek)
  let pt: Uint8Array
  try {
    pt = await aesDecrypt(dataKey, b64Decode(stored.dataIv), b64Decode(stored.data))
  } catch {
    throw new Error('WRONG_PASSWORD')
  }
  const plain = JSON.parse(new TextDecoder().decode(pt)) as VaultPlain
  if (!plain || !Array.isArray(plain.accounts)) throw new Error('vault is corrupt')
  if (!plain.invites) plain.invites = []
  return { plain, dek }
}

export async function resealData(stored: StoredVault, dek: Uint8Array, plain: VaultPlain): Promise<StoredVault> {
  const dataKey = await importRawAes(dek)
  const data = await aesEncrypt(dataKey, utf8(JSON.stringify(plain)))
  return { ...stored, dataIv: b64Encode(data.iv), data: b64Encode(data.ct) }
}

/** Wrap an existing DEK with a 32-byte passkey PRF output. */
export async function wrapDekWithPrf(dek: Uint8Array, prf: Uint8Array, credentialId: Uint8Array, prfSalt: Uint8Array): Promise<Wrap> {
  if (prf.length !== 32) throw new Error('bad prf')
  const key = await importRawAes(prf)
  const wrapped = await aesEncrypt(key, dek)
  return {
    iv: b64Encode(wrapped.iv),
    ct: b64Encode(wrapped.ct),
    credentialId: b64Encode(credentialId),
    prfSalt: b64Encode(prfSalt),
  }
}

export async function openWithPrf(stored: StoredVault, prf: Uint8Array): Promise<{ plain: VaultPlain; dek: Uint8Array }> {
  if (!stored.passkey) throw new Error('no passkey')
  const key = await importRawAes(prf)
  let dek: Uint8Array
  try {
    dek = await aesDecrypt(key, b64Decode(stored.passkey.iv), b64Decode(stored.passkey.ct))
  } catch {
    throw new Error('PASSKEY_FAILED')
  }
  return decryptWithDek(stored, dek)
}

/** Live web wallet blob. AES-GCM of the JSON, key = PBKDF2(password). */
export async function sealLegacyVault(plain: unknown, password: string, iterations = PBKDF2_ITERATIONS): Promise<LegacyBlob> {
  const salt = randomBytes(16)
  const key = await pbkdf2Key(password, salt, iterations)
  const enc = await aesEncrypt(key, utf8(JSON.stringify(plain)))
  return {
    v: 1,
    data: b64Encode(enc.ct),
    iv: b64Encode(enc.iv),
    salt: b64Encode(salt),
    cipher: 'AES-GCM',
    keyMetadata: { algorithm: 'PBKDF2', params: { iterations, hash: 'SHA-256' } },
  }
}

export async function openLegacyVault(blob: LegacyBlob, password: string): Promise<{ accounts: { priv: string; name?: string; mn?: string }[] }> {
  if (!blob || !blob.data || !blob.iv || !blob.salt) throw new Error('not a vault')
  const iterations = blob.keyMetadata?.params?.iterations || PBKDF2_ITERATIONS
  const key = await pbkdf2Key(password, b64Decode(blob.salt), iterations)
  let pt: Uint8Array
  try {
    pt = await aesDecrypt(key, b64Decode(blob.iv), b64Decode(blob.data))
  } catch {
    throw new Error('WRONG_PASSWORD')
  }
  const obj = JSON.parse(new TextDecoder().decode(pt)) as { accounts?: { priv: string; name?: string; mn?: string }[] }
  if (!obj || !Array.isArray(obj.accounts)) throw new Error('vault is corrupt')
  return { accounts: obj.accounts.filter((a) => a && a.priv) }
}

export interface LegacyStorage {
  getItem(key: string): string | null
  removeItem?(key: string): void
}

/**
 * Read `scdo_vault`. Does not call removeItem. The old blob stays so the
 * previous wallet can still open it.
 */
export async function importLegacyVault(storage: LegacyStorage, password: string): Promise<{ accounts: { priv: string; name?: string; mn?: string }[] }> {
  const raw = storage.getItem(LEGACY_VAULT_KEY)
  if (!raw) throw new Error('no legacy vault')
  const blob = JSON.parse(raw) as LegacyBlob
  return openLegacyVault(blob, password)
}

const DB = 'scdo-wallet-app'
const STORE = 'kv'
const RECORD = 'vault'

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function idbGetVault(): Promise<StoredVault | null> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly')
    const req = tx.objectStore(STORE).get(RECORD)
    req.onsuccess = () => resolve((req.result as StoredVault) || null)
    req.onerror = () => reject(req.error)
  })
}

export async function idbPutVault(stored: StoredVault): Promise<void> {
  const db = await idb()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).put(stored, RECORD)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  })
}

export function wipePlain(plain: VaultPlain | null): void {
  if (!plain) return
  const clear = (hex: string) => {
    try {
      if (hex.startsWith('0x') && hex.length > 2) wipe(hexToBytes(hex))
    } catch {
      /* already cleared */
    }
  }
  for (const a of plain.accounts) {
    clear(a.priv)
    a.priv = '0x'
    if (a.mnemonic) a.mnemonic = ''
  }
  if (plain.agent) {
    clear(plain.agent.priv)
    plain.agent.priv = '0x'
  }
  for (const inv of plain.invites) {
    clear(inv.secret)
    inv.secret = '0x'
  }
}
