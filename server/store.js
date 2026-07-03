import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SCHEME_IDS } from '../shared/board-schemes.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const ROOT = path.resolve(__dirname, '..')
export const DATA_DIR = path.join(ROOT, 'data')
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads')
export const OUTPUT_DIR = path.join(ROOT, 'output')

const PROJECT_FILE = path.join(DATA_DIR, 'project.json')

export const TRANSITIONS = ['cut', 'fade', 'slide']
export const FIT_MODES = ['contain', 'cover', 'fill']

export const LIMITS = {
  duration: { min: 1, max: 600 },
  transitionDuration: { min: 0.2, max: 5 }
}

// Only files we wrote ourselves (uuid + extension) are ever referenced.
const SAFE_IMAGE_RE = /^[a-f0-9-]+\.(jpg|jpeg|png)$/i
const SAFE_SOURCE_RE = /^[a-f0-9-]+\.(jpg|jpeg|png|xlsx|xls|csv|ods)$/i

export const TABLE_MAX = { rows: 300, cols: 40, cellChars: 500 }

export function ensureDirs() {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true })
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

export function defaultProject() {
  return {
    name: 'Untitled deck',
    settings: {
      defaultDuration: 10,
      transition: 'fade',
      transitionDuration: 0.8,
      fitMode: 'contain',
      background: '#000000'
    },
    pages: []
  }
}

function clamp(value, { min, max }, fallback) {
  // Number(null) and Number('') are 0, which would silently clamp to min.
  if (value === null || value === '') return fallback
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

function cleanString(value, fallback, maxLen) {
  if (typeof value !== 'string') return fallback
  const s = value.replace(/[\u0000-\u001f\u007f]/g, '').trim()
  return (s || fallback).slice(0, maxLen)
}

/** Normalize an untrusted table definition: rectangular string grid, capped sizes. */
function sanitizeTable(raw) {
  const t = raw && typeof raw === 'object' ? raw : {}
  let rows = (Array.isArray(t.rows) ? t.rows : [])
    .slice(0, TABLE_MAX.rows)
    .map((r) =>
      (Array.isArray(r) ? r : [])
        .slice(0, TABLE_MAX.cols)
        .map((c) => cleanString(String(c ?? ''), '', TABLE_MAX.cellChars) || '')
    )
  const width = Math.min(TABLE_MAX.cols, Math.max(1, ...rows.map((r) => r.length)))
  rows = rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''))
  return {
    title: cleanString(t.title, '', 120),
    hasHeader: t.hasHeader !== false && rows.length > 1,
    scheme: SCHEME_IDS.includes(t.scheme) ? t.scheme : 'auto',
    accent: /^#[0-9a-f]{6}$/i.test(t.accent || '') ? t.accent.toLowerCase() : null,
    rows
  }
}

// Accepts an untrusted project shape and returns a safe, normalized one.
export function sanitizeProject(raw) {
  const base = defaultProject()
  if (!raw || typeof raw !== 'object') return base

  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {}
  const settings = {
    defaultDuration: Math.round(clamp(s.defaultDuration, LIMITS.duration, base.settings.defaultDuration)),
    transition: TRANSITIONS.includes(s.transition) ? s.transition : base.settings.transition,
    transitionDuration:
      Math.round(clamp(s.transitionDuration, LIMITS.transitionDuration, base.settings.transitionDuration) * 10) / 10,
    fitMode: FIT_MODES.includes(s.fitMode) ? s.fitMode : base.settings.fitMode,
    background: /^#[0-9a-f]{6}$/i.test(s.background) ? s.background.toLowerCase() : base.settings.background
  }

  const seenIds = new Set()
  const pages = (Array.isArray(raw.pages) ? raw.pages : [])
    .filter((p) => p && typeof p === 'object')
    .map((p) => {
      const type = p.type === 'table' ? 'table' : 'image'
      const page = {
        id: typeof p.id === 'string' && p.id ? p.id.slice(0, 64) : null,
        type,
        file: typeof p.file === 'string' && p.file ? path.basename(p.file) : null,
        originalName: cleanString(p.originalName, 'page', 80),
        duration: Math.round(clamp(p.duration, LIMITS.duration, settings.defaultDuration)),
        width: Number.isInteger(p.width) && p.width > 0 ? p.width : null,
        height: Number.isInteger(p.height) && p.height > 0 ? p.height : null
      }
      if (type === 'table') page.table = sanitizeTable(p.table)
      return page
    })
    .filter((p) => {
      if (!p.id || seenIds.has(p.id)) return false
      if (p.type === 'image') {
        if (!p.file || !SAFE_IMAGE_RE.test(p.file)) return false
      } else {
        // Table pages carry their data inline; the source spreadsheet is optional provenance.
        if (p.file && !SAFE_SOURCE_RE.test(p.file)) p.file = null
        if (!p.table || !p.table.rows.length) return false
      }
      seenIds.add(p.id)
      return true
    })

  return {
    name: cleanString(raw.name, base.name, 120),
    settings,
    pages
  }
}

export function loadProject() {
  try {
    const raw = JSON.parse(fs.readFileSync(PROJECT_FILE, 'utf8'))
    return sanitizeProject(raw)
  } catch {
    return defaultProject()
  }
}

// Atomic write so a crash mid-save can't corrupt the project file.
export function saveProject(project) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const tmp = PROJECT_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(project, null, 2))
  fs.renameSync(tmp, PROJECT_FILE)
}
