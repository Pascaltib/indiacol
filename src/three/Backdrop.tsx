import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { BackSide, Color, ShaderMaterial } from 'three'

const vertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const fragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uTop;
  uniform vec3 uMid;
  uniform vec3 uBottom;
  uniform vec3 uGlow;
  varying vec3 vDir;

  // cheap value noise
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }

  void main() {
    float h = vDir.y * 0.5 + 0.5; // 0 bottom .. 1 top
    float drift = noise(vDir.xz * 2.0 + uTime * 0.03) * 0.12;
    vec3 col = mix(uBottom, uMid, smoothstep(0.0, 0.55, h + drift));
    col = mix(col, uTop, smoothstep(0.5, 1.0, h + drift * 0.5));
    // warm glow behind the book
    float glow = exp(-dot(vDir.xy - vec2(0.0, -0.05), vDir.xy - vec2(0.0, -0.05)) * 6.0);
    col += uGlow * glow * 0.55;
    // slow travelling haze
    float haze = noise(vDir.xy * 3.0 + vec2(uTime * 0.02, -uTime * 0.015));
    col += haze * 0.035;
    // dither to avoid banding
    col += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
    gl_FragColor = vec4(col, 1.0);
  }
`

export function Backdrop() {
  const mat = useRef<ShaderMaterial>(null)
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uTop: { value: new Color('#0b0a1e') },
      uMid: { value: new Color('#1d1536') },
      uBottom: { value: new Color('#3b1d2e') },
      uGlow: { value: new Color('#8a4a24') },
    }),
    [],
  )
  useFrame((state) => {
    if (mat.current) mat.current.uniforms.uTime.value = state.clock.elapsedTime
  })
  return (
    <mesh scale={60} renderOrder={-10}>
      <sphereGeometry args={[1, 48, 32]} />
      <shaderMaterial ref={mat} uniforms={uniforms} vertexShader={vertex} fragmentShader={fragment} side={BackSide} depthWrite={false} toneMapped={false} />
    </mesh>
  )
}
