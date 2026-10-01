import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { useBook } from '../store/useBook'
import { preloadSounds } from '../audio/flip'
import { ensureFonts } from '../three/Book/typography'
import { buildLayout } from '../three/Book/layout'
import { requestTexture } from '../three/Book/textureCache'
import { layout } from '../content/book'
import { Mandala } from './icons'

/**
 * Waits for fonts, paginates the whole book, then paints the first few page
 * textures (cover, title, índice, first chapter) before revealing the scene,
 * so the book never appears blank.
 */
export function Loader() {
  const mode = useBook((s) => s.mode)
  const setMode = useBook((s) => s.setMode)
  const { progress: assetProgress } = useProgress()
  const [prep, setPrep] = useState(0)
  const setLayoutReady = useBook((s) => s.setLayoutReady)

  useEffect(() => {
    let alive = true
    const tasks: Array<() => Promise<unknown>> = [
      () => ensureFonts(),
      () => buildLayout().then(() => setLayoutReady(true)),
      () => preloadSounds(),
      ...[0, 1, 2, 3, 4, 5, 6].map((f) => () => requestTexture(layout.faces[f])),
    ]
    let done = 0
    ;(async () => {
      for (const t of tasks) {
        try {
          await t()
        } catch {
          /* keep going */
        }
        done++
        if (alive) setPrep(done / tasks.length)
      }
      // a short beat so the bar reaches the end
      await new Promise((r) => setTimeout(r, 350))
      if (alive) setMode('intro')
    })()
    return () => {
      alive = false
    }
  }, [setMode, setLayoutReady])

  const progress = Math.min(1, prep * 0.85 + (assetProgress / 100) * 0.15)
  const done = mode !== 'loading'

  return (
    <div className={`loader ${done ? 'done' : ''}`} aria-hidden={done}>
      <div className="loader__inner">
        <Mandala className="loader__mandala" />
        <div className="loader__title">
          India, <i>tan lejos, tan cerca</i>
        </div>
        <div className="loader__bar">
          <span style={{ transform: `scaleX(${progress})` }} />
        </div>
        <div className="loader__hint">Encuadernando el libro</div>
      </div>
    </div>
  )
}
