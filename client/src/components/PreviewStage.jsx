import { useEffect, useRef, useState } from 'react'
import TableBoard from './TableBoard.jsx'
import TableEditor from './TableEditor.jsx'

const ASPECTS = [
  { id: '16:9', w: 16, h: 9, label: '16:9' },
  { id: '4:3', w: 4, h: 3, label: '4:3' },
  { id: '21:9', w: 21, h: 9, label: '21:9' },
  { id: '9:16', w: 9, h: 16, label: '9:16' }
]

/** One page rendered on the stage: an image or a table board. */
function PageVisual({ page, settings, className }) {
  if (page.type === 'table') {
    return (
      <div className={className}>
        <TableBoard table={page.table} background={settings.background} />
      </div>
    )
  }
  return (
    <div className={className}>
      <img
        src={`/uploads/${page.file}`}
        alt={page.originalName}
        style={{ objectFit: settings.fitMode }}
        draggable={false}
      />
    </div>
  )
}

export default function PreviewStage({ project, selectedPage, onSelect, onTableChange }) {
  const { pages, settings } = project
  const [aspect, setAspect] = useState(ASPECTS[0])
  const [playing, setPlaying] = useState(false)
  const [mode, setMode] = useState('preview') // preview | edit (edit only for table pages)
  // Playback tracks page IDs, not indexes, so reorder/delete mid-play can't jump pages.
  const [frame, setFrame] = useState({ curId: null, prevId: null, tick: 0 })
  const stageRef = useRef(null)

  // Refs let the playback clock read fresh data without restarting the dwell
  // timer every time an unrelated edit re-creates the project object.
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const transitionSecs = settings.transition === 'cut' ? 0 : settings.transitionDuration
  const isTablePage = selectedPage?.type === 'table'
  const editing = mode === 'edit' && isTablePage && !playing

  // Switching pages (or losing the table) drops back to preview mode, so
  // keystrokes can never land in a different page's cells.
  const selectedId = selectedPage?.id ?? null
  const prevSelectedId = useRef(selectedId)
  useEffect(() => {
    const pageChanged = prevSelectedId.current !== selectedId
    prevSelectedId.current = selectedId
    if (mode === 'edit' && (pageChanged || !isTablePage)) setMode('preview')
  }, [selectedId, isTablePage, mode])

  const startLoop = () => {
    if (!pages.length) return
    setMode('preview')
    setFrame({ curId: selectedPage?.id ?? pages[0].id, prevId: null, tick: 0 })
    setPlaying(true)
  }

  const stopLoop = () => setPlaying(false)

  // Keep the current frame valid when pages are edited mid-playback.
  useEffect(() => {
    if (!playing) return
    if (!pages.length) {
      setPlaying(false)
    } else if (!pages.some((p) => p.id === frame.curId)) {
      setFrame((f) => ({ ...f, curId: pages[0].id, prevId: null }))
    }
  }, [pages, playing, frame.curId])

  // The playback clock: dwell + transition, then advance to the next page.
  useEffect(() => {
    if (!playing) return
    const page = pagesRef.current.find((p) => p.id === frame.curId)
    if (!page) return
    const s = settingsRef.current
    const tSecs = s.transition === 'cut' ? 0 : s.transitionDuration
    const t = setTimeout(() => {
      setFrame((f) => {
        const list = pagesRef.current
        if (!list.length) return f
        const i = list.findIndex((p) => p.id === f.curId)
        const next = i === -1 ? list[0] : list[(i + 1) % list.length]
        return { curId: next.id, prevId: f.curId, tick: f.tick + 1 }
      })
    }, (page.duration + tSecs) * 1000)
    return () => clearTimeout(t)
  }, [playing, frame.curId, frame.tick])

  // Rail highlight follows playback.
  useEffect(() => {
    if (playing && frame.curId) onSelect(frame.curId)
  }, [playing, frame.curId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Esc stops the loop — unless the browser is about to use it to exit fullscreen.
  useEffect(() => {
    if (!playing) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setPlaying(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing])

  const goFullscreen = () => {
    stageRef.current?.requestFullscreen?.().catch(() => {})
  }

  const currentPage = playing ? pages.find((p) => p.id === frame.curId) ?? pages[0] : selectedPage
  const prevPage =
    playing && frame.prevId && settings.transition !== 'cut'
      ? pages.find((p) => p.id === frame.prevId)
      : null
  const transitionClass = settings.transition === 'slide' ? 'slide' : 'fade'
  const playingIndex = playing ? pages.findIndex((p) => p.id === frame.curId) : -1

  const pageDescriptor = (page) =>
    page.type === 'table'
      ? `${page.table.rows.length}×${page.table.rows[0]?.length || 0} TABLE`
      : `${page.duration}s DWELL`

  return (
    <main className="stage-wrap">
      <div className="stage-toolbar">
        <div className="aspect-picker" role="group" aria-label="Preview aspect ratio">
          {ASPECTS.map((a) => (
            <button
              key={a.id}
              type="button"
              className={`chip mono${aspect.id === a.id ? ' active' : ''}`}
              onClick={() => setAspect(a)}
              aria-pressed={aspect.id === a.id}
            >
              {a.label}
            </button>
          ))}
          {isTablePage && !playing && (
            <button
              type="button"
              className={`chip mono chip-edit${editing ? ' active' : ''}`}
              onClick={() => setMode(editing ? 'preview' : 'edit')}
              aria-pressed={editing}
            >
              ✎ EDIT TABLE
            </button>
          )}
        </div>
        <div className="stage-actions">
          {playing ? (
            <button type="button" className="chip mono chip-stop" onClick={stopLoop}>
              ■ STOP <span className="kbd">ESC</span>
            </button>
          ) : (
            <button type="button" className="chip mono chip-play" onClick={startLoop} disabled={!pages.length}>
              ▶ RUN LOOP
            </button>
          )}
          <button type="button" className="chip mono" onClick={goFullscreen} disabled={!pages.length || editing}>
            ⛶ FULL
          </button>
        </div>
      </div>

      {editing ? (
        <TableEditor
          key={selectedPage.id}
          page={selectedPage}
          background={settings.background}
          onChange={(table) => onTableChange(selectedPage.id, table)}
        />
      ) : (
        <div className="stage-frame" ref={stageRef}>
          <div
            className="stage-screen"
            style={{
              '--arw': aspect.w,
              '--arh': aspect.h,
              '--stage-bg': settings.background,
              '--ttime': `${transitionSecs}s`
            }}
          >
            {currentPage ? (
              <>
                {prevPage && prevPage.id !== currentPage.id && (
                  <PageVisual
                    key={`prev-${frame.tick}`}
                    page={prevPage}
                    settings={settings}
                    className={`stage-img stage-out ${transitionClass}`}
                  />
                )}
                <PageVisual
                  key={playing ? `cur-${frame.tick}` : `sel-${currentPage.id}`}
                  page={currentPage}
                  settings={settings}
                  className={`stage-img ${playing ? `stage-in ${transitionClass}` : ''}`}
                />
                <div className="scanlines" aria-hidden="true" />
                {playing && (
                  <div
                    key={`bar-${frame.tick}`}
                    className="stage-progress"
                    style={{ animationDuration: `${currentPage.duration + transitionSecs}s` }}
                    aria-hidden="true"
                  />
                )}
              </>
            ) : (
              <div className="no-signal">
                <div className="bars" aria-hidden="true">
                  <span /><span /><span /><span /><span /><span /><span />
                </div>
                <p className="mono">NO SIGNAL — LOAD ARTWORK TO BEGIN</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="stage-caption mono">
        {editing ? (
          <span>EDITING TABLE — CHANGES AUTOSAVE</span>
        ) : playing ? (
          <span className="onair">
            <span className="onair-dot" aria-hidden="true" /> ON AIR — PAGE{' '}
            {String(Math.max(0, playingIndex) + 1).padStart(2, '0')}/{String(pages.length).padStart(2, '0')}
          </span>
        ) : (
          <span>
            PREVIEW · {aspect.label} · {settings.fitMode.toUpperCase()}
            {currentPage ? ` · ${pageDescriptor(currentPage)}` : ''}
          </span>
        )}
      </div>
    </main>
  )
}
