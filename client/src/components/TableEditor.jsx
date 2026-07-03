import { memo, useCallback, useRef } from 'react'
import { BOARD_SCHEMES, schemeSwatchAccent } from '../../../shared/board-schemes.js'

const MAX_ROWS = 300
const MAX_COLS = 40

/**
 * One grid row, memoized: setCell only replaces the touched row's array, so
 * typing in a cell re-renders that row alone — not the whole grid.
 */
const GridRow = memo(function GridRow({ row, rowIndex, isHeaderRow, canRemoveRow, onSetCell, onRemoveRow }) {
  return (
    <tr className={isHeaderRow ? 'edit-header-row' : undefined}>
      <td className="edit-gutter">
        <button
          type="button"
          className="edit-remove mono"
          onClick={() => onRemoveRow(rowIndex)}
          disabled={!canRemoveRow}
          aria-label={`Remove row ${rowIndex + 1}`}
          title="Remove row"
        >
          ✕
        </button>
      </td>
      {row.map((cell, c) => (
        <td key={c}>
          <input
            className="edit-cell mono"
            value={cell}
            onChange={(e) => onSetCell(rowIndex, c, e.target.value)}
            aria-label={`Row ${rowIndex + 1} column ${c + 1}`}
          />
        </td>
      ))}
    </tr>
  )
})

/**
 * Native grid editor for a table page: title, header toggle, colour scheme,
 * cells, add/remove rows and columns. Every change flows through onChange(table)
 * and rides the normal autosave.
 */
export default function TableEditor({ page, onChange, background }) {
  const table = page.table
  const rows = table.rows
  const width = rows[0]?.length || 1
  const scheme = table.scheme || 'auto'

  // Refs keep the hot-path callbacks stable across renders (for GridRow's memo)
  // while always operating on the latest table/onChange.
  const tableRef = useRef(table)
  tableRef.current = table
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  const set = (patch) => onChangeRef.current({ ...tableRef.current, ...patch })

  const setCell = useCallback((r, c, value) => {
    const t = tableRef.current
    const next = t.rows.slice()
    next[r] = next[r].slice()
    next[r][c] = value
    onChangeRef.current({ ...t, rows: next })
  }, [])

  const removeRow = useCallback((r) => {
    const t = tableRef.current
    if (t.rows.length <= 1) return
    const next = t.rows.slice()
    next.splice(r, 1)
    onChangeRef.current({ ...t, rows: next, hasHeader: t.hasHeader && next.length > 1 })
  }, [])

  const addRow = () => {
    if (rows.length >= MAX_ROWS) return
    set({ rows: [...rows, Array.from({ length: width }, () => '')] })
  }

  const addCol = () => {
    if (width >= MAX_COLS) return
    set({ rows: rows.map((r) => [...r, '']) })
  }

  const removeCol = (c) => {
    if (width <= 1) return
    set({ rows: rows.map((row) => row.filter((_, i) => i !== c)) })
  }

  return (
    <div className="table-editor">
      <div className="table-editor-head">
        <input
          className="board-title-input"
          value={table.title}
          placeholder="Board title (optional)"
          maxLength={120}
          onChange={(e) => set({ title: e.target.value })}
          aria-label="Board title"
        />
        <button
          type="button"
          className={`chip mono${table.hasHeader ? ' active' : ''}`}
          onClick={() => set({ hasHeader: !table.hasHeader })}
          aria-pressed={table.hasHeader}
          disabled={rows.length < 2}
          title="Treat the first row as column headings"
        >
          HEADER ROW
        </button>
      </div>

      <div className="scheme-row" role="group" aria-label="Board colour scheme">
        <span className="scheme-label mono">SCHEME</span>
        {BOARD_SCHEMES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`scheme-chip mono${scheme === s.id ? ' active' : ''}`}
            style={{
              '--chip-accent': schemeSwatchAccent(s, table.accent, background),
              '--chip-panel': s.panel || 'transparent'
            }}
            onClick={() => set({ scheme: s.id })}
            aria-pressed={scheme === s.id}
            title={s.name}
          >
            <span className="scheme-dot" aria-hidden="true" />
            {s.name.toUpperCase()}
          </button>
        ))}
        {scheme === 'custom' && (
          <label className="swatch swatch-custom scheme-custom" title="Custom accent colour">
            <input
              type="color"
              value={table.accent || '#ffb424'}
              onChange={(e) => set({ accent: e.target.value })}
              aria-label="Custom accent colour"
            />
          </label>
        )}
      </div>

      <div className="table-editor-scroll">
        <table className="edit-grid">
          <thead>
            <tr>
              <th className="edit-gutter" aria-hidden="true" />
              {rows[0]?.map((_, c) => (
                <th key={c} className="edit-colhead">
                  <button
                    type="button"
                    className="edit-remove mono"
                    onClick={() => removeCol(c)}
                    disabled={width <= 1}
                    aria-label={`Remove column ${c + 1}`}
                    title="Remove column"
                  >
                    ✕
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <GridRow
                key={r}
                row={row}
                rowIndex={r}
                isHeaderRow={table.hasHeader && r === 0}
                canRemoveRow={rows.length > 1}
                onSetCell={setCell}
                onRemoveRow={removeRow}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-editor-foot">
        <button type="button" className="ghost-button mono" onClick={addRow} disabled={rows.length >= MAX_ROWS}>
          + ROW
        </button>
        <button type="button" className="ghost-button mono" onClick={addCol} disabled={width >= MAX_COLS}>
          + COLUMN
        </button>
        <span className="mono table-dims">
          {rows.length}×{width}
        </span>
      </div>
    </div>
  )
}
