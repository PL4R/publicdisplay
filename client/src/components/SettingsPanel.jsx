import { useState } from 'react'
import * as api from '../api.js'

const TRANSITIONS = [
  { id: 'cut', label: 'CUT' },
  { id: 'fade', label: 'FADE' },
  { id: 'slide', label: 'SLIDE' }
]

const FIT_MODES = [
  { id: 'contain', label: 'CONTAIN', hint: 'Whole image visible, letterboxed on mismatched screens.' },
  { id: 'cover', label: 'COVER', hint: 'Fills the screen, crops overflow. Best for full-bleed art.' },
  { id: 'fill', label: 'FILL', hint: 'Stretches to fit exactly. May distort.' }
]

const SWATCHES = ['#000000', '#0b0e12', '#14181f', '#ffffff']

function Segmented({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          className={`segment mono${value === o.id ? ' active' : ''}`}
          onClick={() => onChange(o.id)}
          aria-pressed={value === o.id}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export default function SettingsPanel({ project, mutate, outputDir, onBeforeGenerate }) {
  const { settings, pages } = project
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [dwellDraft, setDwellDraft] = useState(null)

  const setSetting = (key, value) =>
    mutate((p) => ({ ...p, settings: { ...p.settings, [key]: value } }))

  const applyDwellToAll = () =>
    mutate((p) => ({
      ...p,
      pages: p.pages.map((pg) => ({ ...pg, duration: p.settings.defaultDuration }))
    }))

  const handleGenerate = async () => {
    setBusy(true)
    setError('')
    try {
      await onBeforeGenerate()
      const res = await api.generate()
      setResult(res)
    } catch (err) {
      setResult(null)
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const fitHint = FIT_MODES.find((f) => f.id === settings.fitMode)?.hint

  return (
    <aside className="settings">
      <section className="settings-section">
        <h2 className="mono">TIMING</h2>
        <label className="field">
          <span className="field-label mono">DEFAULT DWELL — NEW PAGES</span>
          <div className="field-row">
            <input
              className="num-input mono"
              type="number"
              min={1}
              max={600}
              value={dwellDraft ?? settings.defaultDuration}
              onChange={(e) => {
                const raw = e.target.value
                setDwellDraft(raw)
                if (raw.trim() === '') return // emptied mid-edit; don't snap to 1
                const n = Math.round(Number(raw))
                if (Number.isFinite(n)) setSetting('defaultDuration', Math.min(600, Math.max(1, n)))
              }}
              onBlur={() => setDwellDraft(null)}
            />
            <span className="mono field-unit">SEC</span>
            <button
              type="button"
              className="ghost-button mono"
              onClick={applyDwellToAll}
              disabled={!pages.length}
              title="Set every page's dwell time to this value"
            >
              APPLY TO ALL
            </button>
          </div>
        </label>
      </section>

      <section className="settings-section">
        <h2 className="mono">TRANSITION</h2>
        <Segmented
          options={TRANSITIONS}
          value={settings.transition}
          onChange={(v) => setSetting('transition', v)}
          label="Transition style"
        />
        <label className={`field${settings.transition === 'cut' ? ' field-disabled' : ''}`}>
          <span className="field-label mono">
            TRANSITION TIME <span className="field-value">{settings.transitionDuration.toFixed(1)}s</span>
          </span>
          <input
            type="range"
            min={0.2}
            max={5}
            step={0.1}
            value={settings.transitionDuration}
            disabled={settings.transition === 'cut'}
            onChange={(e) => setSetting('transitionDuration', Number(e.target.value))}
          />
        </label>
      </section>

      <section className="settings-section">
        <h2 className="mono">CANVAS</h2>
        <Segmented
          options={FIT_MODES}
          value={settings.fitMode}
          onChange={(v) => setSetting('fitMode', v)}
          label="Image fit mode"
        />
        {fitHint && <p className="field-hint">{fitHint}</p>}
        <div className="field">
          <span className="field-label mono">BACKGROUND</span>
          <div className="swatch-row">
            {SWATCHES.map((c) => (
              <button
                key={c}
                type="button"
                className={`swatch${settings.background === c ? ' active' : ''}`}
                style={{ background: c }}
                onClick={() => setSetting('background', c)}
                aria-label={`Background ${c}`}
                aria-pressed={settings.background === c}
              />
            ))}
            <label className="swatch swatch-custom" title="Custom colour">
              <input
                type="color"
                value={settings.background}
                onChange={(e) => setSetting('background', e.target.value)}
                aria-label="Custom background colour"
              />
            </label>
            <span className="mono swatch-value">{settings.background.toUpperCase()}</span>
          </div>
        </div>
      </section>

      <section className="settings-section settings-output">
        <h2 className="mono">OUTPUT</h2>
        <p className="field-hint">
          Writes a standalone <span className="mono">index.html</span> + assets folder. Copy it to the display
          PC and open it fullscreen — it scales to any resolution.
        </p>
        <button
          type="button"
          className={`generate-button${busy ? ' busy' : ''}`}
          onClick={handleGenerate}
          disabled={busy || !pages.length}
        >
          <span className="mono">{busy ? 'WRITING…' : '● GENERATE TO DISK'}</span>
        </button>
        {error && <p className="rail-error">{error}</p>}
        {result && !error && (
          <div className="gen-result">
            <p className="mono gen-ok">✓ {result.pageCount} PAGE{result.pageCount === 1 ? '' : 'S'} EXPORTED</p>
            <p className="mono gen-path" title={result.indexPath}>{result.indexPath}</p>
            <a className="ghost-button mono" href="/display/" target="_blank" rel="noreferrer">
              OPEN PLAYER ↗
            </a>
          </div>
        )}
        {!result && outputDir && (
          <p className="mono gen-path dim" title={outputDir}>→ {outputDir}</p>
        )}
      </section>
    </aside>
  )
}
