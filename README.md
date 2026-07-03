# Public Display

A tiny signage platform: a native web editor that builds a **carousel of image pages**
and exports a **standalone HTML player** you copy to the small PC driving your TV.

- Upload JPG/PNG artwork as pages
- Upload XLSX / XLS / CSV / ODS — each non-empty sheet becomes a **table page**,
  rendered as a display board (auto-scaled type, header row, zebra stripes,
  numeric columns right-aligned)
- Edit table pages natively: title, header toggle, cells, add/remove rows and
  columns (✎ EDIT TABLE on the stage) — or create a blank table page from scratch
- Per-table colour schemes: Adaptive (follows the canvas background), Signal,
  Ice, Phosphor, Rose, Ivory (paper), Mono, or Custom with your own accent colour
- Drag to reorder, set per-page dwell time (seconds)
- Transition style (cut / fade / slide), image fit, background colour
- Live preview with aspect-ratio simulation (16:9, 4:3, 21:9, portrait)
- One click writes `output/` — `index.html` + `assets/` — to local disk

## Quick start

```bash
npm install
npm run dev        # editor at http://localhost:5173 (API on :4400)
```

Production style (single server on :4400 serving the built editor):

```bash
npm run build
npm start          # editor at http://localhost:4400
```

## Workflow

1. Open the editor and drop JPG/PNG images or XLSX/XLS/CSV spreadsheets anywhere
   in the window. Spreadsheets are parsed on upload (one page per sheet); table
   data then lives in the project itself and can be edited in place.
2. Drag cards in the **Programme** rail to set the play order; set each page's **dwell** time.
3. Tune transition, fit mode and background in the right panel. Use **Run Loop** to preview.
4. Hit **Generate to Disk**. The bundle lands in `output/`:

```
output/
  index.html        ← the player (no network needed, everything inline)
  assets/001-*.jpg  ← pages, numbered in play order
```

## Running on the display PC

Copy the `output/` folder over (USB stick, rsync, network share) and launch a browser
in kiosk mode pointing at it, e.g.:

```bash
chromium --kiosk --noerrdialogs --disable-session-crashed-bubble file:///path/to/output/index.html
```

Or serve it from this machine and point the display at `http://<this-host>:4400/display/`.

Player controls (handy while testing): **Space** pause/resume · **←/→** previous/next ·
**double-click** toggle fullscreen. The player asks for a screen wake-lock where the
platform allows it; disable OS screen-blanking on the display PC for good measure.

## Screen resolutions

The player is resolution-independent — it scales pages to whatever screen it wakes up
on. What you control is *how* they scale (**Canvas → fit** in the editor):

- **Contain** — whole image always visible, letterboxed with your background colour if
  the aspect ratio differs. Safe default.
- **Cover** — fills the screen edge-to-edge, cropping overflow. Best for full-bleed art.
- **Fill** — stretches exactly to the screen; can distort.

Author artwork at your TV's native aspect/resolution for best results (1920×1080 or
3840×2160 for a 16:9 TV). The editor flags anything smaller than 1080p with a
**SUB-HD** badge, and the preview stage lets you sanity-check other aspect ratios
before you export.

## Where things live

```
server/            Express API + bundle generator
client/            React editor (Vite)
data/uploads/      original uploaded images (source of truth)
data/project.json  deck configuration
output/            generated display bundle (safe to delete; regenerate any time)
```
