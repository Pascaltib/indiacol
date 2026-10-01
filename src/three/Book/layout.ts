import { book, chapters, formatDate, layout, stripHtml } from '../../content/book'
import type { Block, Chapter, ChapterPage, Comment, Face, FaceSpec, Item, Photo, Sheet, VideoBlock } from '../../content/types'
import { ACCENT, ACCENT_DEEP, INK, INK_SOFT } from './constants'
import {
  BODY,
  BODY_FONT,
  CAPTION,
  CONTENT_W,
  H,
  LETTER,
  MARGIN_BOTTOM,
  MARGIN_TOP,
  TITLE_FONT,
  bodyFont,
  captionFont,
  contentX,
  ensureFonts,
  letterFont,
  wrap,
} from './typography'

/**
 * Flows every chapter — all paragraphs, every photo with its caption, videos,
 * headings and the readers' letters — into fixed-size pages, using real text
 * metrics from a 2D canvas. The result is the physical list of sheets.
 */

const MAX_Y = H - MARGIN_BOTTOM
const PHOTO_GAP = 36
const FRAME = 10

type ImageBlock = Extract<Block, { type: 'image' }>
type Placed = { kind: 'photo'; block: ImageBlock } | { kind: 'video'; block: VideoBlock }

const videoRatio = (v: VideoBlock) => (v.poster && v.poster.width && v.poster.height ? v.poster.width / v.poster.height : 16 / 9)
type Group = Placed[] // 1 item, or 2 portraits side by side

const mctx = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 8
  return c.getContext('2d')!
})()

const measure = (text: string, font: string) => {
  mctx.font = font
  return mctx.measureText(text).width
}

const ratio = (p: Photo) => p.width / p.height

class Flow {
  pages: ChapterPage[] = []
  items: Item[] = []
  y = MARGIN_TOP
  deferred: Group[] = []
  private pending: Group[] = []
  private chapter: Chapter
  private faceStart: number

  constructor(chapter: Chapter, faceStart: number) {
    this.chapter = chapter
    this.faceStart = faceStart
  }

  get faceIndex() {
    return this.faceStart + this.pages.length
  }
  get side(): 'front' | 'back' {
    return this.faceIndex % 2 === 0 ? 'front' : 'back'
  }
  get x0() {
    return contentX(this.side)
  }
  get cx() {
    return this.x0 + CONTENT_W / 2
  }
  get room() {
    return MAX_Y - this.y
  }

  flush() {
    this.pages.push({ chapter: this.chapter, n: this.pages.length, items: this.items, first: this.pages.length === 0 })
    this.items = []
    this.y = MARGIN_TOP
    this.placeDeferred()
  }

  /** make sure `h` px fit on the current page */
  ensure(h: number) {
    if (this.y + h > MAX_Y) this.flush()
  }

  // ----- text ---------------------------------------------------------------

  line(text: string, font: string, color: string, opts: { justify?: number; x?: number; align?: 'left' | 'center' | 'right'; spacing?: number } = {}) {
    this.items.push({ type: 'line', x: opts.x ?? this.x0, y: this.y, text, font, color, justify: opts.justify, align: opts.align, spacing: opts.spacing })
  }

  paragraph(text: string, dropCap: boolean) {
    const t = text.trim()
    if (!t) return
    mctx.font = bodyFont
    if (dropCap) {
      const letter = t[0]
      const rest = t.slice(1).trimStart()
      const capSize = BODY.leading * 2.15
      const capW = measure(letter, `500 ${capSize}px ${TITLE_FONT}`)
      const indent = capW + 12
      this.ensure(BODY.leading * 2)
      this.items.push({ type: 'dropcap', x: this.x0, y: this.y + BODY.leading * 1.95 - BODY.size * 0.15, letter, size: capSize })
      // first two lines are narrower
      mctx.font = bodyFont
      const words = rest.split(/\s+/).filter(Boolean)
      let lineIdx = 0
      let cur = ''
      let i = 0
      const lines: { text: string; indented: boolean }[] = []
      while (i < words.length) {
        const avail = lineIdx < 2 ? CONTENT_W - indent : CONTENT_W
        const test = cur ? `${cur} ${words[i]}` : words[i]
        if (mctx.measureText(test).width > avail && cur) {
          lines.push({ text: cur, indented: lineIdx < 2 })
          lineIdx++
          cur = ''
        } else {
          cur = test
          i++
        }
      }
      if (cur) lines.push({ text: cur, indented: lineIdx < 2 })
      lines.forEach((l, li) => {
        if (li >= 2) this.ensure(BODY.leading)
        const last = li === lines.length - 1
        this.y += BODY.leading
        this.line(l.text, bodyFont, INK, { x: this.x0 + (l.indented ? indent : 0), justify: last ? undefined : CONTENT_W - (l.indented ? indent : 0) })
      })
      this.y += BODY.gap
      return
    }
    const lines = wrap(mctx, t, CONTENT_W)
    const firstIndent = BODY.size * 1.4
    lines.forEach((l, li) => {
      this.ensure(BODY.leading)
      const last = li === lines.length - 1
      const indent = li === 0 ? firstIndent : 0
      this.y += BODY.leading
      this.line(l, bodyFont, INK, { x: this.x0 + indent, justify: last ? undefined : CONTENT_W - indent })
    })
    this.y += BODY.gap
  }

  heading(text: string) {
    const font = `500 34px ${TITLE_FONT}`
    mctx.font = font
    const lines = wrap(mctx, text, CONTENT_W)
    this.ensure(lines.length * 42 + 30 + BODY.leading * 2)
    this.y += 22
    for (const l of lines) {
      this.y += 42
      this.line(l, font, ACCENT_DEEP)
    }
    this.y += 14
  }

  list(items: string[]) {
    mctx.font = bodyFont
    for (const it of items) {
      const lines = wrap(mctx, stripHtml(it), CONTENT_W - 34)
      lines.forEach((l, li) => {
        this.ensure(BODY.leading)
        this.y += BODY.leading
        if (li === 0) this.line('•', bodyFont, ACCENT, { x: this.x0 + 8 })
        this.line(l, bodyFont, INK, { x: this.x0 + 34 })
      })
      this.y += 6
    }
    this.y += BODY.gap
  }

  // ----- photos ---------------------------------------------------------------

  /** Image/video blocks arrive one by one; consecutive ones are grouped. */
  media(p: Placed) {
    const last = this.pending[this.pending.length - 1]
    if (last && last.length === 1 && last[0].kind === 'photo' && p.kind === 'photo' && ratio(last[0].block.photo) < 0.9 && ratio(p.block.photo) < 0.9) {
      last.push(p)
    } else {
      this.pending.push([p])
    }
  }

  /** called when a non-media block arrives, or at the end */
  flushMedia() {
    for (const g of this.pending) this.placeGroup(g)
    this.pending = []
  }

  private captionLines(text: string, width: number) {
    if (!text) return [] as string[]
    mctx.font = captionFont
    return wrap(mctx, text, width + 40).slice(0, 3)
  }

  /** compute geometry of a group for a given max height; returns total block height */
  private sizeGroup(g: Group, maxH: number) {
    if (g.length === 2) {
      const colW = (CONTENT_W - PHOTO_GAP) / 2
      const a = g[0] as Extract<Placed, { kind: 'photo' }>
      const b = g[1] as Extract<Placed, { kind: 'photo' }>
      const h = Math.min(maxH, colW / ratio(a.block.photo), colW / ratio(b.block.photo))
      const wa = h * ratio(a.block.photo)
      const wb = h * ratio(b.block.photo)
      const ca = this.captionLines(a.block.caption, wa)
      const cb = this.captionLines(b.block.caption, wb)
      const capH = Math.max(ca.length, cb.length) * CAPTION.leading
      return { h, widths: [wa, wb], caps: [ca, cb], total: FRAME + h + FRAME + (capH ? capH + 18 : 0) + 30 }
    }
    const p = g[0]
    if (p.kind === 'video') {
      const r = videoRatio(p.block)
      const w = r >= 1 ? Math.min(CONTENT_W, maxH * r) : Math.min(CONTENT_W * 0.6, maxH * r)
      const h = w / r
      return { h, widths: [w], caps: [[]], total: FRAME + h + FRAME + 30 }
    }
    const r = ratio(p.block.photo)
    let w: number
    if (r >= 1) w = Math.min(CONTENT_W, maxH * r)
    else w = Math.min(CONTENT_W * 0.64, maxH * r)
    const h = w / r
    const caps = this.captionLines(p.block.caption, w)
    const capH = caps.length * CAPTION.leading
    return { h, widths: [w], caps: [caps], total: FRAME + h + FRAME + (capH ? capH + 18 : 0) + 30 }
  }

  /** natural (maximum) image height for a group */
  private maxHeight(g: Group) {
    if (g.length === 2) return 500
    const p = g[0]
    if (p.kind === 'video') return videoRatio(p.block) >= 1 ? 400 : 560
    return ratio(p.block.photo) >= 1 ? 440 : 560
  }

  private placeGroup(g: Group) {
    const natural = this.sizeGroup(g, this.maxHeight(g))
    if (this.deferred.length === 0 && natural.total <= this.room) {
      this.draw(g, natural)
    } else {
      this.deferred.push(g)
    }
  }

  private placeDeferred() {
    let guard = 0
    while (this.deferred.length && guard++ < 50) {
      const g = this.deferred[0]
      let s = this.sizeGroup(g, this.maxHeight(g))
      if (s.total > this.room) {
        if (this.items.length > 0) break // leave it for the next page
        // empty page and still too tall: shrink to fit
        s = this.sizeGroup(g, Math.max(200, s.h - (s.total - this.room)))
      }
      this.deferred.shift()
      this.draw(g, s)
    }
  }

  private draw(g: Group, s: ReturnType<Flow['sizeGroup']>) {
    const top = this.y + FRAME
    if (g.length === 2) {
      const colW = (CONTENT_W - PHOTO_GAP) / 2
      g.forEach((p, i) => {
        if (p.kind !== 'photo') return
        const cxCol = this.x0 + colW / 2 + i * (colW + PHOTO_GAP)
        const w = s.widths[i]
        this.items.push({ type: 'photo', x: cxCol - w / 2, y: top, w, h: s.h, photo: p.block.photo })
        let cy = top + s.h + FRAME + 18 + CAPTION.size
        for (const l of s.caps[i]) {
          this.items.push({ type: 'line', x: cxCol, y: cy, text: l, font: captionFont, color: INK_SOFT, align: 'center' })
          cy += CAPTION.leading
        }
      })
    } else {
      const p = g[0]
      const w = s.widths[0]
      const x = this.cx - w / 2
      if (p.kind === 'video') this.items.push({ type: 'video', x, y: top, w, h: s.h, video: p.block })
      else this.items.push({ type: 'photo', x, y: top, w, h: s.h, photo: p.block.photo })
      let cy = top + s.h + FRAME + 18 + CAPTION.size
      for (const l of s.caps[0]) {
        this.items.push({ type: 'line', x: this.cx, y: cy, text: l, font: captionFont, color: INK_SOFT, align: 'center' })
        cy += CAPTION.leading
      }
    }
    this.y += s.total
  }

  // ----- chapter furniture -----------------------------------------------------

  opener() {
    const ch = this.chapter
    this.y = MARGIN_TOP + 24
    this.line(`CAPÍTULO ${ch.number}`, `500 26px ${TITLE_FONT}`, ACCENT, { x: this.cx, align: 'center', spacing: 7 })
    this.y += 30
    let size = 62
    mctx.font = `500 ${size}px ${TITLE_FONT}`
    let lines = wrap(mctx, ch.title, CONTENT_W - 20)
    if (lines.length > 2) {
      size = 50
      mctx.font = `500 ${size}px ${TITLE_FONT}`
      lines = wrap(mctx, ch.title, CONTENT_W - 20)
    }
    for (const l of lines) {
      this.y += size * 1.05
      this.line(l, `500 ${size}px ${TITLE_FONT}`, INK, { x: this.cx, align: 'center' })
    }
    this.y += 44
    this.line(formatDate(ch.date), `italic 400 26px ${BODY_FONT}`, INK_SOFT, { x: this.cx, align: 'center' })
    this.y += 26
    this.items.push({ type: 'ornament', cx: this.cx, y: this.y, width: 180 })
    this.y += 56
  }

  letters(comments: Comment[]) {
    if (!comments.length) return
    this.ensure(200)
    this.y += 30
    this.line('CARTAS DE LOS LECTORES', `500 24px ${TITLE_FONT}`, ACCENT, { x: this.cx, align: 'center', spacing: 6 })
    this.y += 18
    this.items.push({ type: 'ornament', cx: this.cx, y: this.y + 10, width: 140 })
    this.y += 64
    for (const cm of comments) {
      const text = stripHtml(cm.html)
      mctx.font = letterFont
      const lines = wrap(mctx, text, CONTENT_W)
      this.ensure(30 + Math.min(lines.length, 2) * LETTER.leading)
      const author = cm.author === book.author ? `${cm.author} responde` : cm.author
      const authorFont = `500 23px ${TITLE_FONT}`
      this.line(author, authorFont, ACCENT_DEEP)
      this.line(`— ${formatDate(cm.date, 'short')}`, `italic 400 19px ${BODY_FONT}`, INK_SOFT, { x: this.x0 + measure(author, authorFont) + 14 })
      this.y += 30
      for (const l of lines) {
        this.ensure(LETTER.leading)
        this.line(l, letterFont, INK)
        this.y += LETTER.leading
      }
      this.y += 22
    }
  }

  end() {
    if (this.room > 110) this.items.push({ type: 'mandala', cx: this.cx, cy: this.y + 56, r: 34, alpha: 0.45 })
  }
}

function layoutChapter(ch: Chapter, faceStart: number): ChapterPage[] {
  const f = new Flow(ch, faceStart)
  f.opener()
  let first = true
  for (const b of ch.blocks) {
    if (b.type === 'image') {
      f.media({ kind: 'photo', block: b })
      continue
    }
    if (b.type === 'video') {
      f.media({ kind: 'video', block: b })
      continue
    }
    f.flushMedia()
    if (b.type === 'paragraph') {
      const text = stripHtml(b.html)
      if (!text) continue
      f.paragraph(text, first)
      first = false
    } else if (b.type === 'heading') f.heading(b.text)
    else if (b.type === 'list') f.list(b.items)
  }
  f.flushMedia()
  while (f.deferred.length) f.flush()
  f.letters(ch.comments)
  f.end()
  f.flush()
  return f.pages
}

export async function buildLayout() {
  if (layout.ready) return
  await ensureFonts()

  const specs: FaceSpec[] = [
    { type: 'cover-front' },
    { type: 'endpaper' },
    { type: 'title' },
    { type: 'dedication' },
    { type: 'index' },
    { type: 'epigraph' },
  ]
  const chapterStart = new Map<number, number>()
  const chapterPageNo = new Map<number, number>()
  for (const ch of chapters) {
    const pages = layoutChapter(ch, specs.length)
    const openerFace = specs.length
    // opener on a front face → page = sheet index; on a back face → the next spread
    chapterStart.set(ch.number, openerFace % 2 === 0 ? openerFace / 2 : (openerFace + 1) / 2)
    chapterPageNo.set(ch.number, openerFace - 3)
    for (const p of pages) specs.push({ type: 'chapter', page: p })
  }
  if (specs.length % 2 === 1) specs.push({ type: 'blank' })
  specs.push({ type: 'closing' }, { type: 'colophon' }, { type: 'endpaper' }, { type: 'cover-back' })

  const faces: Face[] = specs.map((spec, index) => {
    const numbered = index >= 4 && index < specs.length - 2 && spec.type !== 'blank'
    return { index, side: index % 2 === 0 ? 'front' : 'back', pageNo: numbered ? index - 3 : null, spec }
  })
  const sheets: Sheet[] = []
  for (let i = 0; i < faces.length; i += 2) {
    const idx = i / 2
    sheets.push({ index: idx, kind: idx === 0 ? 'cover' : i === faces.length - 2 ? 'backcover' : 'page', front: faces[i], back: faces[i + 1] })
  }
  layout.sheets = sheets
  layout.faces = faces
  layout.chapterStart = chapterStart
  layout.chapterPageNo = chapterPageNo
  layout.ready = true
}
