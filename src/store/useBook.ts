import { create } from 'zustand'
import { chapterAtPage, chapterOfFace, chapters, sheetCount, sheetForChapter, spreadAt } from '../content/book'

/**
 *  loading → intro → book (open spread, floating)
 *                      ↕ focus   (desktop: camera leans in on one page to read it)
 *                      ↕ reading (phones: the chapter as a crisp DOM sheet)
 */
export type Mode = 'loading' | 'intro' | 'book' | 'focus' | 'reading'
export type Side = 'left' | 'right'

export interface ReaderOrigin {
  x: number
  y: number
  w: number
  h: number
}

/** Phones get the DOM reader; everything else reads in 3D. */
export const isPhone = () => typeof window !== 'undefined' && (window.innerWidth < 720 || (window.innerWidth < 1024 && window.matchMedia('(pointer: coarse)').matches && window.innerHeight > window.innerWidth))

interface BookState {
  mode: Mode
  /** number of sheets turned, 0 = closed on the front cover */
  page: number
  /** which page of the spread the camera is focused on */
  focusSide: Side
  /** sheet index under the pointer, for hover affordances */
  hovered: number | null
  readingChapter: number | null
  readerOrigin: ReaderOrigin | null
  indexOpen: boolean
  soundOn: boolean
  reducedEffects: boolean
  lastTurnAt: number
  turnDirection: 1 | -1
  /** the book has been paginated and the sheet list exists */
  layoutReady: boolean

  setLayoutReady: (v: boolean) => void
  setMode: (mode: Mode) => void
  setPage: (page: number) => void
  next: () => void
  prev: () => void
  /** next/prev that is aware of focus mode (moves page by page, not spread by spread) */
  advance: () => void
  retreat: () => void
  focus: (side: Side) => void
  unfocus: () => void
  openBook: () => void
  goToChapter: (chapterNumber: number) => void
  /** read a page: focus on desktop, DOM reader on phones */
  read: (side: Side, origin?: ReaderOrigin) => void
  openReader: (chapterNumber: number, origin?: ReaderOrigin) => void
  closeReader: () => void
  readerNext: () => void
  readerPrev: () => void
  setHovered: (sheet: number | null) => void
  toggleIndex: (open?: boolean) => void
  toggleSound: () => void
  setReducedEffects: (v: boolean) => void
}

const clamp = (n: number) => Math.max(0, Math.min(sheetCount(), n))

/** side of the spread that shows the opener of chapter n once `page` is set */
function openerSide(n: number): Side {
  const [, right] = spreadAt(sheetForChapter(n))
  return chapterOfFace(right)?.number === n && right?.spec.type === 'chapter' && right.spec.page.first ? 'right' : 'left'
}

export const useBook = create<BookState>((set, get) => ({
  mode: 'loading',
  page: 0,
  focusSide: 'right',
  hovered: null,
  readingChapter: null,
  readerOrigin: null,
  indexOpen: false,
  soundOn: true,
  reducedEffects: false,
  lastTurnAt: 0,
  turnDirection: 1,
  layoutReady: false,

  setLayoutReady: (layoutReady) => set({ layoutReady }),
  setMode: (mode) => set({ mode }),
  setPage: (page) => {
    const p = clamp(page)
    const cur = get().page
    if (p === cur) return
    set({ page: p, lastTurnAt: performance.now(), turnDirection: p > cur ? 1 : -1 })
  },
  next: () => get().setPage(get().page + 1),
  prev: () => get().setPage(get().page - 1),

  advance: () => {
    const s = get()
    if (s.mode !== 'focus') return s.next()
    if (s.focusSide === 'left') return set({ focusSide: 'right' })
    if (s.page >= sheetCount() - 1) return
    s.next()
    set({ focusSide: 'left' })
  },
  retreat: () => {
    const s = get()
    if (s.mode !== 'focus') return s.prev()
    if (s.focusSide === 'right') return set({ focusSide: 'left' })
    if (s.page <= 1) return
    s.prev()
    set({ focusSide: 'right' })
  },
  focus: (side) => set({ mode: 'focus', focusSide: side, indexOpen: false }),
  unfocus: () => set((s) => (s.mode === 'focus' ? { mode: 'book' } : {})),

  openBook: () => {
    set({ mode: 'book' })
    // Open to the title page after a beat
    if (get().page === 0) setTimeout(() => get().setPage(1), 650)
  },
  goToChapter: (n) => {
    get().setPage(sheetForChapter(n))
    set({ indexOpen: false, focusSide: openerSide(n) })
  },
  read: (side, origin) => {
    const s = get()
    if (isPhone()) {
      const [left, right] = spreadAt(s.page)
      const ch = chapterOfFace(side === 'left' ? left : right) ?? chapterAtPage(s.page)
      if (ch) s.openReader(ch.number, origin)
      return
    }
    s.focus(side)
  },
  openReader: (n, origin) => {
    const target = sheetForChapter(n)
    const current = get().page
    // make sure the chapter is visible on the spread
    if (chapterAtPage(current)?.number !== n) get().setPage(target)
    set({ mode: 'reading', readingChapter: n, readerOrigin: origin ?? null, indexOpen: false })
  },
  closeReader: () => set({ mode: 'book', readingChapter: null }),
  readerNext: () => {
    const n = get().readingChapter
    if (n && n < chapters.length) {
      get().setPage(sheetForChapter(n + 1))
      set({ readingChapter: n + 1 })
    }
  },
  readerPrev: () => {
    const n = get().readingChapter
    if (n && n > 1) {
      get().setPage(sheetForChapter(n - 1))
      set({ readingChapter: n - 1 })
    }
  },
  setHovered: (hovered) => set({ hovered }),
  toggleIndex: (open) => set((s) => ({ indexOpen: open ?? !s.indexOpen })),
  toggleSound: () => set((s) => ({ soundOn: !s.soundOn })),
  setReducedEffects: (reducedEffects) => set({ reducedEffects }),
}))
