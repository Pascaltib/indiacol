export const PAGE_WIDTH = 1.28
export const PAGE_HEIGHT = 1.72
/** vertical slot one sheet occupies in the stack */
export const PAGE_DEPTH = 0.0017
/** actual thickness of the page mesh (thinner than its slot so neighbours never touch) */
export const PAGE_THICKNESS = PAGE_DEPTH * 0.65
export const COVER_DEPTH = 0.03
export const COVER_OVERHANG = 0.03
export const PAGE_SEGMENTS = 24
export const SEGMENT_WIDTH = PAGE_WIDTH / PAGE_SEGMENTS

/** Texture resolution for a page face */
export const TEX_W = 1024
export const TEX_H = Math.round((TEX_W * PAGE_HEIGHT) / PAGE_WIDTH) // 1376

/** sheets around the current page whose textures we keep resident */
export const TEXTURE_WINDOW = 3
/** sheets around the current page that exist as individual, bendable meshes */
export const LIVE_WINDOW = 5

export const PAPER = '#f3ebdb'
export const PAPER_DARK = '#e6dac2'
export const INK = '#2b2520'
export const INK_SOFT = '#6a5d50'
export const ACCENT = '#b5541c' // saffron / terracotta
export const ACCENT_DEEP = '#7a2e12'
export const GOLD = '#c9a24a'
export const COVER_COLOR = '#2a1f3d' // deep indigo leather
export const COVER_COLOR_LIGHT = '#3d2d57'
