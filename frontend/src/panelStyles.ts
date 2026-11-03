import { UI_COLORS } from './risk'

// The panel fits on an 875px-tall screen with the base gaps. A taller screen adds its spare height to the gaps,
// a little to each of the eight, so the panel fills the screen instead of leaving a blank strip at the bottom.
export const PANEL_SPACE = 'clamp(0px, calc((100vh - 875px) / 8), 12px)'

// A gap of `base` pixels plus the panel's share of the spare height.
export function panelGap(base: number): string {
  return `calc(${base}px + var(--panel-space, 0px))`
}

// White rounded fields on the blue panel. The ring sits outside the field, so focus shows against the blue.
export const fieldSx = {
  '& .MuiFilledInput-root': {
    bgcolor: UI_COLORS.onPanel,
    borderRadius: '12px',
    '&:hover, &.Mui-focused': { bgcolor: UI_COLORS.onPanel },
    '&::before, &::after': { display: 'none' },
    '&.Mui-focused': { outline: `2px solid ${UI_COLORS.onPanel}`, outlineOffset: 2 },
  },
  '& .MuiFilledInput-input::placeholder': { opacity: 0.7 },
  '& .MuiInputLabel-root': { color: UI_COLORS.panel },
  '& .MuiInputAdornment-root .MuiTypography-root': { color: UI_COLORS.panel },
}
