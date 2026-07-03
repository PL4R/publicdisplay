import fs from 'node:fs'
import * as XLSX from 'xlsx'

export const TABLE_LIMITS = {
  rows: 300,
  cols: 40,
  cellChars: 500,
  sheetsPerFile: 10
}

function cleanCell(value) {
  return String(value ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, TABLE_LIMITS.cellChars)
}

/**
 * Reduce a raw sheet to a rectangular grid of non-empty content: drop blank
 * rows, trim to the occupied column window, and only THEN apply the size caps —
 * so blank padding in the sheet's used range never eats into the row/col limits.
 */
export function normalizeRows(rawRows) {
  let rows = (Array.isArray(rawRows) ? rawRows : [])
    .map((r) => (Array.isArray(r) ? r.map(cleanCell) : []))
    .filter((r) => r.some((c) => c !== ''))
  if (!rows.length) return []

  let first = Infinity
  let last = -1
  for (const r of rows) {
    for (let i = 0; i < r.length; i++) {
      if (r[i] !== '') {
        if (i < first) first = i
        if (i > last) last = i
      }
    }
  }

  const width = Math.min(TABLE_LIMITS.cols, last - first + 1)
  return rows
    .slice(0, TABLE_LIMITS.rows)
    .map((r) => Array.from({ length: width }, (_, i) => r[first + i] ?? ''))
}

/**
 * Parse an uploaded spreadsheet (xlsx / xls / csv / ods) into table definitions,
 * one per non-empty sheet. Values arrive as formatted strings, the way the
 * spreadsheet displays them.
 */
export function parseSpreadsheet(filePath, originalName) {
  // Read the buffer ourselves: the ESM build of SheetJS has no fs wired in.
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: 'buffer', raw: false, cellHTML: false, dense: true })
  const stem = String(originalName || 'table').replace(/\.[^.]*$/, '').trim() || 'table'

  const tables = []
  const warnings = []
  const names = workbook.SheetNames
  if (names.length > TABLE_LIMITS.sheetsPerFile) {
    warnings.push(
      `"${originalName}" has ${names.length} sheets; only the first ${TABLE_LIMITS.sheetsPerFile} were imported.`
    )
  }
  for (const sheetName of names.slice(0, TABLE_LIMITS.sheetsPerFile)) {
    const sheet = workbook.Sheets[sheetName]
    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
    const rows = normalizeRows(raw)
    if (!rows.length) continue
    tables.push({
      title: names.length > 1 ? `${stem} — ${sheetName}` : stem,
      hasHeader: rows.length > 1,
      rows
    })
  }
  return { tables, warnings }
}
