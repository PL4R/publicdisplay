import { useCallback, useEffect, useRef, useState } from 'react'
import * as api from './api.js'
import TopBar from './components/TopBar.jsx'
import PageRail from './components/PageRail.jsx'
import PreviewStage from './components/PreviewStage.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'

const ACCEPTED_MIMES = [
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/vnd.oasis.opendocument.spreadsheet'
]
// Browsers often report spreadsheets as octet-stream; trust the extension too.
const ACCEPTED_EXT_RE = /\.(jpe?g|png|xlsx|xls|csv|ods)$/i
const acceptedFile = (f) => ACCEPTED_MIMES.includes(f.type) || ACCEPTED_EXT_RE.test(f.name || '')
const SAVE_DEBOUNCE_MS = 600

export default function App() {
  const [project, setProject] = useState(null)
  const [outputDir, setOutputDir] = useState('')
  const [selectedId, setSelectedId] = useState(null)
  const [saveState, setSaveState] = useState('idle') // idle | dirty | saving | saved | error
  const [saveError, setSaveError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [dragDepth, setDragDepth] = useState(0)

  const projectRef = useRef(null)
  const saveTimer = useRef(null)
  const editVersion = useRef(0)
  const uploadingRef = useRef(false)

  useEffect(() => {
    api
      .getProject()
      .then(({ project, meta }) => {
        projectRef.current = project
        setProject(project)
        setOutputDir(meta?.outputDir || '')
        setSelectedId(project.pages[0]?.id ?? null)
      })
      .catch((err) => {
        setSaveState('error')
        setSaveError(`Cannot reach the server: ${err.message}`)
      })
  }, [])

  const cancelPendingSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
  }, [])

  /** Persist the latest local state now. Returns false (and surfaces the error) on failure. */
  const flushSave = useCallback(async () => {
    cancelPendingSave()
    const snapshot = projectRef.current
    if (!snapshot) return true
    setSaveState('saving')
    try {
      await api.putProject(snapshot)
      // Only report "saved" if nothing changed while the request was in flight.
      setSaveState(projectRef.current === snapshot ? 'saved' : 'dirty')
      setSaveError('')
      if (projectRef.current !== snapshot) scheduleSave()
      return true
    } catch (err) {
      setSaveState('error')
      setSaveError(err.message)
      return false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const scheduleSave = useCallback(() => {
    setSaveState('dirty')
    cancelPendingSave()
    saveTimer.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS)
  }, [cancelPendingSave, flushSave])

  /**
   * Apply a local edit and schedule an autosave. Updaters are copy-on-write
   * (they must never mutate `prev`) — no deep clone, so typing in a large
   * table grid stays cheap.
   */
  const mutate = useCallback(
    (updater) => {
      editVersion.current += 1
      setProject((prev) => {
        if (!prev) return prev
        const next = updater(prev) || prev
        projectRef.current = next
        return next
      })
      scheduleSave()
    },
    [scheduleSave]
  )

  /**
   * Take on a server-authoritative project (upload/delete responses). If the user
   * edited anything while the request was in flight, merge the server's page
   * additions/removals into the local state instead of clobbering those edits.
   */
  const adoptServerProject = useCallback(
    (serverProject, versionAtRequest, removedIds = []) => {
      if (versionAtRequest !== undefined && versionAtRequest !== editVersion.current) {
        // Local edits happened mid-request: keep them all, drop only pages this
        // request explicitly removed, and append pages the server added.
        const local = projectRef.current
        const localIds = new Set(local.pages.map((p) => p.id))
        const removed = new Set(removedIds)
        const merged = {
          ...local,
          pages: [
            ...local.pages.filter((p) => !removed.has(p.id)),
            ...serverProject.pages.filter((p) => !localIds.has(p.id))
          ]
        }
        projectRef.current = merged
        setProject(merged)
        scheduleSave() // local state is ahead of the server again
        return
      }
      cancelPendingSave()
      projectRef.current = serverProject
      setProject(serverProject)
      setSaveState('saved')
      setSaveError('')
    },
    [cancelPendingSave, scheduleSave]
  )

  const handleUpload = useCallback(
    async (fileList) => {
      const files = Array.from(fileList || []).filter(acceptedFile)
      const rejected = Array.from(fileList || []).length - files.length
      if (!files.length) {
        setUploadError(rejected ? 'Only JPG, PNG, XLSX, XLS, CSV or ODS files are accepted.' : '')
        return
      }
      if (rejected) {
        setUploadError(`${rejected} file(s) skipped — only JPG, PNG, XLSX, XLS, CSV or ODS are accepted.`)
      }
      if (uploadingRef.current) {
        setUploadError('An upload is already running — drop the files again when it finishes.')
        return
      }
      uploadingRef.current = true
      setUploading(true)
      if (!rejected) setUploadError('')
      try {
        // Flush any local edits first so the server-merged response can't lose them.
        if (!(await flushSave())) {
          setUploadError('Upload cancelled — your latest changes could not be saved.')
          return
        }
        const versionAtRequest = editVersion.current
        const meta = await Promise.all(
          files.map((f) =>
            f.type.startsWith('image/') ? api.readImageSize(f) : Promise.resolve({ width: null, height: null })
          )
        )
        const { project: serverProject, addedIds, warnings } = await api.uploadImages(files, meta)
        adoptServerProject(serverProject, versionAtRequest)
        if (warnings?.length) setUploadError(warnings.join(' '))
        if (addedIds?.length) setSelectedId(addedIds[addedIds.length - 1])
      } catch (err) {
        setUploadError(`Upload failed: ${err.message}`)
      } finally {
        uploadingRef.current = false
        setUploading(false)
      }
    },
    [adoptServerProject, flushSave]
  )

  const handleDelete = useCallback(
    async (id) => {
      try {
        if (!(await flushSave())) {
          setUploadError('Delete cancelled — your latest changes could not be saved.')
          return
        }
        const versionAtRequest = editVersion.current
        const { project: serverProject } = await api.deletePage(id)
        adoptServerProject(serverProject, versionAtRequest, [id])
        setSelectedId((sel) => {
          if (sel !== id) return sel
          return serverProject.pages[0]?.id ?? null
        })
      } catch (err) {
        setUploadError(`Delete failed: ${err.message}`)
      }
    },
    [adoptServerProject, flushSave]
  )

  /** Create an empty table page, ready for native editing. */
  const handleAddTable = useCallback(() => {
    // crypto.randomUUID needs a secure context; over plain LAN http it's absent.
    const id = crypto.randomUUID
      ? crypto.randomUUID()
      : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    mutate((p) => ({
      ...p,
      pages: [
        ...p.pages,
        {
          id,
          type: 'table',
          file: null,
          originalName: 'blank table',
          duration: p.settings.defaultDuration,
          width: null,
          height: null,
          table: {
            title: 'New board',
            hasHeader: true,
            rows: [
              ['Column A', 'Column B', 'Column C'],
              ['', '', ''],
              ['', '', '']
            ]
          }
        }
      ]
    }))
    setSelectedId(id)
  }, [mutate])

  /** Edit a table page's data (from the stage editor). */
  const handleTableChange = useCallback(
    (id, table) =>
      mutate((p) => ({
        ...p,
        pages: p.pages.map((pg) => (pg.id === id ? { ...pg, table } : pg))
      })),
    [mutate]
  )

  /** Pre-generate guard: the export must reflect what the user sees. */
  const ensureSaved = useCallback(async () => {
    if (!(await flushSave())) {
      throw new Error('Your latest changes could not be saved — fix the save error, then generate again.')
    }
  }, [flushSave])

  // Window-level drag & drop for artwork.
  useEffect(() => {
    const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files')
    const onDragEnter = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragDepth((d) => d + 1)
    }
    const onDragOver = (e) => {
      if (hasFiles(e)) e.preventDefault()
    }
    const onDragLeave = (e) => {
      if (!hasFiles(e)) return
      setDragDepth((d) => Math.max(0, d - 1))
    }
    const onDrop = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDragDepth(0)
      handleUpload(e.dataTransfer.files)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [handleUpload])

  if (!project) {
    return (
      <div className="boot">
        <div className="boot-mark" aria-hidden="true">
          <span /><span /><span />
        </div>
        <p className="mono">ACQUIRING SIGNAL…</p>
        {saveState === 'error' && <p className="boot-error">{saveError}</p>}
      </div>
    )
  }

  const selectedPage = project.pages.find((p) => p.id === selectedId) || project.pages[0] || null

  return (
    <div className="app">
      <TopBar project={project} mutate={mutate} saveState={saveState} saveError={saveError} />
      <div className="app-body">
        <PageRail
          pages={project.pages}
          selectedId={selectedPage?.id ?? null}
          onSelect={setSelectedId}
          onReorder={(reorder) => mutate((p) => ({ ...p, pages: reorder(p.pages) }))}
          onDurationChange={(id, duration) =>
            mutate((p) => ({
              ...p,
              pages: p.pages.map((pg) => (pg.id === id ? { ...pg, duration } : pg))
            }))
          }
          onDelete={handleDelete}
          onUpload={handleUpload}
          onAddTable={handleAddTable}
          uploading={uploading}
          uploadError={uploadError}
          background={project.settings.background}
        />
        <PreviewStage
          project={project}
          selectedPage={selectedPage}
          onSelect={setSelectedId}
          onTableChange={handleTableChange}
        />
        <SettingsPanel project={project} mutate={mutate} outputDir={outputDir} onBeforeGenerate={ensureSaved} />
      </div>
      {dragDepth > 0 && (
        <div className="drop-veil" aria-hidden="true">
          <div className="drop-veil-box">
            <span className="mono">RELEASE TO LOAD ARTWORK / DATA</span>
            <span className="drop-veil-sub mono">JPG · PNG · XLSX · XLS · CSV</span>
          </div>
        </div>
      )}
    </div>
  )
}
