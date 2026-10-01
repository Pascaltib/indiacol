import { chapterAtPage, chapters, formatDate, layout, sheetCount, yearOf } from '../content/book'
import { isPhone, useBook } from '../store/useBook'

export function ChapterIndex() {
  const open = useBook((s) => s.indexOpen)
  const toggle = useBook((s) => s.toggleIndex)
  const goToChapter = useBook((s) => s.goToChapter)
  const openReader = useBook((s) => s.openReader)
  const focus = useBook((s) => s.focus)
  const setPage = useBook((s) => s.setPage)
  const page = useBook((s) => s.page)
  const current = chapterAtPage(page)

  const byYear = new Map<string, typeof chapters>()
  for (const ch of chapters) {
    const y = yearOf(ch.date)
    if (!byYear.has(y)) byYear.set(y, [])
    byYear.get(y)!.push(ch)
  }

  return (
    <>
      <div className={`drawer-backdrop ${open ? 'open' : ''}`} onClick={() => toggle(false)} />
      <aside className={`drawer ${open ? 'open' : ''}`} aria-hidden={!open}>
        <div className="drawer__head">
          <h2>ÍNDICE</h2>
          <button className="drawer__close" onClick={() => toggle(false)}>
            Cerrar
          </button>
        </div>
        <div className="drawer__list">
          {[...byYear.entries()].map(([year, list]) => (
            <div key={year}>
              <div className="drawer__year">{year}</div>
              {list.map((ch) => (
                <button
                  key={ch.number}
                  className={`drawer__item ${current?.number === ch.number ? 'active' : ''}`}
                  onClick={() => goToChapter(ch.number)}
                  onDoubleClick={() => {
                    if (isPhone()) openReader(ch.number)
                    else {
                      goToChapter(ch.number) // also picks the side the opener lands on
                      focus(useBook.getState().focusSide)
                    }
                  }}
                  title="Clic: ir a la página · Doble clic: leer"
                >
                  <span className="num">{ch.number}</span>
                  <span>{ch.title}</span>
                  <span className="date">
                    {formatDate(ch.date, 'month')}
                    <b>{layout.chapterPageNo.get(ch.number)}</b>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
        <div className="drawer__foot">
          <button
            onClick={() => {
              setPage(0)
              toggle(false)
            }}
          >
            Portada
          </button>
          <button
            onClick={() => {
              // the farewell is the front of the second-to-last sheet
              setPage(sheetCount() - 2)
              toggle(false)
            }}
          >
            Despedida
          </button>
        </div>
      </aside>
    </>
  )
}
