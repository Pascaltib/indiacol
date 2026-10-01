#!/usr/bin/env node
/**
 * Builds the book's sound assets from freely licensed recordings:
 *
 *   public/audio/flip-NN.mp3  real page turns, cut from
 *     "Book, Paper, Pages, assorted" (stephan, public domain) and
 *     "Turning a page" (planish, public domain) on Wikimedia Commons
 *   public/audio/intro.mp3    the alap that opens the book: bansuri over a
 *     tanpura, cut from "Flute Recital by Pandit Hari Prasad Chaurasia"
 *     (Sangeet Parishad Kashi, Varanasi — National Cultural Audiovisual
 *     Archives of India, CC BY-NC 4.0) on archive.org
 *
 * Each clip is loudness-matched (RMS) and faded. Needs ffmpeg on PATH
 * (brew install ffmpeg). Sources are cached in the OS temp dir; re-runs are
 * idempotent unless --force is given.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'public', 'audio')
const cache = join(tmpdir(), 'indiacol-sounds')
const force = process.argv.includes('--force')
mkdirSync(outDir, { recursive: true })
mkdirSync(cache, { recursive: true })

const UA = 'indiacol-book/1.0 (personal project)'
const COMMONS = 'https://upload.wikimedia.org/wikipedia/commons'

const sources = {
  pages: { url: `${COMMONS}/7/79/Book_paper_pages_assorted.ogg`, file: 'Book_paper_pages_assorted.ogg' },
  turning: { url: `${COMMONS}/6/6b/Turning_a_page.ogg`, file: 'Turning_a_page.ogg' },
  flute: {
    url: 'https://archive.org/download/dni.ncaa.SPK-52-AC/SPK-52-AC_SIDE_A.mp3',
    file: 'chaurasia-52a-0-70.mp3',
    // only the opening alap of the hour-long cassette is needed
    range: { ss: 0, t: 70 },
  },
}

/** single page turns in the assorted recording: [start, duration] */
const flips = [
  ['pages', 10.7, 1.45],
  ['pages', 13.28, 1.55],
  ['pages', 17.7, 0.95],
  ['pages', 22.88, 1.2],
  ['pages', 25.6, 1.25],
  ['pages', 31.0, 1.45],
  ['pages', 33.48, 1.5],
  ['turning', 1.1, 1.7],
]

function ff(args, opts = {}) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-v', 'error', '-y', ...args], { encoding: 'utf8', ...opts })
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}\n${r.stderr}`)
  return r
}

async function fetchSource(key) {
  const s = sources[key]
  const path = join(cache, s.file)
  if (existsSync(path) && statSync(path).size > 10_000) return path
  if (s.range) {
    // let ffmpeg pull just the needed window over http
    console.log(`  fetching ${s.file} (${s.range.t}s window) …`)
    ff(['-user_agent', UA, '-ss', String(s.range.ss), '-t', String(s.range.t), '-i', s.url, '-c', 'copy', path])
    return path
  }
  console.log(`  fetching ${s.file} …`)
  const res = await fetch(s.url, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`${res.status} for ${s.url}`)
  writeFileSync(path, Buffer.from(await res.arrayBuffer()))
  return path
}

/** mean RMS (dBFS) of a window, via volumedetect */
function meanVolume(file, ss, t) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-ss', String(ss), '-t', String(t), '-i', file, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' })
  const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(r.stderr)
  if (!m) throw new Error('volumedetect failed')
  return parseFloat(m[1])
}

async function buildFlips() {
  const TARGET = -27 // dBFS mean, a quiet, close sound
  for (let i = 0; i < flips.length; i++) {
    const [key, ss, t] = flips[i]
    const out = join(outDir, `flip-${String(i + 1).padStart(2, '0')}.mp3`)
    if (existsSync(out) && !force) continue
    const src = await fetchSource(key)
    const gain = TARGET - meanVolume(src, ss, t)
    const af = [
      'highpass=f=120', // no room rumble
      `afade=t=in:d=0.012`,
      `afade=t=out:st=${(t - 0.18).toFixed(3)}:d=0.18`,
      `volume=${gain.toFixed(2)}dB`,
    ].join(',')
    ff(['-ss', String(ss), '-t', String(t), '-i', src, '-af', af, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '3', out])
    console.log(`  ${out.replace(root + '/', '')}  ${t}s  gain ${gain.toFixed(1)} dB`)
  }
}

async function buildIntro() {
  const out = join(outDir, 'intro.mp3')
  if (existsSync(out) && !force) return
  const src = await fetchSource('flute')
  // a quiet tanpura bed, the flute phrase enters ~2 s in, two more phrases
  // follow, and the passage settles into a lull where the fade-out ends
  const ss = 14
  const t = 41
  const gain = -24 - meanVolume(src, ss, t)
  const af = [
    'highpass=f=55',
    'lowpass=f=9000', // soften the cassette hiss
    `afade=t=in:d=2.2:curve=esin`,
    `afade=t=out:st=31:d=10:curve=esin`,
    `volume=${gain.toFixed(2)}dB`,
  ].join(',')
  ff(['-ss', String(ss), '-t', String(t), '-i', src, '-af', af, '-ac', '2', '-ar', '44100', '-c:a', 'libmp3lame', '-q:a', '3', out])
  console.log(`  ${out.replace(root + '/', '')}  ${t}s  gain ${gain.toFixed(1)} dB`)
}

try {
  execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' })
} catch {
  console.error('ffmpeg not found on PATH (brew install ffmpeg)')
  process.exit(1)
}
console.log('page turns')
await buildFlips()
console.log('intro alap')
await buildIntro()
console.log('done')
