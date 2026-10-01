import { useEffect } from 'react'
import { chapterAtPage } from '../content/book'
import { isPhone, useBook } from '../store/useBook'

/** Keyboard, wheel and swipe navigation for the book view. */
export function useInteractions() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useBook.getState()
      if (s.indexOpen && e.key === 'Escape') return s.toggleIndex(false)
      if (s.mode === 'intro' && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight')) return s.openBook()
      if (s.mode !== 'book' && s.mode !== 'focus') return
      switch (e.key) {
        case 'ArrowRight':
        case 'PageDown':
        case ' ':
          e.preventDefault()
          s.advance()
          break
        case 'ArrowLeft':
        case 'PageUp':
          e.preventDefault()
          s.retreat()
          break
        case 'Home':
          s.unfocus()
          s.setPage(0)
          break
        case 'End':
          s.unfocus()
          s.setPage(99999)
          break
        case 'Escape':
          s.unfocus()
          break
        case 'Enter': {
          if (s.mode === 'focus') break
          if (isPhone()) {
            const ch = chapterAtPage(s.page)
            if (ch) s.openReader(ch.number)
          } else {
            s.focus('right')
          }
          break
        }
        case 'i':
        case 'I':
          s.toggleIndex()
          break
      }
    }

    let wheelLock = 0
    const onWheel = (e: WheelEvent) => {
      const s = useBook.getState()
      if ((s.mode !== 'book' && s.mode !== 'focus') || s.indexOpen) return
      const now = performance.now()
      if (now < wheelLock) return
      const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
      if (Math.abs(d) < 18) return
      wheelLock = now + 650
      if (d > 0) s.advance()
      else s.retreat()
    }

    let touchX = 0
    let touchY = 0
    let touchT = 0
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      touchX = t.clientX
      touchY = t.clientY
      touchT = performance.now()
    }
    const onTouchEnd = (e: TouchEvent) => {
      const s = useBook.getState()
      if ((s.mode !== 'book' && s.mode !== 'focus') || s.indexOpen) return
      const t = e.changedTouches[0]
      const dx = t.clientX - touchX
      const dy = t.clientY - touchY
      const dt = performance.now() - touchT
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3 && dt < 700) {
        if (dx < 0) s.advance()
        else s.retreat()
      }
    }

    window.addEventListener('keydown', onKey)
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [])
}
