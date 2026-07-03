import { useRef, useState } from 'react'
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { resolveBoardPalette } from '../../../shared/board-schemes.js'

const DURATION_MIN = 1
const DURATION_MAX = 600

function clampDuration(value) {
  // Number('') === 0, which would silently snap an emptied field to the minimum.
  if (value === null || String(value).trim() === '') return null
  const n = Math.round(Number(value))
  if (!Number.isFinite(n)) return null
  return Math.min(DURATION_MAX, Math.max(DURATION_MIN, n))
}

/**
 * Number input that tolerates being emptied mid-edit: keeps the raw draft
 * locally, commits only parseable values, snaps back to the committed value on blur.
 */
function DurationInput({ value, onCommit, ariaLabel }) {
  const [draft, setDraft] = useState(null)
  return (
    <input
      className="duration-input mono"
      type="number"
      min={DURATION_MIN}
      max={DURATION_MAX}
      value={draft ?? value}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        const v = clampDuration(raw)
        if (v !== null) onCommit(v)
      }}
      onBlur={() => setDraft(null)}
      aria-label={ariaLabel}
    />
  )
}

function PageCard({ page, index, selected, onSelect, onDurationChange, onDelete, background }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: page.id
  })
  const [confirming, setConfirming] = useState(false)
  const confirmTimer = useRef(null)

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  const subHd = page.width && page.height && (page.width < 1920 || page.height < 1080)

  const handleDeleteClick = (e) => {
    e.stopPropagation()
    if (confirming) {
      clearTimeout(confirmTimer.current)
      setConfirming(false)
      onDelete(page.id)
    } else {
      setConfirming(true)
      confirmTimer.current = setTimeout(() => setConfirming(false), 2500)
    }
  }

  const stopDnd = {
    onPointerDown: (e) => e.stopPropagation(),
    onKeyDown: (e) => e.stopPropagation()
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`page-card${selected ? ' selected' : ''}${isDragging ? ' dragging' : ''}`}
      onClick={() => onSelect(page.id)}
      {...attributes}
      {...listeners}
    >
      <div className="page-card-head">
        <span className="page-index mono">{String(index + 1).padStart(2, '0')}</span>
        <span className="page-name" title={page.originalName}>{page.originalName}</span>
        <button
          type="button"
          className={`page-delete mono${confirming ? ' confirming' : ''}`}
          onClick={handleDeleteClick}
          {...stopDnd}
          aria-label={confirming ? `Confirm removing ${page.originalName}` : `Remove ${page.originalName}`}
        >
          {confirming ? 'SURE?' : '✕'}
        </button>
      </div>
      <div className="page-thumb">
        {page.type === 'table' ? (
          <div
            className="thumb-board"
            style={(() => {
              const pal = resolveBoardPalette(page.table.scheme, page.table.accent, background)
              return { '--thumb-accent': pal.accent, '--thumb-panel': pal.panel || '#06080b', '--thumb-fg': pal.dim }
            })()}
          >
            <table className="thumb-table mono">
              <tbody>
                {page.table.rows.slice(0, 5).map((row, r) => (
                  <tr key={r} className={page.table.hasHeader && r === 0 ? 'thumb-head' : undefined}>
                    {row.slice(0, 4).map((cell, c) => (
                      <td key={c}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <span className="badge-res mono">
              {page.table.rows.length}×{page.table.rows[0]?.length || 0} TABLE
            </span>
          </div>
        ) : (
          <>
            <img src={`/uploads/${page.file}`} alt={page.originalName} loading="lazy" draggable={false} />
            {subHd && (
              <span className="badge-subhd mono" title={`${page.width}×${page.height} — below 1920×1080`}>SUB-HD</span>
            )}
            {page.width && page.height && (
              <span className="badge-res mono">{page.width}×{page.height}</span>
            )}
          </>
        )}
      </div>
      <div className="page-card-foot" {...stopDnd} onClick={(e) => e.stopPropagation()}>
        <span className="mono duration-label">DWELL</span>
        <div className="duration-control">
          <button
            type="button"
            className="duration-step mono"
            aria-label="Decrease dwell time"
            onClick={() => onDurationChange(page.id, clampDuration(page.duration - 1) ?? DURATION_MIN)}
          >
            −
          </button>
          <DurationInput
            value={page.duration}
            onCommit={(v) => onDurationChange(page.id, v)}
            ariaLabel={`Dwell time for ${page.originalName} in seconds`}
          />
          <button
            type="button"
            className="duration-step mono"
            aria-label="Increase dwell time"
            onClick={() => onDurationChange(page.id, clampDuration(page.duration + 1) ?? DURATION_MAX)}
          >
            +
          </button>
        </div>
        <span className="mono duration-unit">SEC</span>
      </div>
    </li>
  )
}

export default function PageRail({
  pages,
  selectedId,
  onSelect,
  onReorder,
  onDurationChange,
  onDelete,
  onUpload,
  onAddTable,
  uploading,
  uploadError,
  background
}) {
  const fileInput = useRef(null)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  const handleDragEnd = ({ active, over }) => {
    if (!over || active.id === over.id) return
    onReorder((list) => {
      const ids = list.map((p) => p.id)
      return arrayMove(list, ids.indexOf(active.id), ids.indexOf(over.id))
    })
  }

  return (
    <aside className="rail">
      <div className="rail-head">
        <h2 className="mono">PROGRAMME</h2>
        <span className="mono rail-hint">DRAG TO REORDER</span>
      </div>

      {pages.length === 0 ? (
        <div className="rail-empty">
          <p className="mono">NO PAGES LOADED</p>
          <p>
            Drop images (JPG/PNG) or spreadsheets (XLSX/XLS/CSV) anywhere in this window, or use the
            loader below.
          </p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={pages.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            <ol className="page-list">
              {pages.map((page, index) => (
                <PageCard
                  key={page.id}
                  page={page}
                  index={index}
                  selected={page.id === selectedId}
                  onSelect={onSelect}
                  onDurationChange={onDurationChange}
                  onDelete={onDelete}
                  background={background}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}

      <div className="rail-foot">
        {uploadError && <p className="rail-error">{uploadError}</p>}
        <button
          type="button"
          className={`loader-button${uploading ? ' busy' : ''}`}
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
        >
          <span className="mono">{uploading ? 'LOADING…' : '+ LOAD ARTWORK / DATA'}</span>
          <span className="loader-sub mono">JPG · PNG · XLSX · XLS · CSV</span>
        </button>
        <button type="button" className="ghost-button mono" onClick={onAddTable}>
          + BLANK TABLE PAGE
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,.xlsx,.xls,.csv,.ods"
          multiple
          hidden
          onChange={(e) => {
            onUpload(e.target.files)
            e.target.value = ''
          }}
        />
      </div>
    </aside>
  )
}
