import { resolveBoardPalette } from '../../../shared/board-schemes.js'

function isNumericCell(s) {
  const v = String(s || '').trim()
  if (!v) return false
  // Plain numbers or grouped thousands, optional currency/percent — but NOT
  // dotted dates (two separators) or spaced phone numbers (non-3-digit groups).
  return (
    /^[-+(]?[$€£]?\d{1,3}([,\s]\d{3})*([.,]\d+)?\s*%?\)?$/.test(v) ||
    /^[-+(]?[$€£]?\d+([.,]\d+)?\s*%?\)?$/.test(v)
  )
}

/** Right-align columns that are ≥70% numeric (ignoring blanks). */
export function columnAlignments(rows, hasHeader) {
  const body = hasHeader ? rows.slice(1) : rows
  if (!body.length || !rows.length) return []
  return rows[0].map((_, c) => {
    let filled = 0
    let numeric = 0
    for (const row of body) {
      const v = String(row[c] || '').trim()
      if (!v) continue
      filled += 1
      if (isNumericCell(v)) numeric += 1
    }
    return filled > 0 && numeric / filled >= 0.7 ? 'right' : 'left'
  })
}

/** CSS variables for a table's resolved colours — shared logic with the player. */
export function boardVars(table, background) {
  const pal = resolveBoardPalette(table.scheme, table.accent, background)
  return {
    '--board-fg': pal.fg,
    '--board-dim': pal.dim,
    '--board-line': pal.line,
    '--board-zebra': pal.zebra,
    '--board-accent': pal.accent,
    '--board-panel': pal.panel || 'transparent'
  }
}

/**
 * The display board itself, exactly as the generated player renders it.
 * Font size is in cqh units so it scales with whatever container it sits in
 * (the preview stage, fullscreen, or a thumbnail).
 */
// Auto-fit constants — MUST stay in sync with buildBoard in server/generate.js.
// A body row costs ~2.13x the font size (1.25 line-height + 0.84em padding +
// border), the header ~1.93x, the title ~3.4x, in 88 units of usable height.
const ROW_COST = 2.13
const HEADER_COST = 1.93
const TITLE_COST = 3.4
const AVAIL = 88
const MIN_FS = 1.4
const MAX_FS = 5.2

export default function TableBoard({ table, background }) {
  const rows = table.rows || []
  const hasHeader = !!table.hasHeader && rows.length > 1
  const header = hasHeader ? rows[0] : null
  const fullBody = hasHeader ? rows.slice(1) : rows
  const aligns = columnAlignments(rows, hasHeader)

  // Rows that cannot fit at the minimum font size are cut and announced with a
  // "+N more rows" line instead of silently clipping off-screen.
  const fixedCost = (hasHeader ? HEADER_COST : 0) + (table.title ? TITLE_COST : 0)
  const capacity = Math.max(1, Math.floor((AVAIL / MIN_FS - fixedCost) / ROW_COST))
  const body = fullBody.length > capacity ? fullBody.slice(0, Math.max(1, capacity - 1)) : fullBody
  const more = fullBody.length - body.length
  const units = fixedCost + (body.length + (more ? 1 : 0)) * ROW_COST
  const fontSize = `${Math.max(MIN_FS, Math.min(MAX_FS, AVAIL / Math.max(1, units)))}cqh`

  return (
    <div className="board" style={{ fontSize, ...boardVars(table, background) }}>
      {table.title && <div className="board-title">{table.title}</div>}
      <div className="board-body">
        <table>
          {header && (
            <thead>
              <tr>
                {header.map((cell, c) => (
                  <th key={c} style={{ textAlign: aligns[c] || 'left' }}>{cell}</th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {body.map((row, r) => (
              <tr key={r}>
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={String(cell || '').trim() ? undefined : 'dim'}
                    style={{ textAlign: aligns[c] || 'left' }}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
            {more > 0 && (
              <tr>
                <td className="more" colSpan={rows[0]?.length || 1}>
                  + {more} MORE ROWS
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
