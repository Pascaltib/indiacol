import { LinearFilter, LinearMipmapLinearFilter, SRGBColorSpace, Texture } from 'three'
import type { Face } from '../../content/types'
import { renderFace } from './pageRenderer'

/**
 * Page faces are painted on 2D canvases, converted to ImageBitmaps (a plain,
 * immutable pixel buffer that uploads reliably and lets the canvas be garbage
 * collected) and cached as three.js textures. Only the sheets around the
 * current spread stay resident.
 */

interface Entry {
  promise: Promise<Texture>
  texture: Texture | null
  sheet: number
}

const cache = new Map<number, Entry>()
let maxAnisotropy = 4

export function setMaxAnisotropy(n: number) {
  maxAnisotropy = n
}

async function makeTexture(canvas: HTMLCanvasElement) {
  let image: ImageBitmap | HTMLCanvasElement = canvas
  let flipY = true
  if (typeof createImageBitmap === 'function') {
    try {
      image = await createImageBitmap(canvas, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
      flipY = false
    } catch {
      image = canvas
    }
  }
  const tex = new Texture(image)
  tex.flipY = flipY
  tex.colorSpace = SRGBColorSpace
  tex.anisotropy = maxAnisotropy
  tex.minFilter = LinearMipmapLinearFilter
  tex.magFilter = LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

function disposeTexture(tex: Texture) {
  const img = tex.image as { close?: () => void } | undefined
  tex.dispose()
  img?.close?.()
}

export function requestTexture(face: Face): Promise<Texture> {
  const key = face.index
  let entry = cache.get(key)
  if (!entry) {
    const e: Entry = { promise: null as unknown as Promise<Texture>, texture: null, sheet: face.index >> 1 }
    e.promise = renderFace(face)
      .then((canvas) => makeTexture(canvas))
      .then((tex) => {
        // the entry may have been evicted while rendering
        if (cache.get(key) !== e) {
          disposeTexture(tex)
          throw new Error('evicted')
        }
        e.texture = tex
        return tex
      })
    cache.set(key, e)
    entry = e
  }
  return entry.promise
}

export function peekTexture(face: Face) {
  return cache.get(face.index)?.texture ?? null
}

/** Dispose textures for sheets far from `center`. */
export function evictOutside(center: number, window: number, keep: number[] = []) {
  for (const [key, e] of cache) {
    if (Math.abs(e.sheet - center) <= window || keep.includes(e.sheet)) continue
    if (e.texture) disposeTexture(e.texture)
    cache.delete(key)
  }
}
