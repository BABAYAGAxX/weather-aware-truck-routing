import { UI_COLORS } from './risk'

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
