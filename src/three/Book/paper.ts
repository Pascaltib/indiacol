import { PAPER, PAPER_DARK } from './constants'

let paperCanvas: HTMLCanvasElement | null = null
let leatherCanvas: HTMLCanvasElement | null = null

/** Deterministic pseudo-random for repeatable textures */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Procedural cream paper with fibres and grain, 1024x1376, tiled where needed. */
export function getPaper(w: number, h: number) {
  if (paperCanvas && paperCanvas.width === w && paperCanvas.height === h) return paperCanvas
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const rnd = mulberry32(1337)

  // base with slight warm gradient
  const g = ctx.createLinearGradient(0, 0, w, h)
  g.addColorStop(0, PAPER)
  g.addColorStop(1, '#ede3cf')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  // grain
  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 14
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n * 0.9
  }
  ctx.putImageData(img, 0, 0)

  // fibres
  ctx.strokeStyle = 'rgba(120, 95, 60, 0.07)'
  ctx.lineWidth = 1
  for (let i = 0; i < 900; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const len = 6 + rnd() * 26
    const a = rnd() * Math.PI
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len)
    ctx.stroke()
  }
  // blotches
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w
    const y = rnd() * h
    const r = 30 + rnd() * 120
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r)
    rg.addColorStop(0, 'rgba(160,130,80,0.05)')
    rg.addColorStop(1, 'rgba(160,130,80,0)')
    ctx.fillStyle = rg
    ctx.fillRect(x - r, y - r, r * 2, r * 2)
  }
  // vignette toward edges
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.max(w, h) * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)')
  vg.addColorStop(1, 'rgba(90,60,20,0.10)')
  ctx.fillStyle = vg
  ctx.fillRect(0, 0, w, h)

  paperCanvas = c
  return c
}

/** Deep indigo leather with a soft grain and lighter worn edges */
export function getLeather(w: number, h: number, color: string, light: string) {
  if (leatherCanvas && leatherCanvas.width === w && leatherCanvas.height === h) return leatherCanvas
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')!
  const rnd = mulberry32(99)

  const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8)
  g.addColorStop(0, light)
  g.addColorStop(1, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)

  const img = ctx.getImageData(0, 0, w, h)
  const d = img.data
  for (let i = 0; i < d.length; i += 4) {
    const n = (rnd() - 0.5) * 22
    d[i] += n
    d[i + 1] += n
    d[i + 2] += n
  }
  ctx.putImageData(img, 0, 0)

  // leather cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.12)'
  ctx.lineWidth = 1
  for (let i = 0; i < 700; i++) {
    let x = rnd() * w
    let y = rnd() * h
    ctx.beginPath()
    ctx.moveTo(x, y)
    const steps = 3 + Math.floor(rnd() * 5)
    for (let s = 0; s < steps; s++) {
      x += (rnd() - 0.5) * 30
      y += (rnd() - 0.5) * 30
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
  // worn highlights
  ctx.strokeStyle = 'rgba(255,255,255,0.05)'
  for (let i = 0; i < 300; i++) {
    const x = rnd() * w
    const y = rnd() * h
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + (rnd() - 0.5) * 20, y + (rnd() - 0.5) * 20)
    ctx.stroke()
  }
  leatherCanvas = c
  return c
}

/** Block-print inspired endpaper pattern */
export function drawEndpaper(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = PAPER_DARK
  ctx.fillRect(0, 0, w, h)
  const cell = 96
  ctx.save()
  for (let y = -cell; y < h + cell; y += cell) {
    for (let x = -cell; x < w + cell; x += cell) {
      const off = Math.floor(y / cell) % 2 ? cell / 2 : 0
      const cx = x + off
      const cy = y
      // paisley-ish teardrop
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(Math.PI / 5)
      ctx.beginPath()
      ctx.moveTo(0, -26)
      ctx.bezierCurveTo(22, -26, 24, 10, 0, 24)
      ctx.bezierCurveTo(-24, 10, -22, -26, 0, -26)
      ctx.strokeStyle = 'rgba(122, 46, 18, 0.55)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.beginPath()
      ctx.arc(0, -2, 6, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(181, 84, 28, 0.55)'
      ctx.fill()
      ctx.restore()
      // small dots between
      ctx.beginPath()
      ctx.arc(cx + cell / 2, cy + cell / 2, 3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(42, 31, 61, 0.35)'
      ctx.fill()
    }
  }
  ctx.restore()
}
