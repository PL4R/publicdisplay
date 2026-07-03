/**
 * Board colour schemes — the single source of truth, imported by BOTH the
 * editor (client/src/components/TableBoard.jsx) and the bundle generator
 * (server/generate.js), so preview and player can never drift apart.
 *
 * A scheme picks an accent + a text base (dark text or light text) and an
 * optional full-bleed panel colour behind the board. `panel: null` lets the
 * deck's canvas background show through.
 */

const LIGHT_TEXT = {
  fg: '#f2f4f8',
  dim: 'rgba(242, 244, 248, 0.62)',
  line: 'rgba(242, 244, 248, 0.16)',
  zebra: 'rgba(242, 244, 248, 0.05)'
}

const DARK_TEXT = {
  fg: '#181b20',
  dim: 'rgba(20, 24, 30, 0.62)',
  line: 'rgba(20, 24, 30, 0.16)',
  zebra: 'rgba(20, 24, 30, 0.05)'
}

export const BOARD_SCHEMES = [
  { id: 'auto', name: 'Adaptive', accent: null, base: null, panel: null },
  { id: 'signal', name: 'Signal', accent: '#ffb424', base: 'light-text', panel: null },
  { id: 'ice', name: 'Ice', accent: '#5bc8ff', base: 'light-text', panel: '#0d1420' },
  { id: 'phosphor', name: 'Phosphor', accent: '#46e08c', base: 'light-text', panel: '#0a1410' },
  { id: 'rose', name: 'Rose', accent: '#ff6e9c', base: 'light-text', panel: '#170d13' },
  { id: 'ivory', name: 'Ivory', accent: '#9a6700', base: 'dark-text', panel: '#f2efe6' },
  { id: 'mono', name: 'Mono', accent: '#f2f4f8', base: 'light-text', panel: null },
  { id: 'custom', name: 'Custom', accent: null, base: null, panel: null }
]

export const SCHEME_IDS = BOARD_SCHEMES.map((s) => s.id)

function luminance(hexColor) {
  const hex = /^#([0-9a-f]{6})$/i.exec(hexColor || '#000000')?.[1] || '000000'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/**
 * Resolve the concrete colours for a table page.
 * @param scheme     scheme id ('auto' | preset | 'custom')
 * @param accent     custom accent hex (only used when scheme === 'custom')
 * @param background the deck's canvas background (drives 'auto'/'custom' text base)
 * @returns { fg, dim, line, zebra, accent, panel }
 */
export function resolveBoardPalette(scheme, accent, background) {
  const def = BOARD_SCHEMES.find((s) => s.id === scheme) || BOARD_SCHEMES[0]
  const onLight = luminance(def.panel || background) > 0.55

  if (def.id === 'auto' || def.id === 'custom') {
    const base = onLight ? DARK_TEXT : LIGHT_TEXT
    const autoAccent = onLight ? '#9a6700' : '#ffb424'
    const chosen = def.id === 'custom' && /^#[0-9a-f]{6}$/i.test(accent || '') ? accent : autoAccent
    return { ...base, accent: chosen, panel: null }
  }

  const base = def.base === 'dark-text' ? DARK_TEXT : LIGHT_TEXT
  return { ...base, accent: def.accent, panel: def.panel }
}

/** The dot colour shown on a scheme chip in the editor. */
export function schemeSwatchAccent(schemeDef, customAccent, background) {
  if (schemeDef.id === 'custom') return customAccent || '#ffb424'
  if (schemeDef.id === 'auto') return luminance(background) > 0.55 ? '#9a6700' : '#ffb424'
  return schemeDef.accent
}
