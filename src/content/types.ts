export interface Photo {
  id: string
  width: number
  height: number
  lqip: string
}

export type Block =
  | { type: 'paragraph'; html: string }
  | { type: 'heading'; text: string }
  | { type: 'image'; src: string; caption: string; photo: Photo }
  | VideoBlock
  | { type: 'list'; items: string[] }

export interface VideoBlock {
  type: 'video'
  /** original Blogger embed URL */
  src: string
  /** local file id (public/videos/<file>.mp4 + .webp poster), set by scripts/videos.mjs */
  file?: string
  poster?: { width: number; height: number; lqip: string }
  /** seconds */
  duration?: number
}

export interface Comment {
  author: string
  date: string
  html: string
}

export interface Chapter {
  id: string
  number: number
  title: string
  slug: string
  date: string
  url: string
  blocks: Block[]
  comments: Comment[]
  hero: string | null
  heroCaption: string
  imageCount: number
  excerpt: string
  wordCount: number
}

export interface BookData {
  title: string
  subtitle: string
  author: string
  authorBio: string
  authorPhoto: string | null
  sourceUrl: string
  generatedAt: string
  chapters: Chapter[]
}

// ---------------------------------------------------------------------------
// Laid-out pages
// ---------------------------------------------------------------------------

/** A positioned drawing primitive on a page texture (texture pixel units). */
export type Item =
  | {
      type: 'line'
      x: number
      y: number
      text: string
      font: string
      color: string
      /** when set, the line is justified to this width */
      justify?: number
      align?: 'left' | 'center' | 'right'
      spacing?: number
    }
  | { type: 'dropcap'; x: number; y: number; letter: string; size: number }
  | { type: 'photo'; x: number; y: number; w: number; h: number; photo: Photo }
  | { type: 'video'; x: number; y: number; w: number; h: number; video: VideoBlock }
  | { type: 'ornament'; cx: number; y: number; width: number }
  | { type: 'mandala'; cx: number; cy: number; r: number; alpha: number }

export interface ChapterPage {
  chapter: Chapter
  /** 0-based page within the chapter */
  n: number
  items: Item[]
  /** chapter opener */
  first: boolean
}

/** What is printed on one face of a sheet. */
export type FaceSpec =
  | { type: 'cover-front' }
  | { type: 'cover-back' }
  | { type: 'endpaper' }
  | { type: 'blank' }
  | { type: 'title' }
  | { type: 'dedication' }
  | { type: 'index' }
  | { type: 'epigraph' }
  | { type: 'closing' }
  | { type: 'colophon' }
  | { type: 'chapter'; page: ChapterPage }

export interface Face {
  /** global face index: 2 * sheet + (0 front | 1 back) */
  index: number
  side: 'front' | 'back'
  /** printed page number (null = none) */
  pageNo: number | null
  spec: FaceSpec
}

/** A physical sheet of the book: has a front face and a back face. */
export interface Sheet {
  index: number
  kind: 'cover' | 'page' | 'backcover'
  front: Face
  back: Face
}
