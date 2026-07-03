import fsp from 'node:fs/promises'
import path from 'node:path'
import { OUTPUT_DIR, UPLOADS_DIR } from './store.js'
import { resolveBoardPalette } from '../shared/board-schemes.js'

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// JSON destined for an inline <script>: forbid `</script>` breakouts, and escape
// U+2028/U+2029 (legal in JSON, illegal in pre-ES2019 JS string literals — an old
// TV browser would otherwise choke on the whole script).
const LINE_SEP = String.fromCharCode(0x2028)
const PARA_SEP = String.fromCharCode(0x2029)
function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .split(LINE_SEP).join('\\u2028')
    .split(PARA_SEP).join('\\u2029')
}

function assetBaseName(originalName) {
  const stem = String(originalName || 'page')
    .replace(/\.[^.]*$/, '')
    .normalize('NFKD')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 40)
  return stem || 'page'
}

/**
 * Writes a self-contained display bundle into output/:
 *   output/index.html      — the player (inline CSS/JS, no network deps)
 *   output/assets/NNN-*.jpg|png — image pages, in play order
 * Table pages travel as data inside index.html and are rendered by the player.
 * Copy the whole folder to the display PC and open index.html fullscreen.
 */
export async function generateBundle(project) {
  const assetsDir = path.join(OUTPUT_DIR, 'assets')
  // Stage first: a missing source image must not destroy the previous good bundle.
  const stagingDir = path.join(OUTPUT_DIR, '.assets-staging')
  await fsp.rm(stagingDir, { recursive: true, force: true })
  await fsp.mkdir(stagingDir, { recursive: true })

  const pages = []
  try {
    for (const [i, page] of project.pages.entries()) {
      if (page.type === 'table') {
        pages.push({
          type: 'table',
          duration: page.duration,
          title: page.table.title,
          hasHeader: page.table.hasHeader,
          rows: page.table.rows,
          // Resolved here so the player stays dumb and preview/player always agree.
          palette: resolveBoardPalette(page.table.scheme, page.table.accent, project.settings.background)
        })
        continue
      }
      const sourceFile = path.basename(page.file)
      const src = path.join(UPLOADS_DIR, sourceFile)
      const ext = path.extname(sourceFile).toLowerCase()
      const name = `${String(i + 1).padStart(3, '0')}-${assetBaseName(page.originalName)}${ext}`
      try {
        await fsp.copyFile(src, path.join(stagingDir, name))
      } catch (err) {
        const reason = err.code === 'ENOENT' ? 'its image is missing from uploads' : err.message
        const e = new Error(
          `Cannot export page ${i + 1} ("${page.originalName}") — ${reason}. The previous bundle was left untouched.`
        )
        e.status = 409
        throw e
      }
      pages.push({ type: 'image', src: `assets/${name}`, duration: page.duration })
    }
  } catch (err) {
    await fsp.rm(stagingDir, { recursive: true, force: true })
    throw err
  }

  // Every copy succeeded — swap the staged assets in.
  await fsp.rm(assetsDir, { recursive: true, force: true })
  await fsp.rename(stagingDir, assetsDir)

  const html = renderPlayer(project, pages)
  const indexPath = path.join(OUTPUT_DIR, 'index.html')
  await fsp.writeFile(indexPath, html)

  return {
    outputDir: OUTPUT_DIR,
    indexPath,
    pageCount: pages.length,
    generatedAt: new Date().toISOString()
  }
}

function renderPlayer(project, pages) {
  const { transition, transitionDuration, fitMode, background } = project.settings
  const td = transition === 'cut' ? 0 : transitionDuration

  const transitionCss =
    transition === 'slide'
      ? `.layer { transform: translateX(100%); transition: transform ${td}s cubic-bezier(0.77, 0, 0.18, 1); }
      .layer.visible { transform: translateX(0); }
      .layer.out { transform: translateX(-100%); opacity: 1; }`
      : transition === 'fade'
        ? `.layer { transition: opacity ${td}s ease; }`
        : ''

  const config = jsonForScript({
    pages,
    transition,
    transitionMs: Math.round(td * 1000)
  })

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(project.name)}</title>
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: ${background};
    }
    body { cursor: none; }
    .layer {
      position: fixed;
      inset: 0;
      opacity: 0;
      user-select: none;
    }
    .layer.visible { opacity: 1; }
    ${transitionCss}
    .layer img {
      width: 100%;
      height: 100%;
      object-fit: ${fitMode};
      display: block;
      -webkit-user-drag: none;
    }
    .board {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4vh 5vw;
      box-sizing: border-box;
      color: var(--bfg, #f2f4f8);
      background: var(--bpanel, transparent);
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      /* Explicit: the auto-fit math depends on this exact line height. */
      line-height: 1.25;
    }
    .board-title {
      font-size: 1.45em;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 0.7em;
      padding-bottom: 0.3em;
      border-bottom: 0.1em solid var(--bacc, #ffb424);
      max-width: 92vw;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .board-body { max-width: 100%; overflow: hidden; }
    .board table { border-collapse: collapse; margin: 0 auto; }
    .board th {
      font-size: 0.6em;
      font-weight: 700;
      color: var(--bacc, #ffb424);
      text-transform: uppercase;
      letter-spacing: 0.14em;
      padding: 0.5em 1em;
      border-bottom: 0.18em solid var(--bacc, #ffb424);
      white-space: nowrap;
    }
    .board td {
      padding: 0.42em 1em;
      border-bottom: 0.04em solid var(--bline, rgba(242, 244, 248, 0.16));
      font-weight: 500;
      color: var(--bfg, #f2f4f8);
    }
    .board td.dim { color: var(--bdim, rgba(242, 244, 248, 0.62)); }
    .board td.more {
      text-align: center !important;
      color: var(--bdim, rgba(242, 244, 248, 0.62));
      font-size: 0.7em;
      letter-spacing: 0.2em;
      border-bottom: none;
    }
    .board tbody tr:nth-child(even) { background: var(--bzebra, rgba(242, 244, 248, 0.05)); }
    #hud {
      position: fixed;
      right: 24px;
      bottom: 20px;
      font: 500 14px/1 ui-monospace, monospace;
      letter-spacing: 0.2em;
      color: rgba(255, 255, 255, 0.55);
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
      display: none;
    }
    #msg {
      position: fixed;
      inset: 0;
      display: none;
      align-items: center;
      justify-content: center;
      font: 600 3vmin/1.4 ui-monospace, monospace;
      letter-spacing: 0.3em;
      color: rgba(255, 255, 255, 0.4);
    }
  </style>
</head>
<body>
  <div id="layer-a" class="layer"></div>
  <div id="layer-b" class="layer"></div>
  <div id="hud">PAUSED</div>
  <div id="msg"></div>
  <script>
    'use strict';
    var CFG = ${config};

    var layers = [document.getElementById('layer-a'), document.getElementById('layer-b')];
    var hud = document.getElementById('hud');
    var msg = document.getElementById('msg');
    var pages = CFG.pages;
    var front = 0;          // index into layers[] of the visible element
    var idx = -1;           // index into pages[] of the visible page
    var timer = 0;
    var paused = false;
    var remaining = 0;      // ms left on the current page when paused
    var shownAt = 0;
    var advancing = false;
    var cache = new Map();

    function showMessage(text) {
      msg.textContent = text;
      msg.style.display = 'flex';
    }

    function preloadOnce(src) {
      if (!cache.has(src)) {
        cache.set(src, new Promise(function (resolve, reject) {
          var im = new Image();
          im.onload = function () { resolve(im); };
          im.onerror = function () {
            cache.delete(src); // allow retries on a later loop pass
            reject(new Error('failed: ' + src));
          };
          im.src = src;
        }));
      }
      return cache.get(src);
    }

    function pageReady(page) {
      return page.type === 'image' ? preloadOnce(page.src) : Promise.resolve();
    }

    function isNumericCell(s) {
      var v = String(s || '').trim();
      if (!v) return false;
      // Plain numbers or grouped thousands, optional currency/percent — but NOT
      // dotted dates (two separators) or spaced phone numbers (non-3-digit groups).
      return /^[-+(]?[$\\u20ac\\u00a3]?\\d{1,3}([,\\s]\\d{3})*([.,]\\d+)?\\s*%?\\)?$/.test(v) ||
        /^[-+(]?[$\\u20ac\\u00a3]?\\d+([.,]\\d+)?\\s*%?\\)?$/.test(v);
    }

    function columnAlignments(rows, hasHeader) {
      var body = hasHeader ? rows.slice(1) : rows;
      if (!body.length || !rows.length) return [];
      var width = rows[0].length;
      var aligns = [];
      for (var c = 0; c < width; c++) {
        var filled = 0, numeric = 0;
        for (var r = 0; r < body.length; r++) {
          var v = String(body[r][c] || '').trim();
          if (!v) continue;
          filled += 1;
          if (isNumericCell(v)) numeric += 1;
        }
        aligns.push(filled > 0 && numeric / filled >= 0.7 ? 'right' : 'left');
      }
      return aligns;
    }

    // Build the display board DOM. textContent everywhere: spreadsheet cells are
    // untrusted and must never become markup.
    function buildBoard(page) {
      var board = document.createElement('div');
      board.className = 'board';
      var pal = page.palette || {};
      if (pal.fg) board.style.setProperty('--bfg', pal.fg);
      if (pal.dim) board.style.setProperty('--bdim', pal.dim);
      if (pal.line) board.style.setProperty('--bline', pal.line);
      if (pal.zebra) board.style.setProperty('--bzebra', pal.zebra);
      if (pal.accent) board.style.setProperty('--bacc', pal.accent);
      if (pal.panel) board.style.setProperty('--bpanel', pal.panel);
      var rows = page.rows || [];
      var hasHeader = !!page.hasHeader && rows.length > 1;
      var aligns = columnAlignments(rows, hasHeader);
      var bodyRows = hasHeader ? rows.slice(1) : rows;

      // Honest auto-fit: a body row costs ~2.13x the font size (1.25 line-height
      // + 0.84em padding + border), the header ~1.93x, the title ~3.4x. 88vh of
      // usable height. Rows that cannot fit at the minimum size are cut and
      // announced with a "+N more rows" line instead of silently clipping.
      var ROW_COST = 2.13, HEADER_COST = 1.93, TITLE_COST = 3.4;
      var AVAIL = 88, MIN_FS = 1.4, MAX_FS = 5.2;
      var fixedCost = (hasHeader ? HEADER_COST : 0) + (page.title ? TITLE_COST : 0);
      var capacity = Math.max(1, Math.floor((AVAIL / MIN_FS - fixedCost) / ROW_COST));
      var moreCount = 0;
      if (bodyRows.length > capacity) {
        bodyRows = bodyRows.slice(0, Math.max(1, capacity - 1));
        moreCount = (hasHeader ? rows.length - 1 : rows.length) - bodyRows.length;
      }
      var units = fixedCost + (bodyRows.length + (moreCount ? 1 : 0)) * ROW_COST;
      board.style.fontSize = Math.max(MIN_FS, Math.min(MAX_FS, AVAIL / Math.max(1, units))) + 'vh';

      if (page.title) {
        var t = document.createElement('div');
        t.className = 'board-title';
        t.textContent = page.title;
        board.appendChild(t);
      }
      var wrap = document.createElement('div');
      wrap.className = 'board-body';
      var table = document.createElement('table');
      if (hasHeader) {
        var thead = document.createElement('thead');
        var htr = document.createElement('tr');
        rows[0].forEach(function (cell, c) {
          var th = document.createElement('th');
          th.textContent = cell;
          th.style.textAlign = aligns[c] || 'left';
          htr.appendChild(th);
        });
        thead.appendChild(htr);
        table.appendChild(thead);
      }
      var tbody = document.createElement('tbody');
      bodyRows.forEach(function (row) {
        var tr = document.createElement('tr');
        row.forEach(function (cell, c) {
          var td = document.createElement('td');
          td.textContent = cell;
          if (!String(cell || '').trim()) td.className = 'dim';
          td.style.textAlign = aligns[c] || 'left';
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      if (moreCount) {
        var moreTr = document.createElement('tr');
        var moreTd = document.createElement('td');
        moreTd.className = 'more';
        moreTd.colSpan = (rows[0] || ['']).length;
        moreTd.textContent = '+ ' + moreCount + ' MORE ROWS';
        moreTr.appendChild(moreTd);
        tbody.appendChild(moreTr);
      }
      table.appendChild(tbody);
      wrap.appendChild(table);
      board.appendChild(wrap);
      return board;
    }

    function setLayerContent(el, page) {
      el.textContent = '';
      if (page.type === 'image') {
        var img = document.createElement('img');
        img.alt = '';
        img.draggable = false;
        img.src = page.src;
        el.appendChild(img);
      } else {
        el.appendChild(buildBoard(page));
      }
    }

    // Reset a layer to its off-screen start state with transitions disabled,
    // so re-entering (slide from right / fade from 0) never animates backwards.
    function resetLayer(el) {
      el.style.transition = 'none';
      el.classList.remove('visible', 'out');
      void el.offsetWidth; // flush styles
      el.style.transition = '';
    }

    function schedule(ms) {
      clearTimeout(timer);
      shownAt = performance.now();
      remaining = ms;
      timer = setTimeout(function () { advance(1); }, ms);
    }

    function show(i) {
      var page = pages[i];
      var inEl = layers[1 - front];
      var outEl = layers[front];
      resetLayer(inEl);
      setLayerContent(inEl, page);
      inEl.classList.add('visible');
      outEl.classList.remove('visible');
      outEl.classList.add('out');
      front = 1 - front;
      idx = i;
      if (!paused && pages.length > 1) {
        schedule(page.duration * 1000 + CFG.transitionMs);
      } else if (paused) {
        // Navigated while paused: resume should grant THIS page its full dwell.
        shownAt = performance.now();
        remaining = page.duration * 1000 + CFG.transitionMs;
      }
    }

    function advance(step) {
      if (advancing) return;
      if (!pages.length) { showMessage('NO PAGES'); return; }
      advancing = true;
      var attempts = 0;
      var i = idx < 0 ? (step > 0 ? -1 : 0) : idx;
      function tryNext() {
        if (attempts >= pages.length) {
          advancing = false;
          showMessage('NO DISPLAYABLE PAGES — RETRYING');
          clearTimeout(timer);
          timer = setTimeout(function () { advance(step); }, 5000);
          return;
        }
        attempts += 1;
        i = ((i + step) % pages.length + pages.length) % pages.length;
        pageReady(pages[i]).then(
          function () {
            msg.style.display = 'none';
            show(i);
            advancing = false;
          },
          function () { tryNext(); }
        );
      }
      tryNext();
    }

    function pause() {
      paused = true;
      clearTimeout(timer);
      remaining = Math.max(0, remaining - (performance.now() - shownAt));
      hud.style.display = 'block';
    }

    function resume() {
      paused = false;
      hud.style.display = 'none';
      if (pages.length > 1) schedule(Math.max(250, remaining));
    }

    document.addEventListener('keydown', function (e) {
      if (e.key === ' ') { e.preventDefault(); paused ? resume() : pause(); }
      else if (e.key === 'ArrowRight') { clearTimeout(timer); advance(1); }
      else if (e.key === 'ArrowLeft') { clearTimeout(timer); advance(-1); }
    });

    document.addEventListener('dblclick', function () {
      if (document.fullscreenElement) { document.exitFullscreen(); }
      else { document.documentElement.requestFullscreen().catch(function () {}); }
    });

    // Keep the screen awake where the platform allows it (https or localhost).
    function requestWakeLock() {
      if (navigator.wakeLock && navigator.wakeLock.request) {
        navigator.wakeLock.request('screen').catch(function () {});
      }
    }
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) requestWakeLock();
    });
    requestWakeLock();

    // Warm the image cache in the background, then start the loop.
    pages.forEach(function (p) { if (p.type === 'image') preloadOnce(p.src).catch(function () {}); });
    advance(1);
  </script>
</body>
</html>
`
}
