/**
 * Event categories with the color + glyph used for their map pins.
 * Glyphs are inline SVG paths (24x24 viewBox) so pins render as pure
 * vectors — perfectly crisp on any screen density.
 */
export const CATEGORIES = {
  bowling: {
    label: 'Bowling & Games',
    color: '#f4587a',
    glyph:
      'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm-1.5 5.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm3.75-1.25a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Zm-.75 4.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5Z'
  },
  yacht: {
    label: 'Yacht & Marine',
    color: '#38bdf8',
    glyph:
      'M4 17h16l-1.5 3h-13L4 17Zm8-14 7 11h-6V5.5L6.5 14H5L12 3Z'
  },
  golf: {
    label: 'Golf',
    color: '#2dd4a0',
    glyph:
      'M11 2v13.2a5.5 5.5 0 0 0-4 1.8c.9 1.7 2.8 3 5 3s4.1-1.3 5-3a5.5 5.5 0 0 0-4-1.8V8l6-3-8-3Z'
  },
  cinema: {
    label: 'Cinema',
    color: '#a78bfa',
    glyph:
      'M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm2 2v2h2V7H6Zm10 0v2h2V7h-2ZM6 11v2h2v-2H6Zm10 0v2h2v-2h-2ZM6 15v2h2v-2H6Zm10 0v2h2v-2h-2Z'
  },
  dining: {
    label: 'Dining & Cafés',
    color: '#fbbf6e',
    glyph:
      'M7 2v8a2 2 0 0 0 2 2v10h2V12a2 2 0 0 0 2-2V2h-2v6h-1V2H8v6H7V2Zm10 0c-1.7 0-3 2-3 5v6h2v9h2V2h-1Z'
  },
  sports: {
    label: 'Sports & Fitness',
    color: '#fb7185',
    glyph:
      'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 2c1.9 0 3.6.65 5 1.74L12 9.5 7 5.74A7.96 7.96 0 0 1 12 4Zm-8 8c0-1.9.65-3.6 1.74-5L9.5 12l-3.76 5A7.96 7.96 0 0 1 4 12Zm8 8a7.96 7.96 0 0 1-5-1.74L12 14.5l5 3.76A7.96 7.96 0 0 1 12 20Zm6.26-3L14.5 12l3.76-5A7.96 7.96 0 0 1 20 12c0 1.9-.65 3.6-1.74 5Z'
  },
  culture: {
    label: 'Culture & Majlis',
    color: '#d4af6a',
    glyph:
      'M12 2 3 8v2h18V8l-9-6ZM5 12v7H3v3h18v-3h-2v-7h-3v7h-3v-7h-2v7H8v-7H5Z'
  },
  other: {
    label: 'Other',
    color: '#94a3b8',
    glyph:
      'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm-1.5 5h3v6h-3v-6Z'
  }
}

export const CATEGORY_KEYS = Object.keys(CATEGORIES)

export function categoryOf(key) {
  return CATEGORIES[key] || CATEGORIES.other
}
