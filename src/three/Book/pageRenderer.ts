import { book, chapters, formatDuration, layout, photoUrl, totalPhotos, totalWords, videoPosterUrl, yearOf } from '../../content/book'
import { dedication, epigraph, farewell } from '../../content/dedication'
import type { ChapterPage, Face, Item } from '../../content/types'
import { ACCENT, ACCENT_DEEP, COVER_COLOR, COVER_COLOR_LIGHT, GOLD, INK, INK_SOFT } from './constants'
import { drawEndpaper, getLeather, getPaper } from './paper'
import { BODY_FONT, H, MARGIN_BOTTOM, MARGIN_INNER, MARGIN_OUTER, TITLE_FONT, W, ensureFonts, wrap } from './typography'

export { ensureFonts }

type Side = Face['side']

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

const imageCache = new Map<string, Promise<HTMLImageElement | null>>()
function loadImage(url: string): Promise<HTMLImageElement | null> {
  let p = imageCache.get(url)
  if (!p) {
    p = new Promise((resolve) => {
      const img = new Image()
      img.decoding = 'async'
      img.onload = () => resolve(img)
      img.onerror = () => resolve(null)
      img.src = url
    })
    imageCache.set(url, p)
  }
  return p
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------

function drawLine(ctx: CanvasRenderingContext2D, line: string, x: number, y: number, width: number, justify: boolean) {
  if (!justify) {
    ctx.fillText(line, x, y)
    return
  }
  const words = line.split(' ')
  if (words.length < 2) {
    ctx.fillText(line, x, y)
    return
  }
  const textW = words.reduce((n, w) => n + ctx.measureText(w).width, 0)
  const gap = (width - textW) / (words.length - 1)
  if (gap > ctx.measureText(' ').width * 3) {
    ctx.fillText(line, x, y)
    return
  }
  let cx = x
  for (const w of words) {
    ctx.fillText(w, cx, y)
    cx += ctx.measureText(w).width + gap
  }
}

function centered(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, font: string, color: string, letterSpacing = 0) {
  ctx.font = font
  ctx.fillStyle = color
  ctx.textAlign = 'center'
  if (letterSpacing) {
    const prev = (ctx as unknown as { letterSpacing?: string }).letterSpacing
    ;(ctx as unknown as { letterSpacing?: string }).letterSpacing = `${letterSpacing}px`
    ctx.fillText(text, cx, y)
    ;(ctx as unknown as { letterSpacing?: string }).letterSpacing = prev ?? '0px'
  } else {
    ctx.fillText(text, cx, y)
  }
  ctx.textAlign = 'left'
}

function centeredWrapped(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxWidth: number, leading: number, font: string, color: string) {
  ctx.font = font
  const lines = wrap(ctx, text, maxWidth)
  for (const l of lines) {
    centered(ctx, l, cx, y, font, color)
    y += leading
  }
  return y
}

// ---------------------------------------------------------------------------
// Decorations
// ---------------------------------------------------------------------------

function ornament(ctx: CanvasRenderingContext2D, cx: number, cy: number, width: number, color = ACCENT) {
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(cx - width / 2, cy)
  ctx.lineTo(cx - 18, cy)
  ctx.moveTo(cx + 18, cy)
  ctx.lineTo(cx + width / 2, cy)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx, cy - 8)
  ctx.lineTo(cx + 8, cy)
  ctx.lineTo(cx, cy + 8)
  ctx.lineTo(cx - 8, cy)
  ctx.closePath()
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx - width / 2, cy, 2.5, 0, Math.PI * 2)
  ctx.arc(cx + width / 2, cy, 2.5, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function mandala(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, color: string, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineWidth = 1.6
  ctx.translate(cx, cy)
  for (const k of [1, 0.78, 0.5]) {
    ctx.beginPath()
    ctx.arc(0, 0, r * k, 0, Math.PI * 2)
    ctx.stroke()
  }
  const petals = 16
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2
    ctx.save()
    ctx.rotate(a)
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.5)
    ctx.bezierCurveTo(r * 0.16, -r * 0.62, r * 0.16, -r * 0.9, 0, -r * 0.98)
    ctx.bezierCurveTo(-r * 0.16, -r * 0.9, -r * 0.16, -r * 0.62, 0, -r * 0.5)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, -r * 0.36, r * 0.035, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8
    ctx.save()
    ctx.rotate(a)
    ctx.beginPath()
    ctx.moveTo(0, -r * 0.14)
    ctx.quadraticCurveTo(r * 0.1, -r * 0.3, 0, -r * 0.46)
    ctx.quadraticCurveTo(-r * 0.1, -r * 0.3, 0, -r * 0.14)
    ctx.stroke()
    ctx.restore()
  }
  ctx.beginPath()
  ctx.arc(0, 0, r * 0.07, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function gutter(ctx: CanvasRenderingContext2D, face: Side) {
  // shadow in the fold
  const g = face === 'front' ? ctx.createLinearGradient(0, 0, 90, 0) : ctx.createLinearGradient(W, 0, W - 90, 0)
  g.addColorStop(0, 'rgba(60,40,20,0.22)')
  g.addColorStop(0.5, 'rgba(60,40,20,0.06)')
  g.addColorStop(1, 'rgba(60,40,20,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

function pageFurniture(ctx: CanvasRenderingContext2D, face: Side, pageNumber: number | null, runningHead: string) {
  ctx.fillStyle = INK_SOFT
  ctx.font = `400 22px ${TITLE_FONT}`
  const outerX = face === 'front' ? W - MARGIN_OUTER : MARGIN_OUTER
  ctx.textAlign = face === 'front' ? 'right' : 'left'
  if (pageNumber != null) ctx.fillText(String(pageNumber), outerX, H - 58)
  ctx.font = `italic 400 21px ${TITLE_FONT}`
  ctx.textAlign = face === 'front' ? 'left' : 'right'
  const innerX = face === 'front' ? MARGIN_INNER : W - MARGIN_INNER
  ctx.fillText(runningHead, innerX, H - 58)
  ctx.textAlign = 'left'
}

/** A photo print with a white border and soft shadow, drawn at an exact rectangle. */
function photoAt(ctx: CanvasRenderingContext2D, img: HTMLImageElement | null, dx: number, dy: number, dw: number, dh: number) {
  ctx.save()
  ctx.shadowColor = 'rgba(40,25,10,0.35)'
  ctx.shadowBlur = 18
  ctx.shadowOffsetY = 6
  ctx.fillStyle = '#fbf7ee'
  ctx.fillRect(dx - 10, dy - 10, dw + 20, dh + 20)
  ctx.restore()
  if (img) {
    // cover-fit: the layout already used the intrinsic ratio, so this is a no-op crop in practice
    const r = img.naturalWidth / img.naturalHeight
    let sw = img.naturalWidth
    let sh = img.naturalHeight
    if (r > dw / dh) sw = sh * (dw / dh)
    else sh = sw / (dw / dh)
    ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, dx, dy, dw, dh)
    // subtle warm wash to unify photos with the paper
    ctx.save()
    ctx.globalAlpha = 0.08
    ctx.fillStyle = '#c9a060'
    ctx.fillRect(dx, dy, dw, dh)
    ctx.restore()
  } else {
    ctx.fillStyle = '#d9cdb5'
    ctx.fillRect(dx, dy, dw, dh)
  }
}

function videoAt(ctx: CanvasRenderingContext2D, it: Extract<Item, { type: 'video' }>, poster: HTMLImageElement | null) {
  const { x, y, w, h } = it
  if (poster) {
    photoAt(ctx, poster, x, y, w, h)
    // darken a touch so the play badge reads
    ctx.fillStyle = 'rgba(20,12,24,0.28)'
    ctx.fillRect(x, y, w, h)
  } else {
    ctx.save()
    ctx.shadowColor = 'rgba(40,25,10,0.35)'
    ctx.shadowBlur = 18
    ctx.shadowOffsetY = 6
    ctx.fillStyle = '#fbf7ee'
    ctx.fillRect(x - 10, y - 10, w + 20, h + 20)
    ctx.restore()
    const g = ctx.createLinearGradient(x, y, x + w, y + h)
    g.addColorStop(0, '#2e2538')
    g.addColorStop(1, '#141019')
    ctx.fillStyle = g
    ctx.fillRect(x, y, w, h)
  }
  // play badge
  const cx = x + w / 2
  const cy = y + h / 2
  const r = Math.min(46, w * 0.12)
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(20,12,24,0.45)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(243,235,219,0.85)'
  ctx.lineWidth = 2
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.26, cy - r * 0.43)
  ctx.lineTo(cx + r * 0.43, cy)
  ctx.lineTo(cx - r * 0.26, cy + r * 0.43)
  ctx.closePath()
  ctx.fillStyle = 'rgba(243,235,219,0.95)'
  ctx.fill()
  ctx.restore()
  const label = it.video.file ? `VIDEO · ${formatDuration(it.video.duration ?? 0)} · toca para reproducir` : 'VIDEO'
  centered(ctx, label, cx, y + h - 22, `500 17px ${TITLE_FONT}`, 'rgba(243,235,219,0.75)', 3)
}

function base(face: Side, kind: 'paper' | 'leather' | 'endpaper') {
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const ctx = c.getContext('2d')!
  if (kind === 'paper') {
    ctx.drawImage(getPaper(W, H), 0, 0)
    gutter(ctx, face)
  } else if (kind === 'leather') {
    ctx.drawImage(getLeather(W, H, COVER_COLOR, COVER_COLOR_LIGHT), 0, 0)
  } else {
    drawEndpaper(ctx, W, H)
    gutter(ctx, face)
  }
  ctx.textBaseline = 'alphabetic'
  return { c, ctx }
}

function embossedText(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, font: string, color: string, letterSpacing = 0) {
  ctx.save()
  ctx.globalAlpha = 0.55
  centered(ctx, text, cx + 2, y + 3, font, 'rgba(0,0,0,0.9)', letterSpacing)
  ctx.globalAlpha = 0.35
  centered(ctx, text, cx - 1, y - 1, font, 'rgba(255,240,200,0.9)', letterSpacing)
  ctx.restore()
  centered(ctx, text, cx, y, font, color, letterSpacing)
}

// ---------------------------------------------------------------------------
// Face renderers
// ---------------------------------------------------------------------------

async function renderCoverFront(): Promise<HTMLCanvasElement> {
  const { c, ctx } = base('front', 'leather')
  // frame
  ctx.strokeStyle = GOLD
  ctx.globalAlpha = 0.85
  ctx.lineWidth = 3
  ctx.strokeRect(58, 58, W - 116, H - 116)
  ctx.lineWidth = 1.2
  ctx.strokeRect(74, 74, W - 148, H - 148)
  ctx.globalAlpha = 1
  // corner flourishes
  for (const [sx, sy] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    ctx.save()
    ctx.translate(sx > 0 ? 74 : W - 74, sy > 0 ? 74 : H - 74)
    ctx.scale(sx, sy)
    ctx.strokeStyle = GOLD
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(0, 60)
    ctx.quadraticCurveTo(0, 0, 60, 0)
    ctx.moveTo(18, 40)
    ctx.quadraticCurveTo(18, 18, 40, 18)
    ctx.stroke()
    ctx.restore()
  }

  mandala(ctx, W / 2, 330, 150, GOLD, 0.9)

  embossedText(ctx, 'India,', W / 2, 650, `500 170px ${TITLE_FONT}`, GOLD)
  embossedText(ctx, 'tan lejos, tan cerca', W / 2, 760, `italic 400 88px ${TITLE_FONT}`, GOLD)
  ornament(ctx, W / 2, 830, 300, GOLD)

  embossedText(ctx, 'Crónicas de una colombiana en Nueva Delhi', W / 2, 900, `400 34px ${TITLE_FONT}`, GOLD, 1)

  embossedText(ctx, book.author.toUpperCase(), W / 2, H - 230, `500 40px ${TITLE_FONT}`, GOLD, 6)
  embossedText(ctx, '2012 — 2017', W / 2, H - 170, `400 30px ${TITLE_FONT}`, GOLD, 4)
  return c
}

async function renderCoverBack(): Promise<HTMLCanvasElement> {
  const { c, ctx } = base('back', 'leather')
  ctx.strokeStyle = GOLD
  ctx.globalAlpha = 0.7
  ctx.lineWidth = 2
  ctx.strokeRect(58, 58, W - 116, H - 116)
  ctx.globalAlpha = 1
  mandala(ctx, W / 2, 280, 90, GOLD, 0.8)

  let y = 470
  y = centeredWrapped(ctx, book.authorBio, W / 2, y, W - 300, 44, `italic 400 34px ${TITLE_FONT}`, GOLD)
  y += 40
  ornament(ctx, W / 2, y, 240, GOLD)
  y += 80
  centeredWrapped(
    ctx,
    `Treinta y seis capítulos escritos entre agosto de 2012 y diciembre de 2017, con ${totalPhotos} fotografías, sobre la vida de una familia colombiana en la India: el calor, la polución, los templos, los camellos, el Himalaya, las bodas, las elecciones, las mujeres, Holi, Varanasi y la despedida.`,
    W / 2,
    y,
    W - 280,
    40,
    `400 28px ${BODY_FONT}`,
    GOLD,
  )
  centered(ctx, 'indiacol.blogspot.com', W / 2, H - 170, `400 26px ${TITLE_FONT}`, GOLD, 3)
  return c
}

async function renderEndpaper(face: Side): Promise<HTMLCanvasElement> {
  const { c } = base(face, 'endpaper')
  return c
}

async function renderBlank(face: Face): Promise<HTMLCanvasElement> {
  const { c, ctx } = base(face.side, 'paper')
  pageFurniture(ctx, face.side, face.pageNo, '')
  return c
}

async function renderTitlePage(): Promise<HTMLCanvasElement> {
  const { c, ctx } = base('front', 'paper')
  mandala(ctx, W / 2, 300, 120, ACCENT, 0.55)
  centered(ctx, 'India,', W / 2, 600, `500 150px ${TITLE_FONT}`, INK)
  centered(ctx, 'tan lejos, tan cerca', W / 2, 700, `italic 400 78px ${TITLE_FONT}`, INK)
  ornament(ctx, W / 2, 770, 260)
  centeredWrapped(ctx, book.subtitle, W / 2, 840, W - 300, 40, `400 32px ${TITLE_FONT}`, INK_SOFT)
  centered(ctx, book.author, W / 2, H - 300, `500 44px ${TITLE_FONT}`, INK, 2)
  centered(ctx, 'Un libro hecho a partir del blog indiacol.blogspot.com', W / 2, H - 170, `italic 400 24px ${BODY_FONT}`, INK_SOFT)
  return c
}

async function renderDedication(): Promise<HTMLCanvasElement> {
  const { c, ctx } = base('back', 'paper')
  const cy = H / 2 - 120
  centered(ctx, dedication.title, W / 2, cy, `italic 500 72px ${TITLE_FONT}`, ACCENT_DEEP)
  let y = cy + 90
  for (const l of dedication.lines) {
    y = centeredWrapped(ctx, l, W / 2, y, W - 320, 46, `italic 400 34px ${BODY_FONT}`, INK)
    y += 4
  }
  ornament(ctx, W / 2, y + 40, 200)
  centered(ctx, dedication.signature, W / 2, y + 120, `400 30px ${TITLE_FONT}`, INK_SOFT, 2)
  centered(ctx, dedication.name, W / 2, y + 196, `italic 500 54px ${TITLE_FONT}`, ACCENT_DEEP)
  return c
}

async function renderIndex(face: Face): Promise<HTMLCanvasElement> {
  const { c, ctx } = base('front', 'paper')
  centered(ctx, 'ÍNDICE', W / 2, 200, `500 56px ${TITLE_FONT}`, INK, 10)
  ornament(ctx, W / 2, 240, 220)

  const colW = (W - MARGIN_INNER - MARGIN_OUTER - 40) / 2
  const cols = [MARGIN_INNER, MARGIN_INNER + colW + 40]
  const lineH = 33
  let col = 0
  let y = 320
  let lastYear = ''
  const maxY = H - MARGIN_BOTTOM - 20
  const byYear = chapters
  for (const ch of byYear) {
    const year = yearOf(ch.date)
    const needs = (year !== lastYear ? lineH + 18 : 0) + lineH
    if (y + needs > maxY && col === 0) {
      col = 1
      y = 320
      lastYear = ''
    }
    const x = cols[col]
    if (year !== lastYear) {
      y += 12
      ctx.font = `500 26px ${TITLE_FONT}`
      ctx.fillStyle = ACCENT
      ctx.fillText(year, x, y)
      y += lineH - 2
      lastYear = year
    }
    const pageNo = layout.chapterPageNo.get(ch.number) ?? 0
    ctx.font = `400 22px ${BODY_FONT}`
    ctx.fillStyle = INK
    const numStr = `${ch.number}.`
    ctx.fillText(numStr, x, y)
    const numW = 42
    const pageStr = String(pageNo)
    const pageW = ctx.measureText(pageStr).width
    let title = ch.title
    const avail = colW - numW - pageW - 26
    while (ctx.measureText(title).width > avail && title.length > 8) title = title.slice(0, -2).trimEnd() + '…'
    ctx.fillText(title, x + numW, y)
    // leader dots
    const tw = ctx.measureText(title).width
    ctx.fillStyle = INK_SOFT
    let dx = x + numW + tw + 10
    const endX = x + colW - pageW - 12
    ctx.font = `400 18px ${BODY_FONT}`
    while (dx < endX) {
      ctx.fillText('·', dx, y)
      dx += 9
    }
    ctx.font = `400 22px ${BODY_FONT}`
    ctx.fillStyle = INK
    ctx.textAlign = 'right'
    ctx.fillText(pageStr, x + colW, y)
    ctx.textAlign = 'left'
    y += lineH
  }
  pageFurniture(ctx, 'front', face.pageNo, '')
  return c
}

async function renderEpigraph(face: Face): Promise<HTMLCanvasElement> {
  const { c, ctx } = base('back', 'paper')
  const cy = H / 2 - 160
  centeredWrapped(ctx, epigraph.quote, W / 2, cy, W - 280, 76, `italic 400 62px ${TITLE_FONT}`, INK)
  centeredWrapped(ctx, epigraph.attribution, W / 2, cy + 150, W - 320, 36, `400 26px ${BODY_FONT}`, INK_SOFT)
  ornament(ctx, W / 2, cy + 230, 200)
  centered(ctx, epigraph.place, W / 2, cy + 300, `400 28px ${TITLE_FONT}`, INK_SOFT, 3)
  mandala(ctx, W / 2, H - 330, 70, ACCENT, 0.4)
  pageFurniture(ctx, 'back', face.pageNo, '')
  return c
}

// ---------------------------------------------------------------------------
// Chapter pages (pre-laid-out by layout.ts)
// ---------------------------------------------------------------------------

function drawItem(ctx: CanvasRenderingContext2D, it: Item, images: Map<string, HTMLImageElement | null>) {
  switch (it.type) {
    case 'line': {
      if (it.align && it.align !== 'left') {
        ctx.textAlign = it.align
        centered(ctx, it.text, it.x, it.y, it.font, it.color, it.spacing ?? 0)
        ctx.textAlign = 'left'
        return
      }
      ctx.font = it.font
      ctx.fillStyle = it.color
      ctx.textAlign = 'left'
      if (it.justify) drawLine(ctx, it.text, it.x, it.y, it.justify, true)
      else ctx.fillText(it.text, it.x, it.y)
      return
    }
    case 'dropcap':
      ctx.font = `500 ${it.size}px ${TITLE_FONT}`
      ctx.fillStyle = ACCENT_DEEP
      ctx.textAlign = 'left'
      ctx.fillText(it.letter, it.x, it.y)
      return
    case 'photo':
      photoAt(ctx, images.get(it.photo.id) ?? null, it.x, it.y, it.w, it.h)
      return
    case 'video':
      videoAt(ctx, it, it.video.file ? (images.get(`video:${it.video.file}`) ?? null) : null)
      return
    case 'ornament':
      ornament(ctx, it.cx, it.y, it.width)
      return
    case 'mandala':
      mandala(ctx, it.cx, it.cy, it.r, ACCENT, it.alpha)
      return
  }
}

async function renderChapterPage(face: Face, page: ChapterPage): Promise<HTMLCanvasElement> {
  // load the photos this page needs (larger source for big prints)
  const photos = page.items.filter((it): it is Extract<Item, { type: 'photo' }> => it.type === 'photo')
  const videos = page.items.filter((it): it is Extract<Item, { type: 'video' }> => it.type === 'video' && !!it.video.file)
  const loaded = await Promise.all([
    ...photos.map((p) => loadImage(photoUrl(p.photo.id, p.w > 560 ? 1600 : 640))),
    ...videos.map((v) => loadImage(videoPosterUrl(v.video.file!))),
  ])
  const images = new Map<string, HTMLImageElement | null>()
  photos.forEach((p, i) => images.set(p.photo.id, loaded[i]))
  videos.forEach((v, i) => images.set(`video:${v.video.file}`, loaded[photos.length + i]))

  const { c, ctx } = base(face.side, 'paper')
  for (const it of page.items) drawItem(ctx, it, images)
  const head = face.side === 'front' ? page.chapter.title : book.title
  pageFurniture(ctx, face.side, face.pageNo, page.first && face.side === 'front' ? '' : head)
  return c
}

// ---------------------------------------------------------------------------
// Back matter
// ---------------------------------------------------------------------------

async function renderClosing(face: Face): Promise<HTMLCanvasElement> {
  const portrait = book.authorPhoto ? await loadImage(photoUrl(book.authorPhoto, 640)) : null
  const { c, ctx } = base('front', 'paper')
  const cx = W / 2 + 16
  let y = 260
  centered(ctx, farewell.hindi, cx, y, `500 96px ${TITLE_FONT}`, ACCENT_DEEP)
  y += 60
  centered(ctx, farewell.transliteration, cx, y, `italic 400 30px ${BODY_FONT}`, INK_SOFT)
  y += 90
  if (portrait) {
    const r = 150
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, y + r, r, 0, Math.PI * 2)
    ctx.closePath()
    ctx.shadowColor = 'rgba(40,25,10,0.35)'
    ctx.shadowBlur = 24
    ctx.shadowOffsetY = 8
    ctx.fillStyle = '#fbf7ee'
    ctx.fill()
    ctx.restore()
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, y + r, r - 8, 0, Math.PI * 2)
    ctx.clip()
    const s = Math.max((r * 2) / portrait.naturalWidth, (r * 2) / portrait.naturalHeight)
    const dw = portrait.naturalWidth * s
    const dh = portrait.naturalHeight * s
    ctx.drawImage(portrait, cx - dw / 2, y + r - dh / 2, dw, dh)
    ctx.restore()
    y += r * 2 + 60
  }
  centered(ctx, book.author, cx, y, `500 40px ${TITLE_FONT}`, INK, 2)
  y += 70
  ornament(ctx, cx, y, 220)
  y += 80
  centered(ctx, farewell.closing, cx, y, `italic 500 54px ${TITLE_FONT}`, ACCENT_DEEP)
  y += 90
  const stats = `${chapters.length} capítulos · ${totalPhotos} fotografías · cinco años`
  centered(ctx, stats, cx, y, `400 26px ${TITLE_FONT}`, INK_SOFT, 2)
  y += 40
  centered(ctx, 'agosto de 2012 — diciembre de 2017', cx, y, `italic 400 24px ${BODY_FONT}`, INK_SOFT)
  pageFurniture(ctx, 'front', face.pageNo, book.title)
  return c
}

async function renderColophon(face: Face): Promise<HTMLCanvasElement> {
  const { c, ctx } = base('back', 'paper')
  const cx = W / 2 - 16
  const pages = layout.faces.filter((f) => f.pageNo != null).length
  mandala(ctx, cx, 380, 80, ACCENT, 0.45)
  let y = 560
  centered(ctx, 'COLOFÓN', cx, y, `500 26px ${TITLE_FONT}`, ACCENT, 8)
  y += 70
  y = centeredWrapped(
    ctx,
    `Este libro reúne, palabra por palabra y fotografía por fotografía, las ${chapters.length} crónicas que ${book.author} publicó en indiacol.blogspot.com entre agosto de 2012 y diciembre de 2017: ${totalWords.toLocaleString('es')} palabras y ${totalPhotos} fotografías en ${pages} páginas, junto con las cartas que dejaron sus lectores.`,
    cx,
    y,
    W - 300,
    40,
    `400 26px ${BODY_FONT}`,
    INK,
  )
  y += 30
  ornament(ctx, cx, y, 200)
  y += 70
  y = centeredWrapped(ctx, 'Compuesto en Cormorant Garamond y EB Garamond. Encuadernado con cariño para que la India siga estando tan cerca.', cx, y, W - 340, 36, `italic 400 24px ${BODY_FONT}`, INK_SOFT)
  y += 28
  centeredWrapped(
    ctx,
    'Sonido: alap de «Flute Recital by Pandit Hari Prasad Chaurasia», Sangeet Parishad Kashi (National Cultural Audiovisual Archives of India, CC BY-NC 4.0); pasos de página de grabaciones de dominio público en Wikimedia Commons.',
    cx,
    y,
    W - 300,
    28,
    `400 18px ${BODY_FONT}`,
    INK_SOFT,
  )
  pageFurniture(ctx, 'back', face.pageNo, '')
  return c
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function renderFace(face: Face): Promise<HTMLCanvasElement> {
  await ensureFonts()
  const s = face.spec
  switch (s.type) {
    case 'cover-front':
      return renderCoverFront()
    case 'cover-back':
      return renderCoverBack()
    case 'endpaper':
      return renderEndpaper(face.side)
    case 'blank':
      return renderBlank(face)
    case 'title':
      return renderTitlePage()
    case 'dedication':
      return renderDedication()
    case 'index':
      return renderIndex(face)
    case 'epigraph':
      return renderEpigraph(face)
    case 'closing':
      return renderClosing(face)
    case 'colophon':
      return renderColophon(face)
    case 'chapter':
      return renderChapterPage(face, s.page)
  }
}
