import { useEffect, useState } from 'react'
import { chapterAtPage, chapters, sheetCount, spreadAt } from '../content/book'
import { isPhone, useBook } from '../store/useBook'
import { ArrowLeft, ArrowRight, BookOpen, Close, Expand, List, SoundOff, SoundOn } from './icons'

function statusFor(page: number) {
  const n = sheetCount()
  if (page === 0) return { small: 'Portada', main: 'India, tan lejos, tan cerca' }
  if (page >= n) return { small: 'Contraportada', main: 'Fin' }
  const [left, right] = spreadAt(page)
  const ch = chapterAtPage(page)
  if (ch) {
    const pages = [left?.pageNo, right?.pageNo].filter((p): p is number => p != null)
    const pg = pages.length === 2 ? `págs. ${pages[0]}–${pages[1]}` : pages.length === 1 ? `pág. ${pages[0]}` : ''
    return { small: `Capítulo ${ch.number} de ${chapters.length}${pg ? ` · ${pg}` : ''}`, main: ch.title }
  }
  switch (right?.spec.type) {
    case 'title':
      return { small: 'Portadilla', main: 'India, tan lejos, tan cerca' }
    case 'index':
      return { small: 'Índice', main: 'Treinta y seis capítulos' }
    case 'closing':
      return { small: 'Despedida', main: 'Nadie nos quita lo bailado' }
    case 'endpaper':
      return { small: 'Colofón', main: 'Gracias por leer' }
    default:
      return { small: '', main: '' }
  }
}

export function Hud() {
  const mode = useBook((s) => s.mode)
  const page = useBook((s) => s.page)
  const soundOn = useBook((s) => s.soundOn)
  const toggleSound = useBook((s) => s.toggleSound)
  const toggleIndex = useBook((s) => s.toggleIndex)
  const advance = useBook((s) => s.advance)
  const retreat = useBook((s) => s.retreat)
  const unfocus = useBook((s) => s.unfocus)
  const openReader = useBook((s) => s.openReader)
  const [turns, setTurns] = useState(0)
  const [fs, setFs] = useState(false)
  const [phone, setPhone] = useState(isPhone)

  useEffect(() => {
    if (mode === 'book') setTurns((n) => n + 1)
  }, [page, mode])

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement)
    const onResize = () => setPhone(isPhone())
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  const focus = mode === 'focus'
  const visible = mode === 'book' || focus
  const status = statusFor(page)
  const chapter = chapterAtPage(page)
  const canFullscreen = typeof document !== 'undefined' && !!document.documentElement.requestFullscreen

  return (
    <div className={`hud ${visible ? '' : 'hidden'} ${focus ? 'focus' : ''}`} aria-hidden={!visible}>
      <div className="hud__brand">
        India, <i>tan lejos, tan cerca</i>
      </div>

      <div className="hud__tools">
        {focus && (
          <button className="iconbtn text" onClick={unfocus} title="Volver a ver el libro (Esc)">
            <Close /> Alejar
          </button>
        )}
        <button className="iconbtn text" onClick={() => toggleIndex()} title="Índice de capítulos">
          <List /> Índice
        </button>
        <button className="iconbtn" onClick={toggleSound} title={soundOn ? 'Silenciar' : 'Activar sonido'}>
          {soundOn ? <SoundOn /> : <SoundOff />}
        </button>
        {canFullscreen && (
          <button
            className="iconbtn"
            title={fs ? 'Salir de pantalla completa' : 'Pantalla completa'}
            onClick={() => {
              if (document.fullscreenElement) document.exitFullscreen()
              else document.documentElement.requestFullscreen().catch(() => undefined)
            }}
          >
            <Expand />
          </button>
        )}
      </div>

      <div className={`hud__hint ${turns > 3 || page === 0 || focus ? 'hidden' : ''}`}>
        {phone
          ? 'Desliza para pasar las hojas · toca una página para leerla'
          : 'Flechas o rueda para pasar las hojas · haz clic en una página para acercarte a leerla'}
      </div>

      {phone && (
        <button className={`hud__read ${chapter ? '' : 'hidden'}`} onClick={() => chapter && openReader(chapter.number)}>
          <BookOpen /> &nbsp;Leer el capítulo
        </button>
      )}

      <div className="hud__nav">
        <button className="iconbtn" onClick={retreat} disabled={page === 0} title="Página anterior">
          <ArrowLeft />
        </button>
        <div className="hud__status">
          <small>{status.small}</small>
          {status.main}
        </div>
        <button className="iconbtn" onClick={advance} disabled={page >= sheetCount()} title="Página siguiente">
          <ArrowRight />
        </button>
      </div>
    </div>
  )
}
