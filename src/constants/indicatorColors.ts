/**
 * Consistent color scheme for ProDoc indicators 1.1, 1.2, 2.1, 2.2.
 * Import this wherever indicator-specific colors are needed.
 */

export const INDICATOR_COLORS: Record<string, string> = {
  '1.1': '#2D5E5A', // Dark Teal     — New CCA
  '1.2': '#B34839', // Rust          — Existing CCA Strengthened
  '2.1': '#E39341', // Warm Orange   — New MPA
  '2.2': '#477A6E', // Medium Teal   — Existing MPA Strengthened
}

/** Light background variants (8% opacity) for cards/badges */
export const INDICATOR_BG: Record<string, string> = {
  '1.1': 'rgba(45, 94, 90, 0.08)',
  '1.2': 'rgba(179, 72, 57, 0.08)',
  '2.1': 'rgba(227, 147, 65, 0.08)',
  '2.2': 'rgba(71, 122, 110, 0.08)',
}

/** Border variants (20% opacity) */
export const INDICATOR_BORDER: Record<string, string> = {
  '1.1': 'rgba(45, 94, 90, 0.2)',
  '1.2': 'rgba(179, 72, 57, 0.2)',
  '2.1': 'rgba(227, 147, 65, 0.2)',
  '2.2': 'rgba(71, 122, 110, 0.2)',
}
