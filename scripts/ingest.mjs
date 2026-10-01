#!/usr/bin/env node
/**
 * Ingests the Blogger blog "India, tan lejos, tan cerca" into a structured
 * book.json plus locally optimised photos.
 *
 *   node scripts/ingest.mjs            # full run (idempotent)
 *   node scripts/ingest.mjs --no-photos  # only rebuild book.json
 */
import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'node-html-parser'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PHOTOS_DIR = path.join(ROOT, 'public', 'photos')
const OUT_JSON = path.join(ROOT, 'src', 'content', 'book.json')
const BLOG = 'https://indiacol.blogspot.com'
const WITH_PHOTOS = !process.argv.includes('--no-photos')
const CONCURRENCY = 8

const log = (...a) => console.log('[ingest]', ...a)

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.json()
}

const t = (node) => (node && node.$t) || ''

// ---------------------------------------------------------------------------
// HTML -> blocks
// ---------------------------------------------------------------------------

const fullRes = (src) =>
  src
    .replace(/\/(s\d+(?:-h)?|w\d+-h\d+(?:-p)?(?:-k)?(?:-no-nu)?)\//, '/s1600/')
    .replace(/^\/\//, 'https://')

const escapeHtml = (s) => s.replace(/&(?!(amp|lt|gt|quot|#\d+|#x[0-9a-f]+|[a-z]+);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Serialise a node keeping only semantic inline markup: b / i / a. Everything
// else (spans with MSO styles, fonts, divs…) contributes only its text.
function serializeInline(node) {
  if (node.nodeType === 3) return escapeHtml(node.rawText.replace(/&nbsp;/g, ' '))
  if (node.nodeType !== 1) return ''
  const tag = node.tagName?.toLowerCase()
  if (['o:p', 'style', 'script', 'img', 'iframe', 'table'].includes(tag)) return ''
  if (tag === 'br') return ' '
  const inner = node.childNodes.map(serializeInline).join('')
  if (tag === 'b' || tag === 'strong') return inner.trim() ? `<b>${inner}</b>` : inner
  if (tag === 'i' || tag === 'em') return inner.trim() ? `<i>${inner}</i>` : inner
  if (tag === 'a') {
    const href = node.getAttribute('href') || ''
    if (!href || /blogger\.googleusercontent|bp\.blogspot/.test(href)) return inner
    return `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener">${inner}</a>`
  }
  return inner
}

function cleanInline(el) {
  return serializeInline(el)
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    // merge adjacent bold runs split by MSO spans
    .replace(/<\/b>(\s*)<b>/g, '$1')
    .trim()
}

const textOf = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

function parsePost(html) {
  const root = parse(html, { blockTextElements: { script: false, style: false } })
  const blocks = []
  const seenImages = new Set()

  const pushParagraph = (inner) => {
    const clean = inner
    const text = textOf(clean)
    if (!text) return
    // standalone bold line -> heading
    const stripped = clean.replace(/^\s*(<b>)+|(<\/b>)+\s*$/g, '').trim()
    const isAllBold = /^<b>[^]*<\/b>$/.test(clean.trim()) && !/<\/b>[^]*<b>/.test(clean.trim())
    if (isAllBold && text.length < 90 && /[\p{L}]{3,}/u.test(text)) {
      blocks.push({ type: 'heading', text: textOf(stripped) })
    } else {
      blocks.push({ type: 'paragraph', html: clean })
    }
  }

  const pushImage = (img, caption) => {
    const srcRaw = img.getAttribute('src')
    if (!srcRaw) return
    const src = fullRes(srcRaw)
    if (seenImages.has(src)) return
    seenImages.add(src)
    blocks.push({ type: 'image', src, caption: caption ? textOf(caption) : '' })
  }

  const visit = (node) => {
    if (node.nodeType === 3) {
      const txt = node.rawText
      if (txt && txt.trim()) pushParagraph(cleanInline(parse(`<span>${txt}</span>`)))
      return
    }
    if (node.nodeType !== 1) return
    const tag = node.tagName?.toLowerCase()

    if (tag === 'table' && /tr-caption-container/.test(node.getAttribute('class') || '')) {
      const img = node.querySelector('img')
      const cap = node.querySelector('.tr-caption')
      if (img) pushImage(img, cap ? cap.innerHTML : '')
      return
    }
    if (tag === 'img') {
      pushImage(node, '')
      return
    }
    if (tag === 'iframe') {
      const src = node.getAttribute('src')
      if (src) blocks.push({ type: 'video', src })
      return
    }
    if (tag === 'br' || tag === 'o:p' || tag === 'style' || tag === 'script') return

    const hasBlockChildren = node.childNodes.some((c) => {
      if (c.nodeType !== 1) return false
      const ct = c.tagName?.toLowerCase()
      return ['div', 'p', 'table', 'ul', 'ol', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'iframe'].includes(ct)
    })
    const hasMedia = node.querySelector('img, iframe, table')

    if (hasBlockChildren || hasMedia) {
      // Mixed content: text nodes between block children should become paragraphs
      for (const c of node.childNodes) visit(c)
      return
    }
    if (tag === 'ul' || tag === 'ol') {
      const items = node.querySelectorAll('li').map((li) => cleanInline(li)).filter(Boolean)
      if (items.length) blocks.push({ type: 'list', items })
      return
    }
    pushParagraph(cleanInline(node))
  }

  for (const c of root.childNodes) visit(c)

  // merge adjacent tiny inline fragments produced by span splitting
  const merged = []
  for (const b of blocks) {
    const prev = merged[merged.length - 1]
    if (
      b.type === 'paragraph' &&
      prev &&
      prev.type === 'paragraph' &&
      !/[.!?…:"”)]\s*$/.test(textOf(prev.html)) &&
      textOf(prev.html).length < 400
    ) {
      prev.html = `${prev.html} ${b.html}`.replace(/\s+/g, ' ')
    } else {
      merged.push(b)
    }
  }
  return merged
}

// ---------------------------------------------------------------------------
// Photos
// ---------------------------------------------------------------------------

const hashOf = (s) => createHash('sha1').update(s).digest('hex').slice(0, 14)

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

const photoCache = new Map()

async function processPhoto(src) {
  if (photoCache.has(src)) return photoCache.get(src)
  const id = hashOf(src)
  const metaPath = path.join(PHOTOS_DIR, `${id}.json`)
  if (await exists(metaPath)) {
    const meta = JSON.parse(await readFile(metaPath, 'utf8'))
    photoCache.set(src, meta)
    return meta
  }
  const res = await fetch(src)
  if (!res.ok) throw new Error(`photo ${res.status} ${src}`)
  const buf = Buffer.from(await res.arrayBuffer())
  const img = sharp(buf, { failOn: 'none' }).rotate()
  const m = await img.metadata()
  const large = path.join(PHOTOS_DIR, `${id}-1600.webp`)
  const small = path.join(PHOTOS_DIR, `${id}-640.webp`)
  await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toFile(large)
  await sharp(buf).rotate().resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toFile(small)
  const lqipBuf = await sharp(buf).rotate().resize(20, 20, { fit: 'inside' }).blur(1).webp({ quality: 40 }).toBuffer()
  const outMeta = await sharp(large).metadata()
  const meta = {
    id,
    width: outMeta.width || m.width,
    height: outMeta.height || m.height,
    lqip: `data:image/webp;base64,${lqipBuf.toString('base64')}`,
  }
  await writeFile(metaPath, JSON.stringify(meta))
  photoCache.set(src, meta)
  return meta
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: limit }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx], idx)
    }
  })
  await Promise.all(workers)
  return out
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const slugify = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

async function main() {
  await mkdir(PHOTOS_DIR, { recursive: true })
  await mkdir(path.dirname(OUT_JSON), { recursive: true })

  log('fetching feeds…')
  const [posts, comments] = await Promise.all([
    fetchJson(`${BLOG}/feeds/posts/default?alt=json&max-results=100`),
    fetchJson(`${BLOG}/feeds/comments/default?alt=json&max-results=500`),
  ])

  const entries = posts.feed.entry || []
  log(`${entries.length} posts, ${(comments.feed.entry || []).length} comments`)

  // Comments by post id
  const commentsByPost = new Map()
  for (const c of comments.feed.entry || []) {
    const inReply = (c['thr$in-reply-to'] || {}).ref || ''
    const postId = inReply.split('post-')[1] || ''
    if (!commentsByPost.has(postId)) commentsByPost.set(postId, [])
    commentsByPost.get(postId).push({
      author: t(c.author?.[0]?.name) || 'Anónimo',
      date: t(c.published).slice(0, 10),
      html: cleanInline(parse(`<div>${t(c.content)}</div>`)),
    })
  }

  const chapters = entries
    .map((e) => {
      const id = t(e.id).split('post-')[1]
      const rawTitle = t(e.title).trim()
      const m = rawTitle.match(/^(\d+)\.\s*(.*)$/)
      const number = m ? parseInt(m[1], 10) : 0
      const title = (m ? m[2] : rawTitle).trim()
      const url = (e.link || []).find((l) => l.rel === 'alternate')?.href || ''
      const blocks = parsePost(t(e.content))
      return {
        id,
        number,
        title,
        slug: slugify(`${number}-${title}`),
        date: t(e.published).slice(0, 10),
        url,
        blocks,
        comments: (commentsByPost.get(id) || []).sort((a, b) => a.date.localeCompare(b.date)),
      }
    })
    .sort((a, b) => a.number - b.number)

  // Photos
  const allSrc = [...new Set(chapters.flatMap((c) => c.blocks.filter((b) => b.type === 'image').map((b) => b.src)))]
  log(`${allSrc.length} unique photos`)

  const authorPhotoSrc = fullRes(entries[0]?.author?.[0]?.['gd$image']?.src || '')
  if (authorPhotoSrc) allSrc.push(authorPhotoSrc)

  const photos = {}
  if (WITH_PHOTOS) {
    let done = 0
    await mapLimit(allSrc, CONCURRENCY, async (src) => {
      try {
        photos[src] = await processPhoto(src)
      } catch (err) {
        console.warn('  ! failed', src, err.message)
      }
      done++
      if (done % 50 === 0) log(`  ${done}/${allSrc.length}`)
    })
  } else {
    for (const src of allSrc) {
      const id = hashOf(src)
      const metaPath = path.join(PHOTOS_DIR, `${id}.json`)
      if (await exists(metaPath)) photos[src] = JSON.parse(await readFile(metaPath, 'utf8'))
    }
  }

  let missing = 0
  for (const ch of chapters) {
    for (const b of ch.blocks) {
      if (b.type !== 'image') continue
      const p = photos[b.src]
      if (!p) {
        missing++
        b.photo = null
        continue
      }
      b.photo = { id: p.id, width: p.width, height: p.height, lqip: p.lqip }
    }
    ch.blocks = ch.blocks.filter((b) => b.type !== 'image' || b.photo)
    const firstImg = ch.blocks.find((b) => b.type === 'image')
    ch.hero = firstImg ? firstImg.photo.id : null
    ch.heroCaption = firstImg ? firstImg.caption : ''
    ch.imageCount = ch.blocks.filter((b) => b.type === 'image').length
    ch.excerpt = textOf(ch.blocks.find((b) => b.type === 'paragraph')?.html || '').slice(0, 400)
    ch.wordCount = ch.blocks
      .filter((b) => b.type === 'paragraph')
      .reduce((n, b) => n + textOf(b.html).split(/\s+/).length, 0)
  }

  const author = t(entries[0]?.author?.[0]?.name) || 'Claudia Maria Alvarez'
  const book = {
    title: t(posts.feed.title) || 'India, tan lejos, tan cerca',
    subtitle: 'Crónicas de una colombiana en Nueva Delhi, 2012–2017',
    author,
    authorBio: 'Ciudadana del mundo. Mis blogs son un recuento de mi experiencia en otros países desde la perspectiva de una colombiana.',
    authorPhoto: photos[authorPhotoSrc]?.id || null,
    sourceUrl: BLOG,
    generatedAt: new Date().toISOString(),
    chapters,
  }

  await writeFile(OUT_JSON, JSON.stringify(book))
  const totalImgs = chapters.reduce((n, c) => n + c.imageCount, 0)
  log(`wrote ${path.relative(ROOT, OUT_JSON)} — ${chapters.length} chapters, ${totalImgs} images, ${missing} missing`)
  for (const c of chapters) {
    const empties = c.blocks.filter((b) => b.type === 'paragraph' && !textOf(b.html)).length
    log(`  ${String(c.number).padStart(2)}. ${c.title.slice(0, 50).padEnd(50)} ${String(c.wordCount).padStart(5)}w ${String(c.imageCount).padStart(3)}img ${c.comments.length}c${empties ? ' EMPTY=' + empties : ''}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
