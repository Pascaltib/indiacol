import { Bone, BoxGeometry, Float32BufferAttribute, Skeleton, Uint16BufferAttribute, Vector3 } from 'three'
import { PAGE_THICKNESS as PAGE_DEPTH, PAGE_HEIGHT, PAGE_SEGMENTS, PAGE_WIDTH, SEGMENT_WIDTH, COVER_DEPTH, COVER_OVERHANG } from './constants'

/**
 * A page is a thin box, subdivided along its width, whose vertices are skinned
 * to a chain of bones running from the spine (x = 0) to the free edge
 * (x = PAGE_WIDTH). Rotating the bones progressively bends the paper.
 */
export function createPageGeometry(cover = false) {
  const depth = cover ? COVER_DEPTH : PAGE_DEPTH
  const w = cover ? PAGE_WIDTH + COVER_OVERHANG : PAGE_WIDTH
  const h = cover ? PAGE_HEIGHT + COVER_OVERHANG * 2 : PAGE_HEIGHT
  const geometry = new BoxGeometry(w, h, depth, PAGE_SEGMENTS, 2)
  geometry.translate(w / 2, 0, 0)

  const position = geometry.attributes.position
  const vertex = new Vector3()
  const skinIndexes: number[] = []
  const skinWeights: number[] = []

  for (let i = 0; i < position.count; i++) {
    vertex.fromBufferAttribute(position, i)
    const x = Math.max(0, vertex.x)
    const idx = Math.min(PAGE_SEGMENTS - 1, Math.floor(x / SEGMENT_WIDTH))
    const t = Math.min(1, Math.max(0, (x - idx * SEGMENT_WIDTH) / SEGMENT_WIDTH))
    skinIndexes.push(idx, idx + 1, 0, 0)
    skinWeights.push(1 - t, t, 0, 0)
  }
  geometry.setAttribute('skinIndex', new Uint16BufferAttribute(skinIndexes, 4))
  geometry.setAttribute('skinWeight', new Float32BufferAttribute(skinWeights, 4))
  return geometry
}

export function createPageSkeleton() {
  const bones: Bone[] = []
  for (let i = 0; i <= PAGE_SEGMENTS; i++) {
    const bone = new Bone()
    bone.position.x = i === 0 ? 0 : SEGMENT_WIDTH
    if (i > 0) bones[i - 1].add(bone)
    bones.push(bone)
  }
  return new Skeleton(bones)
}

export const sharedPageGeometry = createPageGeometry(false)
export const sharedCoverGeometry = createPageGeometry(true)
