import { Suspense } from 'react'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, PerformanceMonitor } from '@react-three/drei'
import { useBook } from '../store/useBook'
import { Backdrop } from './Backdrop'
import { Book } from './Book/Book'
import { CameraRig } from './CameraRig'
import { Dust } from './Dust'
import { Effects } from './Effects'

const dbg = new URLSearchParams(location.search)

export function Experience() {
  const setReduced = useBook((s) => s.setReducedEffects)
  const reduced = useBook((s) => s.reducedEffects)
  const layoutReady = useBook((s) => s.layoutReady)
  return (
    <Canvas
      shadows
      dpr={reduced ? [1, 1.25] : [1, 2]}
      camera={{ position: [1.1, -0.5, 9], fov: 34, near: 0.1, far: 200 }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
      style={{ position: 'fixed', inset: 0 }}
      eventPrefix="client"
      onPointerMissed={() => useBook.getState().unfocus()}
    >
      <PerformanceMonitor onDecline={() => setReduced(true)} flipflops={2} />
      <color attach="background" args={['#120f22']} />
      <Backdrop />

      {/* warm key light, cool rim, soft fill */}
      <ambientLight intensity={0.25} color="#ffe6c8" />
      <directionalLight
        position={[2.4, 3.6, 4.2]}
        intensity={2.4}
        color="#ffe2bd"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00015}
        shadow-normalBias={0.02}
      >
        <orthographicCamera attach="shadow-camera" args={[-3, 3, 3, -3, 0.5, 14]} />
      </directionalLight>
      <directionalLight position={[-3, 1.2, 2]} intensity={0.55} color="#a9b8ff" />
      <pointLight position={[0, -2.2, 2.5]} intensity={6} distance={9} decay={2} color="#ff9d5c" />

      {!dbg.has('noenv') && (<Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.4} color="#ffe9cf" position={[0, 3.5, 3]} rotation-x={-Math.PI / 2.4} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={0.9} color="#8f9fff" position={[-5, 1, 2]} rotation-y={Math.PI / 2.6} scale={[3, 4, 1]} />
        <Lightformer form="ring" intensity={1.1} color="#ffb070" position={[4, -1, 3]} scale={2.5} />
        <Lightformer form="circle" intensity={0.6} color="#ffffff" position={[0, 0, 6]} scale={1.5} />
      </Environment>)}

      <Suspense fallback={null}>{layoutReady && <Book />}</Suspense>
      {!dbg.has('noshadow') && (<ContactShadows position={[0, -1.35, 0]} opacity={0.55} scale={7} blur={2.6} far={3} resolution={512} color="#1a0d10" frames={Infinity} />)}
      {!dbg.has('nodust') && <Dust count={reduced ? 120 : 260} />}
      <CameraRig />
      {!dbg.has('nofx') && <Effects />}
    </Canvas>
  )
}
