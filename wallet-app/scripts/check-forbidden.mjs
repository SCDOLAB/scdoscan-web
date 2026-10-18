/**
 * Fail the build if wallet-app grows a blocked host, a menu fetch,
 * analytics, or a wipe of the legacy vault.
 * The legacy explorer hostname may appear only in src/links.ts, and only as
 * a read-only QR host compare. It must not be a URL and that file must not fetch.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const roots = process.argv.slice(2)
if (!roots.length) {
  console.error('usage: node scripts/check-forbidden.mjs <dir>...')
  process.exit(2)
}

function walk(dir, out = []) {
  if (statSync(dir).isFile()) {
    out.push(dir)
    return out
  }
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

const files = []
for (const root of roots) walk(root, files)

let bad = 0
function fail(file, message) {
  console.error(file + ': ' + message)
  bad += 1
}

for (const file of files) {
  const rel = file.replaceAll('\\', '/')
  if (rel.endsWith('scripts/check-forbidden.mjs')) continue
  const text = readFileSync(file, 'utf8')
  if (text.includes('82.223.19.88')) fail(rel, 'blocked address')
  if (text.includes('site-functions')) fail(rel, 'do not load the menu config')
  if (/google-analytics|googletagmanager|gtag\s*\(/.test(text)) fail(rel, 'analytics')
  if (/localStorage\.clear\s*\(/.test(text)) fail(rel, 'localStorage.clear')
  if (/removeItem\(\s*['"]scdo_/.test(text)) fail(rel, 'legacy vault must not be deleted')
  if (rel.endsWith('src/links.ts')) {
    if (/https?:\/\/scdoscan\.io/i.test(text)) fail(rel, 'legacy host must not be a URL')
    if (/\bfetch\s*\(/.test(text)) fail(rel, 'link parser must not fetch')
  } else if (text.includes('scdoscan.io')) {
    fail(rel, 'legacy host is read-only inside src/links.ts')
  }
  if (rel.endsWith('src/i18n.ts')) {
    if (/\b(mining|miner|stake|gamble|gambling|bet|casino|jackpot)\b/i.test(text) || /挖礦|挖矿/.test(text)) {
      fail(rel, 'bookkeeping wording')
    }
  }
  if (rel.includes('/src/') && /\binnerHTML\b|insertAdjacentHTML|document\.write\s*\(|\beval\s*\(|new Function\s*\(/.test(text)) {
    fail(rel, 'unsafe HTML or eval')
  }
}

if (bad) process.exit(1)
console.log('forbidden check ok (' + files.length + ' files)')
