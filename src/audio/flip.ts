/**
 * The book's sounds, from real recordings (see scripts/sounds.mjs):
 *
 *  - page turns: eight different real paper turns, one picked at random per
 *    turn (never the same twice in a row) with a touch of speed variation, so
 *    no two turns sound identical. Jumps through the índice riffle several.
 *  - opening: a bansuri alap over a tanpura that swells as the cover lifts
 *    and fades away over the first spread.
 */
import { useBook } from '../store/useBook'

const BASE = import.meta.env.BASE_URL
const FLIP_COUNT = 8

let ctx: AudioContext | null = null
let flips: (AudioBuffer | null)[] = []
let intro: AudioBuffer | null = null
let loading: Promise<void> | null = null
let lastFlip = -1
let opening: { src: AudioBufferSourceNode; gain: GainNode } | null = null

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => undefined)
  return ctx
}

async function load(ac: AudioContext, url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await ac.decodeAudioData(await res.arrayBuffer())
  } catch {
    return null
  }
}

/** fetch + decode every clip (decoding works while the context is still suspended) */
export function preloadSounds() {
  if (loading) return loading
  loading = (async () => {
    const ac = getCtx()
    const urls = Array.from({ length: FLIP_COUNT }, (_, i) => `${BASE}audio/flip-${String(i + 1).padStart(2, '0')}.mp3`)
    const [all, introBuf] = await Promise.all([Promise.all(urls.map((u) => load(ac, u))), load(ac, `${BASE}audio/intro.mp3`)])
    flips = all
    intro = introBuf
  })()
  return loading
}

function pickFlip() {
  const ready = flips.map((b, i) => (b ? i : -1)).filter((i) => i >= 0 && i !== lastFlip)
  if (!ready.length) return null
  lastFlip = ready[Math.floor(Math.random() * ready.length)]
  return flips[lastFlip]
}

function playBuffer(ac: AudioContext, buffer: AudioBuffer, at: number, gain: number, rate: number) {
  const src = ac.createBufferSource()
  src.buffer = buffer
  src.playbackRate.value = rate
  const g = ac.createGain()
  g.gain.value = gain
  src.connect(g).connect(ac.destination)
  src.start(at)
}

/**
 * @param direction  1 forward, -1 back
 * @param intensity  0..1 overall loudness
 * @param count      number of sheets turned at once (jumps riffle several)
 */
export function playFlip(direction: 1 | -1 = 1, intensity = 1, count = 1) {
  try {
    const ac = getCtx()
    void preloadSounds()
    const first = pickFlip()
    if (!first) return
    const now = ac.currentTime + 0.01
    // a turn back is a touch slower and softer, a page settling rather than flying
    const base = direction > 0 ? 1 : 0.95
    playBuffer(ac, first, now, 0.55 * intensity, base * (0.96 + Math.random() * 0.1))
    // riffle: a few quicker, quieter turns tumbling after the first
    const extra = Math.min(3, count - 1)
    let t = now
    for (let i = 0; i < extra; i++) {
      const b = pickFlip()
      if (!b) break
      t += 0.1 + Math.random() * 0.08
      playBuffer(ac, b, t, 0.33 * intensity * (1 - i * 0.2), 1.12 + Math.random() * 0.15)
    }
  } catch {
    /* audio not available */
  }
}

/** the alap that opens the book; fades in and out on its own */
export function playOpening() {
  try {
    const ac = getCtx()
    const start = () => {
      if (!intro) return
      stopOpening(0.3)
      const src = ac.createBufferSource()
      src.buffer = intro
      const gain = ac.createGain()
      gain.gain.value = 0.65
      src.connect(gain).connect(ac.destination)
      src.start()
      opening = { src, gain }
      src.onended = () => {
        if (opening?.src === src) opening = null
      }
    }
    if (intro) start()
    else void preloadSounds().then(() => useBook.getState().soundOn && start())
  } catch {
    /* ignore */
  }
}

export function stopOpening(fade = 1.2) {
  const o = opening
  if (!o || !ctx) return
  opening = null
  const now = ctx.currentTime
  o.gain.gain.cancelScheduledValues(now)
  o.gain.gain.setValueAtTime(o.gain.gain.value, now)
  o.gain.gain.linearRampToValueAtTime(0.0001, now + fade)
  try {
    o.src.stop(now + fade + 0.05)
  } catch {
    /* already stopped */
  }
}

useBook.subscribe((s, prev) => {
  // the sound toggle silences the music too
  if (prev.soundOn && !s.soundOn) stopOpening(0.4)
  // leaving the intro starts the music, whether by button, key or swipe
  // (all of them are user gestures, so the AudioContext may start)
  if (prev.mode === 'intro' && s.mode !== 'intro' && s.soundOn) playOpening()
})
