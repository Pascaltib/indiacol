import { Bloom, DepthOfField, EffectComposer, Noise, SMAA, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'
import { useBook } from '../store/useBook'

/**
 * Post-processing is kept deliberately gentle so the typography on the pages
 * stays crisp: a touch of bloom for the gilded cover and the dust, a vignette,
 * film grain, and depth of field only while the reading panel is open (the
 * book then softly recedes behind the paper).
 */
export function Effects() {
  const reduced = useBook((s) => s.reducedEffects)
  const mode = useBook((s) => s.mode)
  const reading = mode === 'reading'
  const focus = mode === 'focus'
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      {reduced ? <></> : <SMAA />}
      <Bloom intensity={0.28} luminanceThreshold={0.88} luminanceSmoothing={0.25} mipmapBlur />
      {reading && !reduced ? <DepthOfField target={[0, 0, 2.2]} focalLength={0.08} bokehScale={5} height={540} /> : <></>}
      <Vignette eskil={false} offset={focus ? 0.1 : 0.2} darkness={focus ? 0.45 : 0.7} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={focus ? 0.05 : 0.12} />
    </EffectComposer>
  )
}
