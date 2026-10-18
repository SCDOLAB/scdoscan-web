/**
 * Canonical JSON.
 * Agent ledger: same rules as the desktop envelope (sorted keys, no whitespace,
 * arrays in order, undefined dropped, null kept).
 * Signed config: same byte rules as the desktop updater (drop `signature`, then
 * the same compact sorted JSON).
 */

export function canonical(v: unknown): string {
  if (v === null || typeof v !== 'object') {
    if (typeof v === 'number' && !Number.isFinite(v)) return 'null'
    return JSON.stringify(v === undefined ? null : v)
  }
  if (Array.isArray(v)) return '[' + v.map((item) => canonical(item)).join(',') + ']'
  const obj = v as Record<string, unknown>
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}'
}

export function canonicalSigned(obj: Record<string, unknown>): string {
  const copy: Record<string, unknown> = { ...obj }
  delete copy.signature
  return canonical(copy)
}
