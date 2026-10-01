import { TEX_H, TEX_W } from './constants'

export const TITLE_FONT = '"Cormorant Garamond", "Times New Roman", serif'
export const BODY_FONT = '"EB Garamond", Georgia, serif'

export const W = TEX_W
export const H = TEX_H
export const MARGIN_OUTER = 86
export const MARGIN_INNER = 118
export const MARGIN_TOP = 104
export const MARGIN_BOTTOM = 120
export const CONTENT_W = W - MARGIN_INNER - MARGIN_OUTER

/** left edge of the text block for a face */
export const contentX = (side: 'front' | 'back') => (side === 'front' ? MARGIN_INNER : MARGIN_OUTER)

export const BODY = { size: 25, leading: 34, gap: 12 }
export const CAPTION = { size: 22, leading: 27 }
export const LETTER = { size: 21, leading: 27 }

export const bodyFont = `400 ${BODY.size}px ${BODY_FONT}`
export const captionFont = `italic 400 ${CAPTION.size}px ${BODY_FONT}`
export const letterFont = `400 ${LETTER.size}px ${BODY_FONT}`

let fontsPromise: Promise<void> | null = null
export function ensureFonts() {
  if (!fontsPromise) {
    const specs = [
      `400 20px ${TITLE_FONT}`,
      `500 20px ${TITLE_FONT}`,
      `600 20px ${TITLE_FONT}`,
      `italic 400 20px ${TITLE_FONT}`,
      `italic 500 20px ${TITLE_FONT}`,
      `400 20px ${BODY_FONT}`,
      `500 20px ${BODY_FONT}`,
      `italic 400 20px ${BODY_FONT}`,
    ]
    fontsPromise = Promise.all(specs.map((s) => document.fonts.load(s).catch(() => undefined)))
      .then(() => document.fonts.ready)
      .then(() => undefined)
  }
  return fontsPromise
}

/** Greedy word wrap using the context's current font. */
export function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}
