/**
 * Consistent color scheme for ProDoc indicators 1.1, 1.2, 2.1, 2.2.
 * Import this wherever indicator-specific colors are needed.
 */

export const INDICATOR_COLORS: Record<string, string> = {
  '1.1': '#059669', // Emerald  — New CCA
  '1.2': '#d97706', // Amber    — Existing CCA Strengthened
  '2.1': '#2563eb', // Blue     — New MPA
  '2.2': '#7c3aed', // Violet   — Existing MPA Strengthened
}

/** Light background variants (8% opacity) for cards/badges */
export const INDICATOR_BG: Record<string, string> = {
  '1.1': 'rgba(5, 150, 105, 0.08)',
  '1.2': 'rgba(217, 119, 6, 0.08)',
  '2.1': 'rgba(37, 99, 235, 0.08)',
  '2.2': 'rgba(124, 58, 237, 0.08)',
}

/** Border variants (20% opacity) */
export const INDICATOR_BORDER: Record<string, string> = {
  '1.1': 'rgba(5, 150, 105, 0.2)',
  '1.2': 'rgba(217, 119, 6, 0.2)',
  '2.1': 'rgba(37, 99, 235, 0.2)',
  '2.2': 'rgba(124, 58, 237, 0.2)',
}
