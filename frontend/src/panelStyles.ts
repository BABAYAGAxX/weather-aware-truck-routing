import { UI_COLORS } from './risk'

// The panel fits on an 875px-tall screen with the base gaps. A taller screen adds its spare height to the gaps,
// a little to each of the eight, so the panel fills the screen instead of leaving a blank strip at the bottom.
export const PANEL_SPACE = 'clamp(0px, calc((100vh - 875px) / 8), 12px)'

// A gap of `base` pixels plus the panel's share of the spare height.
export function panelGap(base: number): string {
  return `calc(${base}px + var(--panel-space, 0px))`
}

// Light grey rounded fields on the white panel. The ring sits outside the field, so focus is easy to see.
export const fieldSx = {
  '& .MuiFilledInput-root': {
    bgcolor: UI_COLORS.field,
    boxShadow: `inset 0 0 0 1px ${UI_COLORS.fieldEdge}`, // a shadow, not a border, so the field stays the same height
    borderRadius: '12px',
    '&:hover, &.Mui-focused': { bgcolor: UI_COLORS.field },
    '&::before, &::after': { display: 'none' },
    '&.Mui-focused': { outline: `2px solid ${UI_COLORS.ink}`, outlineOffset: 2 },
  },
  '& .MuiFilledInput-input::placeholder': { color: UI_COLORS.fieldText, opacity: 1 },
  '& .MuiInputLabel-root, & .MuiInputLabel-root.Mui-focused': { color: UI_COLORS.ink, fontWeight: 500 },
  '& .MuiInputAdornment-root .MuiTypography-root': { color: UI_COLORS.fieldText },
}
