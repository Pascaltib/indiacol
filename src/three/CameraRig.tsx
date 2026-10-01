import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import gsap from 'gsap'
import { PerspectiveCamera, Vector3 } from 'three'
import { sheetCount } from '../content/book'
import { useBook } from '../store/useBook'
import { PAGE_HEIGHT, PAGE_WIDTH } from './Book/constants'

const FOV = 34

interface Target {
  x: number
  y: number
  z: number
  lx: number
  ly: number
  lz: number
}

export function CameraRig() {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const size = useThree((s) => s.size)
  const mode = useBook((s) => s.mode)
  const page = useBook((s) => s.page)
  const focusSide = useBook((s) => s.focusSide)
  const target = useMemo<Target>(() => ({ x: 0.9, y: -0.6, z: 9, lx: 0, ly: 0, lz: 0 }), [])
  const look = useRef(new Vector3())
  const tween = useRef<gsap.core.Tween | null>(null)

  useEffect(() => {
    camera.fov = FOV
    camera.near = 0.1
    camera.far = 200
    camera.updateProjectionMatrix()
  }, [camera])

  useEffect(() => {
    const aspect = size.width / size.height
    const tan = Math.tan((FOV / 2) * (Math.PI / 180))
    const closed = page === 0 || page === sheetCount()
    const halfW = closed ? PAGE_WIDTH * 0.5 + 0.05 : PAGE_WIDTH + 0.05
    const padW = aspect < 0.8 ? 1.08 : 1.18
    const padH = aspect < 0.8 ? 1.5 : 1.22
    const dH = (PAGE_HEIGHT * 0.5 * padH) / tan
    const dW = (halfW * padW) / (tan * aspect)
    const d = Math.max(dH, dW)

    let next: Target
    let duration = 1.6
    let ease = 'power3.inOut'

    if (mode === 'loading' || mode === 'intro') {
      // portrait: the intro copy sits in the lower half, so lift the book into the upper half
      next =
        aspect < 0.8
          ? { x: 0.45, y: -1.15, z: d * 1.45, lx: 0.05, ly: -0.95, lz: 0 }
          : { x: 1.1, y: -0.5, z: d * 1.55, lx: 0.1, ly: 0.05, lz: 0 }
      duration = 2.5
      ease = 'power2.out'
    } else if (mode === 'focus' || mode === 'reading') {
      // lean in on one page so it fills the view
      const px = (focusSide === 'right' ? PAGE_WIDTH : -PAGE_WIDTH) * 0.5
      const dRead = Math.max((PAGE_HEIGHT * 0.5 * 1.12) / tan, (PAGE_WIDTH * 0.5 * 1.1) / (tan * aspect))
      // sit a touch above centre so the HUD at the bottom clears the page foot
      next = { x: px, y: -0.06, z: dRead, lx: px, ly: -0.06, lz: 0 }
      duration = 1.3
    } else {
      next = { x: 0, y: 0.08, z: d, lx: 0, ly: -0.04, lz: 0 }
      duration = mode === 'book' && tween.current ? 1.4 : 2.2
    }

    tween.current?.kill()
    tween.current = gsap.to(target, { ...next, duration, ease, overwrite: true })
  }, [mode, page, focusSide, size, target])

  useFrame(() => {
    camera.position.set(target.x, target.y, target.z)
    look.current.set(target.lx, target.ly, target.lz)
    camera.lookAt(look.current)
  })

  return null
}
