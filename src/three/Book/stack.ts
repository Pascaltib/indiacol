import { sheetCount } from '../../content/book'
import { COVER_DEPTH, PAGE_DEPTH } from './constants'

/**
 * Pure geometry of the two page piles. Both piles have their top surface at
 * z = 0 (the spine is the x = 0 axis); sheets go down into -z.
 */

const COVER_SLOT = COVER_DEPTH * 1.1

export const depthOf = (i: number) => (i === 0 || i === sheetCount() - 1 ? COVER_SLOT : PAGE_DEPTH)

/** total thickness of sheets a … b-1 */
export function thicknessBetween(a: number, b: number) {
  if (b <= a) return 0
  const n = sheetCount()
  let t = (b - a) * PAGE_DEPTH
  if (a === 0) t += COVER_SLOT - PAGE_DEPTH
  if (b === n) t += COVER_SLOT - PAGE_DEPTH
  return t
}

/** z of the centre of sheet i when `page` sheets have been turned */
export function zOf(i: number, page: number) {
  if (i >= page) return -thicknessBetween(page, i) - depthOf(i) / 2 // right pile
  return -thicknessBetween(i + 1, page) - depthOf(i) / 2 // left pile
}
