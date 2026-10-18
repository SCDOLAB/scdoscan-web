/** Decimal helpers for display and form input. No network. */

export function formatUnits(value: bigint, decimals: number): string {
  const neg = value < 0n
  const v = neg ? -value : value
  if (decimals <= 0) return (neg ? '-' : '') + v.toString()
  const base = 10n ** BigInt(decimals)
  const whole = v / base
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '')
  return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '')
}

export function parseUnits(input: string, decimals: number): bigint {
  const s = input.trim()
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('amount')
  const [iRaw, fRaw = ''] = s.split('.')
  const i = iRaw.replace(/^0+(?=\d)/, '') || '0'
  if (decimals <= 0) {
    if (fRaw && /[1-9]/.test(fRaw)) throw new Error('amount')
    return BigInt(i)
  }
  if (fRaw.length > decimals && /[1-9]/.test(fRaw.slice(decimals))) throw new Error('amount')
  const frac = (fRaw + '0'.repeat(decimals)).slice(0, decimals)
  return BigInt(i) * 10n ** BigInt(decimals) + BigInt(frac || '0')
}

export function shortAddr(addr: string): string {
  if (addr.length <= 16) return addr
  return addr.slice(0, 8) + '…' + addr.slice(-4)
}
