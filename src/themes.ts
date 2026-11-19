/** Theme catalog — metadata only; colours live in themes.css. */
export const THEMES = [{ id: 'kaya', label: 'Kaya', description: 'Paper, kaya wood and ink.' }] as const

export type ThemeId = (typeof THEMES)[number]['id']

export function getActiveTheme(): ThemeId {
  return 'kaya'
}

export function getTheme(id: string) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}
