import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { easing } from 'maath'
import { BoxGeometry, CanvasTexture, Group, Mesh, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three'
import { layout, sheetCount } from '../../content/book'
import { useBook } from '../../store/useBook'
import { playFlip } from '../../audio/flip'
import { LIVE_WINDOW, PAGE_DEPTH, PAGE_HEIGHT, PAGE_WIDTH, PAPER, PAPER_DARK } from './constants'
import { Page } from './Page'
import { thicknessBetween } from './stack'
import { evictOutside, setMaxAnisotropy } from './textureCache'

// ---------------------------------------------------------------------------
// Solid blocks standing in for the sheets outside the live window
// ---------------------------------------------------------------------------

/** fine horizontal lines = the fore-edge of a stack of pages */
function makeEdgeTexture(alongV: boolean) {
  const c = document.createElement('canvas')
  c.width = alongV ? 8 : 64
  c.height = alongV ? 64 : 8
  const ctx = c.getContext('2d')!
  ctx.fillStyle = PAPER_DARK
  ctx.fillRect(0, 0, c.width, c.height)
  for (let i = 0; i < 8; i++) {
    const t = i * 8
    ctx.fillStyle = i % 2 ? 'rgba(90,70,45,0.28)' : 'rgba(255,250,240,0.22)'
    if (alongV) ctx.fillRect(0, t, 8, 4)
    else ctx.fillRect(t, 0, 4, 8)
  }
  const tex = new CanvasTexture(c)
  tex.wrapS = tex.wrapT = RepeatWrapping
  tex.colorSpace = SRGBColorSpace
  return tex
}

const blockGeometry = new BoxGeometry(PAGE_WIDTH, PAGE_HEIGHT, 1)

function PageBlock({ side }: { side: 'left' | 'right' }) {
  const page = useBook((s) => s.page)
  const ref = useRef<Mesh>(null)
  const { materials, texX, texY } = useMemo(() => {
    const texX = makeEdgeTexture(false) // ±x faces: u runs along depth
    const texY = makeEdgeTexture(true) // ±y faces: v runs along depth
    const edgeX = new MeshStandardMaterial({ map: texX, roughness: 0.95 })
    const edgeY = new MeshStandardMaterial({ map: texY, roughness: 0.95 })
    const flat = new MeshStandardMaterial({ color: PAPER, roughness: 0.9 })
    return { materials: [edgeX, edgeX, edgeY, edgeY, flat, flat], texX, texY }
  }, [])
  useEffect(
    () => () => {
      materials.forEach((m) => m.dispose())
      texX.dispose()
      texY.dispose()
    },
    [materials, texX, texY],
  )

  const n = sheetCount()
  let count = 0
  let top = 0
  if (side === 'right') {
    const start = page + LIVE_WINDOW + 1
    const end = n - 2
    count = Math.max(0, end - start + 1)
    top = -thicknessBetween(page, start)
  } else {
    const end = page - LIVE_WINDOW - 1
    count = Math.max(0, end)
    top = -thicknessBetween(end + 1, page)
  }
  const thickness = count * PAGE_DEPTH

  useFrame(() => {
    const m = ref.current
    if (!m) return
    m.visible = count > 0
    if (!m.visible) return
    m.scale.z = Math.max(1e-4, thickness)
    m.position.z = top - thickness / 2
    // one stripe pair per ~2 sheets keeps the edge from aliasing into mush
    const rep = Math.max(1, count / 16)
    texX.repeat.set(rep, 1)
    texY.repeat.set(1, rep)
  })

  return <mesh ref={ref} geometry={blockGeometry} material={materials} position-x={side === 'right' ? PAGE_WIDTH / 2 : -PAGE_WIDTH / 2} castShadow receiveShadow />
}

// ---------------------------------------------------------------------------
// The book
// ---------------------------------------------------------------------------

export function Book() {
  const page = useBook((s) => s.page)
  const mode = useBook((s) => s.mode)
  const gl = useThree((s) => s.gl)
  const group = useRef<Group>(null)
  const inner = useRef<Group>(null)
  const openness = useRef(0)
  const n = sheetCount()

  useEffect(() => {
    setMaxAnisotropy(gl.capabilities.getMaxAnisotropy())
  }, [gl])

  // Sheets that just left the live window but were mid-state-change keep
  // animating for a moment, so a jump through the índice still shows pages flying.
  const [linger, setLinger] = useState<number[]>([])
  const prevPage = useRef(page)
  useEffect(() => {
    const prev = prevPage.current
    prevPage.current = page
    evictOutside(page, TEXTURE_KEEP, [0, n - 1])
    if (prev === page) return
    const { soundOn, turnDirection } = useBook.getState()
    const jump = Math.abs(page - prev)
    if (soundOn) playFlip(turnDirection, Math.min(1, 0.75 + jump * 0.1), jump)
    const lo = Math.min(prev, page)
    const hi = Math.max(prev, page)
    const changed: number[] = []
    for (let i = Math.max(lo, prev - LIVE_WINDOW, 1); i < Math.min(hi, prev + LIVE_WINDOW + 1, n - 1); i++) {
      if (Math.abs(i - page) > LIVE_WINDOW) changed.push(i)
    }
    if (!changed.length) return
    setLinger(changed)
    const t = setTimeout(() => setLinger([]), 1500)
    return () => clearTimeout(t)
  }, [page, n])

  const live = useMemo(() => {
    const set = new Set<number>([0, n - 1, ...linger])
    for (let i = Math.max(0, page - LIVE_WINDOW); i <= Math.min(n - 1, page + LIVE_WINDOW); i++) set.add(i)
    return [...set].sort((a, b) => a - b)
  }, [page, n, linger])

  const pointer = useThree((s) => s.pointer)

  useFrame((state, dt) => {
    const delta = Math.min(dt, 1 / 30)
    const closed = page === 0 || page === n
    easing.damp(openness, 'current', closed ? 0 : 1, 0.5, delta)

    if (!group.current || !inner.current) return

    // keep the visual centre of the book at the origin
    const xTarget = page === 0 ? -PAGE_WIDTH / 2 : page === n ? PAGE_WIDTH / 2 : 0
    easing.damp(inner.current.position, 'x', xTarget, 0.5, delta)

    // gentle floating + pointer parallax (held still while reading)
    const t = state.clock.elapsedTime
    const still = mode === 'reading' || mode === 'focus'
    const floatAmp = still ? 0 : 1
    const targetY = Math.sin(t * 0.7) * 0.035 * floatAmp
    const targetRotX = (-0.18 + Math.sin(t * 0.45) * 0.02) * (still ? 0 : 1) + (still ? 0 : -pointer.y * 0.06)
    const targetRotY = Math.sin(t * 0.33) * 0.03 * floatAmp + (still ? 0 : pointer.x * 0.12)
    const targetRotZ = Math.sin(t * 0.5) * 0.012 * floatAmp
    easing.damp(group.current.position, 'y', targetY, 0.8, delta)
    easing.damp(group.current.rotation, 'x', targetRotX, 0.8, delta)
    easing.damp(group.current.rotation, 'y', targetRotY, 0.8, delta)
    easing.damp(group.current.rotation, 'z', targetRotZ, 0.8, delta)
  })

  return (
    <group ref={group}>
      <group ref={inner}>
        {live.map((i) => (
          <Page key={i} sheet={layout.sheets[i]} openness={openness} />
        ))}
        <PageBlock side="left" />
        <PageBlock side="right" />
      </group>
    </group>
  )
}

/** sheets either side of the spread whose textures stay resident after a turn */
const TEXTURE_KEEP = 4
