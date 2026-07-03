function formatRuntime(totalSeconds) {
  const s = Math.round(totalSeconds)
  const mm = String(Math.floor(s / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${mm}:${ss}`
}

const SAVE_LABEL = {
  idle: 'READY',
  dirty: 'EDITING…',
  saving: 'SAVING…',
  saved: 'ALL CHANGES SAVED',
  error: 'SAVE FAILED'
}

export default function TopBar({ project, mutate, saveState, saveError }) {
  const { pages, settings } = project
  const transitionSecs = settings.transition === 'cut' ? 0 : settings.transitionDuration
  const runtime =
    pages.reduce((sum, p) => sum + (p.duration || 0), 0) +
    (pages.length > 1 ? pages.length * transitionSecs : 0)

  return (
    <header className="topbar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className="brand-text">
          <h1>Public Display</h1>
          <span className="mono brand-sub">MASTER CONTROL · CAROUSEL EDITOR</span>
        </div>
      </div>

      <input
        className="deck-name"
        value={project.name}
        placeholder="Untitled deck"
        maxLength={120}
        onChange={(e) => mutate((p) => ({ ...p, name: e.target.value }))}
        aria-label="Deck name"
      />

      <div className="topbar-stats mono">
        <span className="stat">
          <span className="stat-value">{String(project.pages.length).padStart(2, '0')}</span> PAGES
        </span>
        <span className="stat-divider" aria-hidden="true" />
        <span className="stat">
          LOOP <span className="stat-value">{formatRuntime(runtime)}</span>
        </span>
        <span className="stat-divider" aria-hidden="true" />
        <span className={`save-status save-${saveState}`} title={saveError || undefined}>
          <span className="save-dot" aria-hidden="true" />
          {SAVE_LABEL[saveState]}
        </span>
      </div>
    </header>
  )
}
