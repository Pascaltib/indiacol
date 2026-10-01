import { useEffect, useState } from 'react'
import { book, chapters, formatDate, totalPhotos, yearOf } from '../content/book'
import { dedication, epigraph } from '../content/dedication'
import { playOpening } from '../audio/flip'
import { useBook } from '../store/useBook'
import { ArrowLeft, ArrowRight, BookOpen, Mandala, Ornament, SoundOff, SoundOn } from './icons'
import './mobile.css'

const SITE = 'indiacol.vercel.app'

/**
 * The phone edition. The floating 3D book is unreadable and heavy on a small
 * screen, so phones get a quiet DOM version: a cover with the dedication and a
 * note that the 3D edition wants a bigger screen, the índice, and the Reader
 * (shared with the desktop) for the chapters themselves.
 */
export function MobileEdition() {
  const [screen, setScreen] = useState<'cover' | 'index'>('cover')
  const reading = useBook((s) => s.mode === 'reading')
  const soundOn = useBook((s) => s.soundOn)
  const toggleSound = useBook((s) => s.toggleSound)
  const openReader = useBook((s) => s.openReader)

  useEffect(() => {
    document.documentElement.classList.add('phone')
    useBook.getState().setMode('book')
    return () => document.documentElement.classList.remove('phone')
  }, [])

  // the page behind the reader must not scroll along
  useEffect(() => {
    document.documentElement.classList.toggle('lock', reading)
  }, [reading])

  const byYear = new Map<string, typeof chapters>()
  for (const ch of chapters) {
    const y = yearOf(ch.date)
    if (!byYear.has(y)) byYear.set(y, [])
    byYear.get(y)!.push(ch)
  }

  const go = (next: 'cover' | 'index') => {
    setScreen(next)
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  }
  const open = () => {
    if (useBook.getState().soundOn) playOpening()
    go('index')
  }

  return (
    <div className="mobile">
      <div className="mobile__sky" aria-hidden />

      {screen === 'cover' ? (
        <section className="mcover">
          <Mandala className="mcover__mandala" />
          <div className="mcover__eyebrow">Un libro para {book.author}</div>
          <h1 className="mcover__title">
            India,
            <em>tan lejos, tan cerca</em>
          </h1>
          <div className="mcover__meta">
            {chapters.length} capítulos · {totalPhotos} fotografías
            <br />
            {epigraph.place}
          </div>

          <div className="mcover__dedication">
            <div className="mcover__for">{dedication.title}</div>
            {dedication.lines.map((l) => (
              <p key={l}>{l}</p>
            ))}
            <Ornament className="mcover__ornament" />
            <div className="mcover__sign">
              {dedication.signature}
              <b>{dedication.name}</b>
            </div>
          </div>

          <aside className="mcover__notice">
            <BookOpen />
            <div>
              <strong>Mejor en una pantalla grande</strong>
              <p>
                En el móvil solo verás los textos y las fotos, no el libro. Para hojearlo de verdad, entra en <b>{SITE}</b> desde un
                portátil o una tableta.
              </p>
            </div>
          </aside>

          <button className="mcover__cta" onClick={open}>
            Leer aquí los capítulos
            <ArrowRight />
          </button>
        </section>
      ) : (
        <section className="mindex">
          <header className="mindex__head">
            <button className="mindex__back" onClick={() => go('cover')}>
              <ArrowLeft /> Portada
            </button>
            <h2>Índice</h2>
            <button className="mindex__sound" onClick={toggleSound} title={soundOn ? 'Silenciar' : 'Activar sonido'}>
              {soundOn ? <SoundOn /> : <SoundOff />}
            </button>
          </header>
          <div className="mindex__intro">
            {chapters.length} crónicas desde Nueva Delhi, {yearOf(chapters[0].date)} – {yearOf(chapters[chapters.length - 1].date)}
          </div>
          <div className="mindex__list">
            {[...byYear.entries()].map(([year, list]) => (
              <div key={year} className="mindex__year">
                <div className="mindex__yearlabel">{year}</div>
                {list.map((ch) => (
                  <button key={ch.number} className="mindex__item" onClick={() => openReader(ch.number)}>
                    <span className="num">{ch.number}</span>
                    <span className="body">
                      <span className="title">{ch.title}</span>
                      <span className="sub">
                        {formatDate(ch.date, 'short')}
                        {ch.imageCount > 0 && <> · {ch.imageCount} fotos</>}
                      </span>
                    </span>
                    <ArrowRight />
                  </button>
                ))}
              </div>
            ))}
          </div>
          <footer className="mindex__foot">
            <Mandala />
            <p>{epigraph.quote}</p>
            <small>{epigraph.attribution}</small>
          </footer>
        </section>
      )}
    </div>
  )
}
