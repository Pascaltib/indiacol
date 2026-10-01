import { book, chapters, totalPhotos } from '../content/book'
import { useBook } from '../store/useBook'
import { ArrowRight } from './icons'

export function Intro() {
  const mode = useBook((s) => s.mode)
  const openBook = useBook((s) => s.openBook)
  const visible = mode === 'intro'
  if (mode === 'loading') return null
  return (
    <div className={`intro ${visible ? '' : 'hidden'}`} aria-hidden={!visible}>
      <div className="intro__eyebrow">Un libro para {book.author}</div>
      <h1 className="intro__title">
        India,
        <em>tan lejos, tan cerca</em>
      </h1>
      <p className="intro__meta">
        Cinco años en Nueva Delhi contados en <b>{chapters.length} capítulos</b> y <b>{totalPhotos} fotografías</b>, desde la llegada del contenedor
        hasta el último <i>phir milenge</i>. Las crónicas del blog, encuadernadas.
      </p>
      <button className="intro__cta" onClick={openBook} disabled={!visible}>
        Abrir el libro
        <ArrowRight />
      </button>
    </div>
  )
}
