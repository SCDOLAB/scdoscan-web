import { encode } from 'uqr'

/** Draw a QR code onto a canvas. SVG strings are not inserted into the page. */
export function drawQr(canvas: HTMLCanvasElement, text: string): void {
  const qr = encode(text, { ecc: 'M', border: 2 })
  const size = qr.size
  const scale = Math.max(3, Math.floor(280 / size))
  canvas.width = size * scale
  canvas.height = size * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#142018'
  for (let y = 0; y < size; y++) {
    const row = qr.data[y]
    if (!row) continue
    for (let x = 0; x < size; x++) {
      if (row[x]) ctx.fillRect(x * scale, y * scale, scale, scale)
    }
  }
}
