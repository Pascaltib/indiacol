import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, Points, ShaderMaterial } from 'three'
import { useBook } from '../store/useBook'

const vertex = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    float t = uTime * 0.12 + aPhase;
    p.x += sin(t * 1.3 + aPhase * 3.0) * 0.25;
    p.y += sin(t * 0.9 + aPhase * 5.0) * 0.18 + mod(t * 0.15, 1.0) * 0.0;
    p.z += cos(t * 1.1 + aPhase * 2.0) * 0.2;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float dist = -mv.z;
    gl_PointSize = aSize * uPixelRatio * (6.0 / dist);
    vAlpha = smoothstep(14.0, 2.0, dist) * (0.35 + 0.65 * (0.5 + 0.5 * sin(t * 2.0 + aPhase * 7.0)));
  }
`

const fragment = /* glsl */ `
  uniform float uFade;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vAlpha * uFade;
    gl_FragColor = vec4(vec3(1.0, 0.85, 0.6) * a, a);
  }
`

export function Dust({ count = 260 }: { count?: number }) {
  const mat = useRef<ShaderMaterial>(null)
  const geometry = useMemo(() => {
    const g = new BufferGeometry()
    const pos = new Float32Array(count * 3)
    const size = new Float32Array(count)
    const phase = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const r = 1.2 + Math.random() * 4.5
      const a = Math.random() * Math.PI * 2
      pos[i * 3] = Math.cos(a) * r
      pos[i * 3 + 1] = (Math.random() - 0.5) * 4.5
      pos[i * 3 + 2] = Math.sin(a) * r * 0.7 - 0.5
      size[i] = 6 + Math.random() * 16
      phase[i] = Math.random() * 100
    }
    g.setAttribute('position', new Float32BufferAttribute(pos, 3))
    g.setAttribute('aSize', new Float32BufferAttribute(size, 1))
    g.setAttribute('aPhase', new Float32BufferAttribute(phase, 1))
    return g
  }, [count])
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uPixelRatio: { value: 1 }, uFade: { value: 1 } }), [])
  const points = useRef<Points>(null)
  useFrame((state, dt) => {
    if (mat.current) {
      const u = mat.current.uniforms
      u.uTime.value = state.clock.elapsedTime
      u.uPixelRatio.value = state.gl.getPixelRatio()
      // motes drifting across the text are distracting while reading: fade them out
      const mode = useBook.getState().mode
      const target = mode === 'focus' || mode === 'reading' ? 0.12 : 1
      u.uFade.value += (target - u.uFade.value) * Math.min(1, dt * 2.5)
    }
  })
  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <shaderMaterial ref={mat} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} transparent depthWrite={false} blending={AdditiveBlending} />
    </points>
  )
}
