import express from 'express'
import multer from 'multer'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import {
  ROOT,
  UPLOADS_DIR,
  OUTPUT_DIR,
  ensureDirs,
  loadProject,
  saveProject,
  sanitizeProject
} from './store.js'
import { generateBundle } from './generate.js'
import { parseSpreadsheet } from './tables.js'

const PORT = process.env.PORT || 4400

ensureDirs()

const app = express()
app.use(express.json({ limit: '1mb' }))

const MIME_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.ms-excel': '.xls',
  'text/csv': '.csv',
  'application/vnd.oasis.opendocument.spreadsheet': '.ods'
}

const IMAGE_EXTS = new Set(['.jpg', '.png'])

// Browsers are unreliable about spreadsheet MIME types; fall back to the extension.
function resolveExt(file) {
  if (MIME_EXT[file.mimetype]) return MIME_EXT[file.mimetype]
  const m = /\.(jpe?g|png|xlsx|xls|csv|ods)$/i.exec(file.originalname || '')
  if (!m) return null
  const ext = m[1].toLowerCase()
  return ext === 'jpeg' ? '.jpg' : `.${ext}`
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, crypto.randomUUID() + resolveExt(file))
})

const upload = multer({
  storage,
  limits: { fileSize: 64 * 1024 * 1024, files: 60 },
  fileFilter: (req, file, cb) => {
    if (!resolveExt(file)) {
      const err = new Error(
        `Unsupported file type: ${file.originalname || file.mimetype}. Accepted: JPG, PNG, XLSX, XLS, CSV, ODS.`
      )
      err.status = 400
      return cb(err)
    }
    cb(null, true)
  }
})

app.get('/api/project', (req, res) => {
  res.json({ project: loadProject(), meta: { outputDir: OUTPUT_DIR } })
})

app.put('/api/project', (req, res) => {
  const clean = sanitizeProject(req.body?.project)
  // Image pages need their backing file; table data lives inline (file is provenance
  // only, and may legitimately be null for tables built in the editor).
  clean.pages = clean.pages.filter((p) => p.type !== 'image' || fs.existsSync(path.join(UPLOADS_DIR, p.file)))
  for (const p of clean.pages) {
    if (p.type === 'table' && p.file && !fs.existsSync(path.join(UPLOADS_DIR, p.file))) p.file = null
  }
  saveProject(clean)
  res.json({ project: clean })
})

app.post('/api/upload', upload.array('images', 60), (req, res) => {
  const project = loadProject()

  let meta = []
  try {
    const parsed = JSON.parse(req.body?.meta || '[]')
    if (Array.isArray(parsed)) meta = parsed
  } catch {
    /* dimensions are cosmetic; ignore malformed meta */
  }

  const files = req.files || []
  if (!files.length) {
    return res.status(400).json({ error: 'No images received. Send JPG or PNG files in the "images" field.' })
  }

  const added = []
  const warnings = []
  for (const [i, f] of files.entries()) {
    const ext = path.extname(f.filename).toLowerCase()
    if (IMAGE_EXTS.has(ext)) {
      added.push({
        id: crypto.randomUUID(),
        type: 'image',
        file: f.filename,
        originalName: f.originalname || 'page',
        duration: project.settings.defaultDuration,
        width: Number.isInteger(meta[i]?.width) && meta[i].width > 0 ? meta[i].width : null,
        height: Number.isInteger(meta[i]?.height) && meta[i].height > 0 ? meta[i].height : null
      })
      continue
    }
    // Spreadsheet: one table page per non-empty sheet.
    try {
      const { tables, warnings: parseWarnings } = parseSpreadsheet(path.join(UPLOADS_DIR, f.filename), f.originalname)
      warnings.push(...parseWarnings)
      if (!tables.length) {
        warnings.push(`"${f.originalname}" contains no table data.`)
        fs.rm(path.join(UPLOADS_DIR, f.filename), { force: true }, () => {})
        continue
      }
      for (const table of tables) {
        added.push({
          id: crypto.randomUUID(),
          type: 'table',
          file: f.filename,
          originalName: f.originalname || 'table',
          duration: project.settings.defaultDuration,
          width: null,
          height: null,
          table
        })
      }
    } catch (err) {
      warnings.push(`Could not parse "${f.originalname}": ${err.message}`)
      fs.rm(path.join(UPLOADS_DIR, f.filename), { force: true }, () => {})
    }
  }

  if (!added.length) {
    return res.status(400).json({ error: warnings.join(' ') || 'Nothing usable in the upload.' })
  }

  project.pages.push(...added)
  const clean = sanitizeProject(project)
  saveProject(clean)
  res.json({ project: clean, addedIds: added.map((p) => p.id), warnings })
})

app.delete('/api/pages/:id', (req, res) => {
  const project = loadProject()
  const page = project.pages.find((p) => p.id === req.params.id)
  if (!page) return res.status(404).json({ error: 'Page not found.' })

  project.pages = project.pages.filter((p) => p.id !== page.id)
  saveProject(project)

  // Remove the backing file unless another page still references it.
  const stillUsed = page.file && project.pages.some((p) => p.file === page.file)
  if (page.file && !stillUsed) {
    fs.rm(path.join(UPLOADS_DIR, path.basename(page.file)), { force: true }, () => {})
  }
  res.json({ project })
})

app.post('/api/generate', async (req, res, next) => {
  try {
    const project = loadProject()
    if (!project.pages.length) {
      return res.status(400).json({ error: 'Nothing to generate — the deck has no pages.' })
    }
    const result = await generateBundle(project)
    res.json(result)
  } catch (err) {
    next(err)
  }
})

app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '1h' }))
app.use('/display', express.static(OUTPUT_DIR))

// In production (after `npm run build`) Express serves the editor itself.
const DIST = path.join(ROOT, 'client', 'dist')
if (fs.existsSync(path.join(DIST, 'index.html'))) {
  app.use(express.static(DIST))
  app.get(/^\/(?!api\/|uploads\/|display\/).*/, (req, res) => {
    res.sendFile(path.join(DIST, 'index.html'))
  })
}

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  const status = err instanceof multer.MulterError ? 400 : err.status || 500
  const message =
    err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
      ? 'File too large (64 MB max).'
      : err.message || 'Internal error.'
  if (status >= 500) console.error(err)
  res.status(status).json({ error: message })
})

app.listen(PORT, () => {
  const hasBuild = fs.existsSync(path.join(DIST, 'index.html'))
  console.log('')
  console.log('  PUBLIC DISPLAY — master control')
  console.log(`  api      http://localhost:${PORT}/api/project`)
  console.log(`  display  http://localhost:${PORT}/display/   (after generating)`)
  if (hasBuild) {
    console.log(`  editor   http://localhost:${PORT}/`)
  } else {
    console.log('  editor   run "npm run dev" and open http://localhost:5173/')
  }
  console.log('')
})
