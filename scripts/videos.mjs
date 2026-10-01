#!/usr/bin/env node
/**
 * Resolves the Blogger-hosted videos referenced in book.json to real media
 * files and stores them locally, so they can play inside the 3D pages.
 *
 *   node scripts/videos.mjs            # idempotent: skips files already present
 *   node scripts/videos.mjs --probe    # only print what the player would stream
 *
 * Blogger's embed (video.g?token=…) is a small web app that asks an internal
 * RPC for the stream list; we call that RPC directly, pick the best MP4,
 * download it to public/videos/<hash>.mp4 and keep a poster frame.
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const VIDEOS_DIR = path.join(ROOT, 'public', 'videos')
const BOOK_JSON = path.join(ROOT, 'src', 'content', 'book.json')
const PROBE = process.argv.includes('--probe')
const log = (...a) => console.log('[videos]', ...a)

const exists = (p) => access(p).then(() => true, () => false)
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12)

function runBinary(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args)
    const chunks = []
    p.stdout.on('data', (c) => chunks.push(c))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve(Buffer.concat(chunks)) : reject(new Error(`${cmd} exited ${code}`))))
  })
}
const run = (cmd, args) => runBinary(cmd, args).then((b) => b.toString('utf8'))
let ffmpegOk = null
async function hasFfmpeg() {
  if (ffmpegOk == null) ffmpegOk = await run('ffmpeg', ['-version']).then(() => true, () => false)
  return ffmpegOk
}

/** Ask Blogger's player backend for the stream list of an embed token. */
async function resolveStreams(token) {
  const url = 'https://www.blogger.com/_/BloggerVideoPlayerUi/data/batchexecute?rpcids=WcwnYd&source-path=%2Fvideo.g'
  const body = new URLSearchParams({ 'f.req': JSON.stringify([[['WcwnYd', JSON.stringify([token]), null, 'generic']]]) })
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body })
  if (!res.ok) throw new Error(`RPC ${res.status}`)
  const text = await res.text()
  const line = text.split('\n').find((l) => l.includes('"wrb.fr"'))
  if (!line) throw new Error('unexpected RPC response')
  const inner = JSON.parse(JSON.parse(line)[0][2])
  // inner[2] = [[url, mime, width?, height?, …], …]; inner also carries a thumbnail
  const streams = []
  const walk = (v) => {
    if (Array.isArray(v)) {
      if (typeof v[0] === 'string' && v[0].includes('googlevideo.com/videoplayback')) streams.push(v)
      else v.forEach(walk)
    }
  }
  walk(inner)
  const flat = JSON.stringify(inner)
  const poster = (flat.match(/https:\\?\/\\?\/i\d\.ytimg\.com[^"]+/) || [''])[0].replace(/\\\//g, '/').replace(/\\u0026/g, '&')
  return { streams, poster, raw: inner }
}

function pickBest(streams) {
  // prefer the highest itag quality we know is a progressive MP4
  const quality = (u) => {
    const itag = +(u.match(/[?&]itag=(\d+)/)?.[1] ?? 0)
    return { 22: 3, 59: 2, 18: 1 }[itag] ?? 0
  }
  return [...streams].map((s) => s[0]).sort((a, b) => quality(b) - quality(a))[0]
}

async function download(url, file) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url.slice(0, 80)}`)
  await writeFile(file, Buffer.from(await res.arrayBuffer()))
}

async function main() {
  const book = JSON.parse(await readFile(BOOK_JSON, 'utf8'))
  await mkdir(VIDEOS_DIR, { recursive: true })
  let changed = false
  for (const ch of book.chapters) {
    for (const block of ch.blocks) {
      if (block.type !== 'video') continue
      const token = new URL(block.src).searchParams.get('token')
      if (!token) continue
      const id = hash(block.src)
      const mp4 = path.join(VIDEOS_DIR, `${id}.mp4`)
      const posterFile = path.join(VIDEOS_DIR, `${id}.webp`)
      if (!PROBE && block.file === id && block.duration && (await exists(mp4)) && (await exists(posterFile))) {
        log(`ch${ch.number} ${id} already present`)
        continue
      }
      const { streams, poster, raw } = await resolveStreams(token)
      if (PROBE) {
        console.log(`ch${ch.number}`, JSON.stringify(raw, null, 1).slice(0, 1200))
        continue
      }
      const best = pickBest(streams)
      if (!best) {
        log(`ch${ch.number}: no stream found`)
        continue
      }
      if (!(await exists(mp4))) {
        log(`ch${ch.number}: downloading ${id} (itag ${best.match(/itag=(\d+)/)?.[1]})`)
        await download(best, mp4)
      }
      // poster: a real frame from the file when ffmpeg is around, else Blogger's thumbnail
      let posterBuf = null
      let duration = 0
      if (await hasFfmpeg()) {
        const probe = await run('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', mp4])
        const info = JSON.parse(probe)
        duration = +info.format?.duration || 0
        const at = Math.min(1.5, duration / 3).toFixed(2)
        posterBuf = await runBinary('ffmpeg', ['-v', 'quiet', '-ss', at, '-i', mp4, '-frames:v', '1', '-f', 'image2', '-vcodec', 'png', '-'])
      }
      if (!posterBuf && poster) {
        const res = await fetch(poster)
        if (res.ok) posterBuf = Buffer.from(await res.arrayBuffer())
      }
      let width = 0
      let height = 0
      let lqip = ''
      if (posterBuf) {
        const meta = await sharp(posterBuf).metadata()
        width = meta.width ?? 0
        height = meta.height ?? 0
        await sharp(posterBuf).resize({ width: Math.min(1280, width) }).webp({ quality: 82 }).toFile(posterFile)
        lqip = `data:image/webp;base64,${(await sharp(posterBuf).resize(24).blur(1).webp({ quality: 40 }).toBuffer()).toString('base64')}`
      }
      block.file = id
      block.poster = { width, height, lqip }
      block.duration = Math.round(duration)
      changed = true
    }
  }
  if (changed) {
    await writeFile(BOOK_JSON, JSON.stringify(book, null, 2))
    log('book.json updated')
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
