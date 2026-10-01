import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { easing } from 'maath'
import { Color, MeshStandardMaterial, SkinnedMesh, Sphere, Vector3, type Bone, type Camera, type Texture } from 'three'
import type { Sheet } from '../../content/types'
import { useBook, type ReaderOrigin, type Side } from '../../store/useBook'
import { COVER_COLOR, PAGE_HEIGHT, PAGE_SEGMENTS, PAGE_WIDTH, PAPER, PAPER_DARK, TEXTURE_WINDOW } from './constants'
import { createPageSkeleton, sharedCoverGeometry, sharedPageGeometry } from './pageGeometry'
import { PageVideos, hitVideo } from './pageVideo'
import { zOf } from './stack'
import { requestTexture } from './textureCache'

interface PageProps {
  sheet: Sheet
  /** 0 when the book is closed, 1 when open (damped by the parent) */
  openness: RefObject<number>
}

const TURN_SMOOTH = 0.34
const CURL_STRENGTH = 1.05
const REST_STRENGTH = 0.07

const restProfile = (k: number) => (k <= 5 ? 1 - k / 6 : -0.13)

const corner = new Vector3()

export function Page({ sheet, openness }: PageProps) {
  const isCover = sheet.kind !== 'page'
  const page = useBook((s) => s.page)
  const mode = useBook((s) => s.mode)
  const hoveredRef = useRef(false)
  const size = useThree((s) => s.size)

  const { mesh, bones, frontMat, backMat, videos } = useMemo(() => {
    const skeleton = createPageSkeleton()
    const edgeColor = isCover ? COVER_COLOR : PAPER_DARK
    const edge = new MeshStandardMaterial({ color: edgeColor, roughness: 0.9 })
    const blankColor = isCover ? COVER_COLOR : PAPER
    const frontMat = new MeshStandardMaterial({ color: new Color(blankColor), roughness: isCover ? 0.55 : 0.88, metalness: 0 })
    const backMat = new MeshStandardMaterial({ color: new Color(blankColor), roughness: isCover ? 0.55 : 0.88, metalness: 0 })
    const materials = [edge, edge, edge, edge, frontMat, backMat]
    const mesh = new SkinnedMesh(isCover ? sharedCoverGeometry : sharedPageGeometry, materials)
    mesh.add(skeleton.bones[0])
    mesh.bind(skeleton)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    // SkinnedMesh.raycast culls against a bounding sphere computed once in the
    // rest pose (page lying to the right). A turned page sits at x < 0, where
    // that sphere no longer reaches, so clicks on most of a left page would be
    // rejected before any triangle is tested. Use one that covers both sides.
    mesh.boundingSphere = new Sphere(new Vector3(0, 0, 0), Math.hypot(PAGE_WIDTH + 0.1, PAGE_HEIGHT / 2 + 0.1))
    // mount in the resting state for the current spread (no stray animation when
    // sheets enter the live window after a jump)
    const p0 = useBook.getState().page
    skeleton.bones[0].rotation.y = sheet.index < p0 ? -Math.PI : 0
    mesh.position.z = zOf(sheet.index, p0)
    const videos = new PageVideos(mesh, skeleton, mesh.geometry)
    return { mesh, bones: skeleton.bones as Bone[], frontMat, backMat, videos }
  }, [isCover, sheet.index])

  useEffect(() => () => {
    frontMat.dispose()
    backMat.dispose()
    videos.dispose()
  }, [frontMat, backMat, videos])

  // --- textures: keep only the neighbourhood of the current spread resident
  const inWindow = Math.abs(sheet.index - page) <= TEXTURE_WINDOW || isCover
  useEffect(() => {
    const blank = (m: MeshStandardMaterial) => {
      m.map = null
      m.color.set(isCover ? COVER_COLOR : PAPER)
      m.needsUpdate = true
    }
    if (!inWindow) {
      blank(frontMat)
      blank(backMat)
      return
    }
    let alive = true
    const apply = (m: MeshStandardMaterial) => (t: Texture) => {
      if (!alive) return
      m.map = t
      m.color.set('#ffffff')
      m.needsUpdate = true
    }
    requestTexture(sheet.front).then(apply(frontMat), () => undefined)
    requestTexture(sheet.back).then(apply(backMat), () => undefined)
    return () => {
      alive = false
    }
  }, [inWindow, sheet, frontMat, backMat, isCover])

  // --- animation
  const turned = sheet.index < page
  const targetAngle = turned ? -Math.PI : 0
  const zTarget = zOf(sheet.index, page)

  useFrame((_, dt) => {
    const delta = Math.min(dt, 1 / 30)
    const root = bones[0]
    // NB: a plain damp, not dampAngle — a 180° turn is exactly ambiguous for
    // shortest-path interpolation and would sometimes swing through the book.
    easing.damp(root.rotation, 'y', targetAngle, TURN_SMOOTH, delta)

    const progress = Math.min(1, Math.max(0, root.rotation.y / -Math.PI))
    const turning = Math.sin(progress * Math.PI) // 0 at rest, 1 mid-flip
    const dir = targetAngle < root.rotation.y ? 1 : -1
    const open = openness.current ?? 1
    const restSign = turned ? 1 : -1
    const n = PAGE_SEGMENTS
    const still = mode === 'focus' || mode === 'reading'

    for (let k = 1; k <= n; k++) {
      const w = Math.sin((k / n) * Math.PI) / (n * 0.63)
      const curl = dir * turning * CURL_STRENGTH * w
      const rest = restSign * REST_STRENGTH * restProfile(k) * open * (1 - turning) * (isCover ? 0.15 : still ? 0.35 : 1)
      const hoverLift = hoveredRef.current && !turned && mode === 'book' && k < 4 ? -0.01 : 0
      easing.damp(bones[k].rotation, 'y', curl + rest + hoverLift, 0.12, delta)
    }

    easing.damp(mesh.position, 'z', zTarget, 0.25, delta)
  })

  // --- interaction
  const isRight = sheet.index === page
  const isLeft = sheet.index === page - 1

  // videos stop when their page leaves the spread or the DOM reader covers the book,
  // and follow the HUD's sound toggle
  const soundOn = useBook((s) => s.soundOn)
  useEffect(() => {
    if (!isRight && !isLeft) videos.reset()
    else if (mode === 'reading') videos.pauseAll()
  }, [isRight, isLeft, mode, videos])
  useEffect(() => videos.setMuted(!soundOn), [soundOn, videos])

  const projectOrigin = (camera: Camera, size: { width: number; height: number }): ReaderOrigin => {
    const root = bones[0]
    root.updateWorldMatrix(true, false)
    const pts = [
      [0, PAGE_HEIGHT / 2],
      [PAGE_WIDTH, PAGE_HEIGHT / 2],
      [0, -PAGE_HEIGHT / 2],
      [PAGE_WIDTH, -PAGE_HEIGHT / 2],
    ]
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const [x, y] of pts) {
      corner.set(x, y, 0)
      root.localToWorld(corner)
      corner.project(camera)
      const sx = ((corner.x + 1) / 2) * size.width
      const sy = ((1 - corner.y) / 2) * size.height
      minX = Math.min(minX, sx)
      maxX = Math.max(maxX, sx)
      minY = Math.min(minY, sy)
      maxY = Math.max(maxY, sy)
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
  }

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    const state = useBook.getState()
    if (state.mode !== 'book' && state.mode !== 'focus') return
    if (!isRight && !isLeft) return
    e.stopPropagation()
    const faceIdx = e.face?.materialIndex ?? -1
    const u = e.uv?.x ?? 0.5
    const v = e.uv?.y ?? 0.5
    const side: Side = isRight ? 'right' : 'left'
    const onFace = isRight ? faceIdx === 4 : faceIdx === 5
    const face = isRight ? sheet.front : sheet.back
    const hasContent = face.spec.type === 'chapter'

    // a video frame plays / pauses in place
    if (onFace) {
      const vid = hitVideo(face, u, v)
      if (vid) {
        videos.toggle(isRight ? 'front' : 'back', vid, !state.soundOn)
        return
      }
    }

    if (state.mode === 'focus') {
      if (side === 'right') state.advance()
      else state.retreat()
      return
    }
    // open spread: the outer quarter of a page (or its edge) turns it, the rest reads it
    const onOuterEdge = !onFace || (isRight ? u > 0.76 : u < 0.24)
    if (onOuterEdge || !hasContent) {
      if (side === 'right') state.next()
      else state.prev()
      return
    }
    state.read(side, projectOrigin(e.camera, size))
  }

  const onOver = (e: ThreeEvent<PointerEvent>) => {
    if (!isRight && !isLeft) return
    e.stopPropagation()
    hoveredRef.current = true
    useBook.getState().setHovered(sheet.index)
    document.body.style.cursor = 'pointer'
  }
  const onOut = () => {
    hoveredRef.current = false
    if (useBook.getState().hovered === sheet.index) useBook.getState().setHovered(null)
    document.body.style.cursor = ''
  }

  return <primitive object={mesh} onClick={onClick} onPointerOver={onOver} onPointerOut={onOut} />
}
