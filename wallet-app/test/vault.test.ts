import { describe, expect, it } from 'vitest'
import { randomBytes, wipe } from '../src/bytes'
import { PBKDF2_ITERATIONS, emptyVault, importLegacyVault, openVault, openWithPrf, sealLegacyVault, sealVault, wrapDekWithPrf } from '../src/vault'

const PRIV = '0x1ab42cc412b618bdea3a599e3c9bae199ebf030895b039e9db1e30dafb12b727' as const

describe('vault', () => {
  it('seals with PBKDF2-SHA256 at 600000 iterations', async () => {
    const plain = emptyVault({ id: 'a', name: 'Main', priv: PRIV, mnemonic: 'test phrase' })
    const { stored, dek } = await sealVault(plain, 'password1')
    expect(stored.password.iterations).toBe(600_000)
    expect(PBKDF2_ITERATIONS).toBe(600_000)
    const opened = await openVault(stored, 'password1')
    expect(opened.plain.accounts[0]?.priv).toBe(PRIV)
    expect(opened.dek.length).toBe(32)
    wipe(dek)
  })

  it('round-trips a password wrap and a passkey wrap without deleting the legacy key', async () => {
    const plain = emptyVault({ id: 'a', name: 'Main', priv: PRIV })
    const { stored, dek } = await sealVault(plain, 'password1', 1000)
    await expect(openVault(stored, 'wrong-password')).rejects.toThrow('WRONG_PASSWORD')
    const prf = randomBytes(32)
    stored.passkey = await wrapDekWithPrf(dek, prf, randomBytes(16), randomBytes(16))
    const viaPrf = await openWithPrf(stored, prf)
    expect(viaPrf.plain.accounts[0]?.priv).toBe(PRIV)
    wipe(prf)
    wipe(dek)

    const blob = await sealLegacyVault({ accounts: [{ priv: PRIV, name: 'old', mn: 'abandon abandon' }] }, 'password1', 800)
    let removed = 0
    const storage = {
      getItem: (key: string) => (key === 'scdo_vault' ? JSON.stringify(blob) : null),
      removeItem: () => {
        removed += 1
      },
    }
    const imported = await importLegacyVault(storage, 'password1')
    expect(removed).toBe(0)
    expect(storage.getItem('scdo_vault')).toContain('"v":1')
    expect(imported.accounts[0]?.priv).toBe(PRIV)
    expect(imported.accounts[0]?.mn).toBe('abandon abandon')
  })
})
