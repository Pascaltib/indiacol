import {
  BufferGeometry,
  CanvasTexture,
  LinearFilter,
  Material,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  Skeleton,
  SkinnedMesh,
  VideoTexture,
} from 'three'
import { videoUrl } from '../../content/book'
import type { Face, Item } from '../../content/types'
import { TEX_H, TEX_W } from './constants'

type VideoItem = Extract<Item, { type: 'video' }>
type Side = 'front' | 'back'

/**
 * Videos play *on the paper*: a second SkinnedMesh shares the page's skeleton
 * and geometry, so it bends and turns with the sheet, and its material shows
 * the VideoTexture only inside the video's rectangle (alpha mask), pulled a
 * hair forward with polygonOffset so it wins over the page face beneath.
 */

interface Overlay {
  video: HTMLVideoElement
  mesh: SkinnedMesh
  tex: VideoTexture
  mask: CanvasTexture
  mat: MeshStandardMaterial
  item: VideoItem
}

const hidden = new MeshBasicMaterial({ visible: false })

/** video items (with a local file) on a face */
export function videoItems(face: Face): VideoItem[] {
  if (face.spec.type !== 'chapter') return []
  return face.spec.page.items.filter((it): it is VideoItem => it.type === 'video' && !!it.video.file)
}

/** which video rectangle (if any) a face-space uv falls in */
export function hitVideo(face: Face, u: number, v: number): VideoItem | null {
  for (const it of videoItems(face)) {
    const u0 = it.x / TEX_W
    const u1 = (it.x + it.w) / TEX_W
    const v1 = 1 - it.y / TEX_H
    const v0 = 1 - (it.y + it.h) / TEX_H
    if (u >= u0 && u <= u1 && v >= v0 && v <= v1) return it
  }
  return null
}

export class PageVideos {
  private overlays = new Map<string, Overlay>()
  private host: SkinnedMesh
  private skeleton: Skeleton
  private geometry: BufferGeometry

  constructor(host: SkinnedMesh, skeleton: Skeleton, geometry: BufferGeometry) {
    this.host = host
    this.skeleton = skeleton
    this.geometry = geometry
  }

  get playing() {
    for (const o of this.overlays.values()) if (!o.video.paused) return true
    return false
  }

  private create(side: Side, item: VideoItem): Overlay {
    const video = document.createElement('video')
    video.src = videoUrl(item.video.file!)
    video.playsInline = true
    video.preload = 'auto'
    video.crossOrigin = 'anonymous'
    video.setAttribute('playsinline', '')

    const tex = new VideoTexture(video)
    tex.colorSpace = SRGBColorSpace
    tex.minFilter = LinearFilter
    tex.magFilter = LinearFilter
    tex.generateMipmaps = false
    // map the whole video into the item's rectangle of the face
    const u0 = item.x / TEX_W
    const u1 = (item.x + item.w) / TEX_W
    const v1 = 1 - item.y / TEX_H
    const v0 = 1 - (item.y + item.h) / TEX_H
    tex.repeat.set(1 / (u1 - u0), 1 / (v1 - v0))
    tex.offset.set(-u0 / (u1 - u0), -v0 / (v1 - v0))

    // alpha mask: white inside the rectangle, black elsewhere (page-texture space)
    const c = document.createElement('canvas')
    c.width = TEX_W / 8
    c.height = TEX_H / 8
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#fff'
    ctx.fillRect(item.x / 8, item.y / 8, item.w / 8, item.h / 8)
    const mask = new CanvasTexture(c)
    mask.minFilter = LinearFilter
    mask.magFilter = LinearFilter
    mask.generateMipmaps = false

    const mat = new MeshStandardMaterial({
      map: tex,
      alphaMap: mask,
      transparent: true,
      depthWrite: false,
      roughness: 0.75,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    })
    const materials: Material[] = [hidden, hidden, hidden, hidden, side === 'front' ? mat : hidden, side === 'back' ? mat : hidden]
    const mesh = new SkinnedMesh(this.geometry, materials)
    mesh.frustumCulled = false
    mesh.receiveShadow = true
    mesh.visible = false
    // same both-sides bounding sphere as the host page (see Page.tsx)
    mesh.boundingSphere = this.host.boundingSphere?.clone() ?? null
    this.host.add(mesh)
    // reuse the host's bind matrix: binding without one would recompute the
    // skeleton's inverses from the current (bent) pose and warp the page itself
    mesh.bind(this.skeleton, this.host.bindMatrix)

    const o: Overlay = { video, mesh, tex, mask, mat, item }
    // a paused frame dims a little so it reads as "stopped, tap to resume"
    video.addEventListener('pause', () => mat.color.setScalar(0.55))
    video.addEventListener('play', () => mat.color.setScalar(1))
    video.addEventListener('ended', () => {
      // back to the printed poster with its play badge
      mesh.visible = false
      video.currentTime = 0
    })
    return o
  }

  /** play / pause the video under this item; returns true when now playing */
  toggle(side: Side, item: VideoItem, muted = false) {
    const key = `${side}:${item.x}:${item.y}`
    let o = this.overlays.get(key)
    if (!o) {
      o = this.create(side, item)
      this.overlays.set(key, o)
    }
    if (o.video.paused) {
      // one voice at a time on a page
      for (const other of this.overlays.values()) if (other !== o) other.video.pause()
      o.video.muted = muted
      o.mesh.visible = true
      o.video.play().catch(() => undefined)
      return true
    }
    o.video.pause()
    return false
  }

  setMuted(muted: boolean) {
    for (const o of this.overlays.values()) o.video.muted = muted
  }

  pauseAll() {
    for (const o of this.overlays.values()) o.video.pause()
  }

  /** stop and hide everything (sheet left the spread) */
  reset() {
    for (const o of this.overlays.values()) {
      o.video.pause()
      o.video.currentTime = 0
      o.mesh.visible = false
    }
  }

  dispose() {
    for (const o of this.overlays.values()) {
      o.video.pause()
      o.video.removeAttribute('src')
      o.video.load()
      this.host.remove(o.mesh)
      o.tex.dispose()
      o.mask.dispose()
      o.mat.dispose()
    }
    this.overlays.clear()
  }
}
