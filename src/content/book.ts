import raw from './book.json'
import type { BookData, Chapter, Face, Sheet } from './types'

export const book = raw as unknown as BookData
export const chapters: Chapter[] = book.chapters

export const photoUrl = (id: string, size: 640 | 1600 = 640) => `${import.meta.env.BASE_URL}photos/${id}-${size}.webp`
export const videoUrl = (file: string) => `${import.meta.env.BASE_URL}videos/${file}.mp4`
export const videoPosterUrl = (file: string) => `${import.meta.env.BASE_URL}videos/${file}.webp`

export const formatDuration = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function formatDate(iso: string, style: 'long' | 'short' | 'month' = 'long') {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10))
  if (style === 'month') return MONTHS[m - 1]
  if (style === 'short') return `${MONTHS[m - 1]} de ${y}`
  return `${d} de ${MONTHS[m - 1]} de ${y}`
}

export const yearOf = (iso: string) => iso.slice(0, 4)

export const stripHtml = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Physical layout of the book. Filled once by `buildLayout()` (three/Book/layout.ts)
 * after fonts are available, because pagination needs real text metrics.
 *
 *  sheet 0        front: leather cover      back: endpaper
 *  sheet 1        front: title page         back: dedication
 *  sheet 2        front: índice             back: epigraph
 *  sheets 3…      every chapter flowed over as many pages as it needs
 *  …              front: farewell           back: colophon
 *  last sheet     front: endpaper           back: leather back
 */
export const layout: {
  sheets: Sheet[]
  faces: Face[]
  /** chapter number → `page` value (sheets turned) that shows the opener */
  chapterStart: Map<number, number>
  /** chapter number → printed page number of the opener */
  chapterPageNo: Map<number, number>
  ready: boolean
} = { sheets: [], faces: [], chapterStart: new Map(), chapterPageNo: new Map(), ready: false }

export const sheetCount = () => layout.sheets.length
export const sheetAt = (i: number): Sheet | undefined => layout.sheets[i]

/** `page` value (number of turned sheets) that shows the chapter opener. */
export const sheetForChapter = (chapterNumber: number) => layout.chapterStart.get(chapterNumber) ?? 0

export function chapterOfFace(face: Face | undefined): Chapter | null {
  return face && face.spec.type === 'chapter' ? face.spec.page.chapter : null
}

/** Faces visible on the spread for a given number of turned sheets: [left, right]. */
export function spreadAt(turned: number): [Face | undefined, Face | undefined] {
  return [layout.sheets[turned - 1]?.back, layout.sheets[turned]?.front]
}

/** Which chapter is "in view" given how many sheets have been turned (right page wins). */
export function chapterAtPage(turned: number): Chapter | null {
  const [left, right] = spreadAt(turned)
  return chapterOfFace(right) ?? chapterOfFace(left)
}

export const totalPhotos = chapters.reduce((n, c) => n + c.imageCount, 0)
export const totalWords = chapters.reduce((n, c) => n + c.wordCount, 0)
