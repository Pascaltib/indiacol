import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { book, chapters, formatDate, photoUrl, videoPosterUrl, videoUrl } from '../content/book'
import type { Block, Chapter } from '../content/types'
import { useBook } from '../store/useBook'
import { ArrowLeft, ArrowRight, Close, Mandala, Ornament } from './icons'

function Figure({ block, index }: { block: Extract<Block, { type: 'image' }>; index: number }) {
  const { photo, caption } = block
  const portrait = photo.height > photo.width
  const tilt = ((index % 3) - 1) * 0.5
  const displayW = Math.min(portrait ? 380 : 620, Math.round(photo.width * 1.25))
  return (
    <figure className={portrait ? 'portrait' : ''}>
      <div className="ph" style={{ ['--tilt' as string]: `${tilt}deg` }}>
        <img
          src={photoUrl(photo.id, 640)}
          srcSet={`${photoUrl(photo.id, 640)} 640w, ${photoUrl(photo.id, 1600)} 1600w`}
          sizes={`${displayW}px`}
          width={photo.width}
          height={photo.height}
          loading="lazy"
          decoding="async"
          alt={caption || ''}
          style={{ backgroundImage: `url(${photo.lqip})`, width: `min(100%, ${displayW}px)` }}
        />
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  )
}

function Body({ chapter }: { chapter: Chapter }) {
  let imgIdx = 0
  return (
    <div className="reader__body">
      {chapter.blocks.map((b, i) => {
        switch (b.type) {
          case 'paragraph':
            return <p key={i} dangerouslySetInnerHTML={{ __html: b.html }} />
          case 'heading':
            return <h3 key={i}>{b.text}</h3>
          case 'image':
            return <Figure key={i} block={b} index={imgIdx++} />
          case 'video':
            return (
              <div className={`video ${b.poster && b.poster.height > b.poster.width ? 'portrait' : ''}`} key={i}>
                {b.file ? (
                  <video
                    src={videoUrl(b.file)}
                    poster={videoPosterUrl(b.file)}
                    controls
                    playsInline
                    preload="metadata"
                    width={b.poster?.width}
                    height={b.poster?.height}
                  />
                ) : (
                  <iframe src={b.src} title={`Video ${i}`} allowFullScreen loading="lazy" />
                )}
              </div>
            )
          case 'list':
            return (
              <ul key={i}>
                {b.items.map((it, j) => (
                  <li key={j} dangerouslySetInnerHTML={{ __html: it }} />
                ))}
              </ul>
            )
        }
      })}
    </div>
  )
}

export function Reader() {
  const mode = useBook((s) => s.mode)
  const n = useBook((s) => s.readingChapter)
  const origin = useBook((s) => s.readerOrigin)
  const close = useBook((s) => s.closeReader)
  const readerNext = useBook((s) => s.readerNext)
  const readerPrev = useBook((s) => s.readerPrev)
  const open = mode === 'reading' && n != null
  const chapter = n != null ? chapters[n - 1] : null
  const [shown, setShown] = useState<Chapter | null>(null)
  const panel = useRef<HTMLDivElement>(null)
  const scroll = useRef<HTMLDivElement>(null)

  // keep rendering the last chapter while fading out
  useEffect(() => {
    if (chapter) setShown(chapter)
  }, [chapter])

  // fly in from the page rectangle
  useLayoutEffect(() => {
    const el = panel.current
    if (!el) return
    if (open) {
      if (origin) {
        const vw = window.innerWidth
        const vh = window.innerHeight
        const pw = el.offsetWidth
        const ph = el.offsetHeight
        const dx = origin.x + origin.w / 2 - vw / 2
        const dy = origin.y + origin.h / 2 - vh / 2
        const sx = Math.max(0.2, origin.w / pw)
        const sy = Math.max(0.2, origin.h / ph)
        el.style.transition = 'none'
        el.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(${sx}, ${sy})`
        // force reflow then animate to resting position
        void el.offsetHeight
        requestAnimationFrame(() => {
          el.style.transition = ''
          el.style.transform = 'translate(-50%, -50%)'
        })
      } else {
        el.style.transform = 'translate(-50%, -50%)'
      }
    } else {
      el.style.transform = 'translate(-50%, -50%) scale(0.96)'
    }
  }, [open, origin])

  useEffect(() => {
    if (open && scroll.current) scroll.current.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }, [open, n])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const ch = shown
  return (
    <>
      <div className={`reader-scrim ${open ? 'open' : ''}`} onClick={close} />
      <div ref={panel} className={`reader ${open ? 'open' : ''}`} role="dialog" aria-modal={open} aria-hidden={!open}>
        <div className="reader__bar">
          <button onClick={close}>
            <Close /> <span className="full">Volver al libro</span>
            <span className="short">Volver</span>
          </button>
          <span className="reader__meta">{ch ? `Capítulo ${ch.number} · ${formatDate(ch.date, 'short')}` : ''}</span>
          <span className="reader__count">{ch ? `${ch.imageCount} fotos` : ''}</span>
        </div>
        <div ref={scroll} className="reader__scroll">
          {ch && (
            <article key={ch.number}>
              <div className="reader__eyebrow">Capítulo {ch.number}</div>
              <h2 className="reader__title">{ch.title}</h2>
              <div className="reader__date">{formatDate(ch.date)}</div>
              <Ornament className="reader__ornament" />
              <Body chapter={ch} />
              <Mandala className="reader__end" />

              {ch.comments.length > 0 && (
                <section className="reader__letters">
                  <h4>Cartas de los lectores</h4>
                  {ch.comments.map((cm, i) => (
                    <div key={i} className={`letter ${cm.author === book.author ? 'author' : ''}`}>
                      <header>
                        {cm.author}
                        <small>{formatDate(cm.date)}</small>
                      </header>
                      <div dangerouslySetInnerHTML={{ __html: cm.html }} />
                    </div>
                  ))}
                </section>
              )}

              <nav className="reader__nav">
                {ch.number > 1 ? (
                  <button onClick={readerPrev}>
                    <small>
                      <ArrowLeft /> Capítulo anterior
                    </small>
                    <span>
                      {ch.number - 1}. {chapters[ch.number - 2].title}
                    </span>
                  </button>
                ) : (
                  <span />
                )}
                {ch.number < chapters.length ? (
                  <button className="next" onClick={readerNext}>
                    <small>
                      Capítulo siguiente <ArrowRight />
                    </small>
                    <span>
                      {ch.number + 1}. {chapters[ch.number].title}
                    </span>
                  </button>
                ) : (
                  <button className="next" onClick={close}>
                    <small>Fin</small>
                    <span>Volver al libro</span>
                  </button>
                )}
              </nav>
              <div className="reader__source">
                Publicado originalmente el {formatDate(ch.date)} en{' '}
                <a href={ch.url} target="_blank" rel="noopener">
                  indiacol.blogspot.com
                </a>
              </div>
            </article>
          )}
        </div>
      </div>
    </>
  )
}
