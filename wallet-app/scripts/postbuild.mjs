/**
 * Production HTML: CSP, SRI, service-worker asset list, BUILD.txt.
 * SOURCE_DATE_EPOCH is recorded; the file does not include a wall clock.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const root = join(import.meta.dirname, '..')
const dist = join(root, 'dist')

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self' https://scdo.com.au https://apeccapital.org",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "worker-src 'self'",
  "trusted-types scdo",
  "require-trusted-types-for 'script'",
].join('; ')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else out.push(p)
  }
  return out
}

function sri(file) {
  return 'sha384-' + createHash('sha384').update(readFileSync(file)).digest('base64')
}

let html = readFileSync(join(dist, 'index.html'), 'utf8')
if (!html.includes('Content-Security-Policy')) {
  html = html.replace('<head>', '<head>\n    <meta http-equiv="Content-Security-Policy" content="' + CSP + '" />')
}

html = html.replace(/<(script|link)\b([^>]*?)>/g, (full, tag, attrs) => {
  const stylesheet = /rel="stylesheet"|rel='stylesheet'/.test(attrs)
  const preload = /rel="modulepreload"|rel='modulepreload'/.test(attrs)
  if (tag === 'link' && !stylesheet && !preload) return full
  if (tag === 'script' && !/src=/.test(attrs)) return full
  if (/integrity=/.test(attrs)) return full
  const src = /(?:src|href)="([^"]+)"/.exec(attrs)
  if (!src) return full
  const relPath = src[1].replace(/^\//, '').replace(/^wallet\/app\//, '')
  let integrity = ''
  try {
    integrity = sri(join(dist, relPath))
  } catch {
    return full
  }
  const cross = /crossorigin/.test(attrs) ? '' : ' crossorigin="anonymous"'
  return '<' + tag + attrs + ' integrity="' + integrity + '"' + cross + '>'
})
writeFileSync(join(dist, 'index.html'), html)

const precache = walk(dist)
  .map((file) => relative(dist, file).split(sep).join('/'))
  .filter((rel) => rel !== 'sw.js' && rel !== 'BUILD.txt')
  .sort()
  .map((rel) => '/wallet/app/' + rel)

let sw = readFileSync(join(dist, 'sw.js'), 'utf8')
if (!sw.includes('const ASSETS = []')) throw new Error('service worker asset placeholder missing')
sw = sw.replace('const ASSETS = []', 'const ASSETS = ' + JSON.stringify(precache))
writeFileSync(join(dist, 'sw.js'), sw)

const listed = walk(dist)
  .map((file) => relative(dist, file).split(sep).join('/'))
  .filter((rel) => rel !== 'BUILD.txt')
  .sort()

const lines = ['SOURCE_DATE_EPOCH=1700000000', 'name=scdo-wallet-app', 'version=0.1.0', 'node=22']
for (const rel of listed) {
  const hash = createHash('sha256').update(readFileSync(join(dist, rel))).digest('hex')
  lines.push(hash + '  ' + rel)
}
writeFileSync(join(dist, 'BUILD.txt'), lines.join('\n') + '\n')
console.log('postbuild ok', listed.length, 'files')
