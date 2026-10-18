/**
 * WebAuthn PRF unlock. The PRF output wraps the vault DEK locally.
 * It is never sent anywhere. Password unlock remains available.
 */
import { b64Decode, randomBytes } from './bytes'

export function passkeyAvailable(): boolean {
  return typeof PublicKeyCredential !== 'undefined' && typeof navigator !== 'undefined' && !!navigator.credentials
}

function buf(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

export async function createPasskey(): Promise<{ credentialId: Uint8Array; prf: Uint8Array; prfSalt: Uint8Array } | null> {
  if (!passkeyAvailable()) return null
  const rpId = location.hostname
  const userId = randomBytes(16)
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'SCDO Wallet', id: rpId },
      user: { id: buf(userId), name: 'SCDO Wallet', displayName: 'SCDO Wallet' },
      challenge: buf(randomBytes(32)),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
      timeout: 60000,
      extensions: { prf: {} } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!cred) return null
  const created = cred.getClientExtensionResults() as { prf?: { enabled?: boolean } }
  if (!created.prf?.enabled) return null
  const prfSalt = randomBytes(32)
  const prf = await readPrf(new Uint8Array(cred.rawId), prfSalt)
  if (!prf) return null
  return { credentialId: new Uint8Array(cred.rawId), prf, prfSalt }
}

export async function readPrf(credentialId: Uint8Array, prfSalt: Uint8Array): Promise<Uint8Array | null> {
  if (!passkeyAvailable()) return null
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge: buf(randomBytes(32)),
      rpId: location.hostname,
      allowCredentials: [{ id: buf(credentialId), type: 'public-key' }],
      userVerification: 'required',
      timeout: 60000,
      extensions: { prf: { eval: { first: buf(prfSalt) } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null
  if (!cred) return null
  const ext = cred.getClientExtensionResults() as { prf?: { results?: { first?: ArrayBuffer } } }
  const first = ext.prf?.results?.first
  if (!first || first.byteLength !== 32) return null
  return new Uint8Array(first)
}

export function passkeyIds(stored: { passkey?: { credentialId?: string; prfSalt?: string } }): { id: Uint8Array; salt: Uint8Array } | null {
  if (!stored.passkey?.credentialId || !stored.passkey.prfSalt) return null
  return { id: b64Decode(stored.passkey.credentialId), salt: b64Decode(stored.passkey.prfSalt) }
}
