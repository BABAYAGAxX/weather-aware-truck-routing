import { useState, type FormEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import type { Interval, Place, PlanRequest } from '../api'
import { fieldSx, panelGap } from '../panelStyles'
import { UI_COLORS } from '../risk'
import PlaceField from './PlaceField'

interface Props {
  departure: string
  onDepartureChange: (departure: string) => void
  onSubmit: (request: PlanRequest) => void
  loading: boolean
}

const SPACINGS: Interval[] = ['auto', 10, 25, 50]
const SPACING_INSET = 3
const SPACING_SLIDE = '300ms cubic-bezier(0.4, 0, 0.2, 1)'

export default function TripForm({ departure, onDepartureChange, onSubmit, loading }: Props) {
  const [origin, setOrigin] = useState<Place | null>(null)
  const [destination, setDestination] = useState<Place | null>(null)
  const [load, setLoad] = useState('')
  const [spacing, setSpacing] = useState<Interval>('auto')

  const loadLb = Number(load)
  const complete = origin && destination && departure && load !== '' && loadLb > 0

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!complete) return
    onSubmit({
      origin,
      destination,
      depart_at: new Date(departure).toISOString(),
      load_lb: loadLb,
      interval: spacing,
    })
  }

  return (
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: panelGap(10) }}>
      <PlaceField label="From" value={origin} onChange={setOrigin} />
      <PlaceField label="To" value={destination} onChange={setDestination} />
      {/* One row, so all three route cards fit under the form on a laptop screen. */}
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 112px', gap: 1 }}>
        <TextField
          label="Departure"
          type="datetime-local"
          variant="filled"
          size="small"
          sx={fieldSx}
          value={departure}
          onChange={(event) => onDepartureChange(event.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <TextField
          label="Load"
          type="number"
          variant="filled"
          size="small"
          sx={fieldSx}
          value={load}
          onChange={(event) => setLoad(event.target.value)}
          slotProps={{
            inputLabel: { shrink: true },
            htmlInput: { min: 1, max: 80000, 'aria-label': 'Load in pounds' },
            input: { endAdornment: <InputAdornment position="end">lb</InputAdornment> },
          }}
        />
      </Box>
      <Box>
        <Typography id="interval-label" variant="body2" sx={{ mb: 0.75, fontWeight: 500 }}>
          Check the weather every
        </Typography>
        <Box
          sx={{
            position: 'relative',
            bgcolor: UI_COLORS.field,
            boxShadow: `inset 0 0 0 1px ${UI_COLORS.fieldEdge}`,
            borderRadius: '12px',
            p: `${SPACING_INSET}px`,
          }}
        >
          {/* One pill slides under the buttons, which stay transparent. */}
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              top: SPACING_INSET,
              bottom: SPACING_INSET,
              left: SPACING_INSET,
              width: `calc((100% - ${2 * SPACING_INSET}px) / ${SPACINGS.length})`,
              borderRadius: '9px',
              bgcolor: UI_COLORS.ink,
              transform: `translateX(${SPACINGS.indexOf(spacing) * 100}%)`,
              transition: `transform ${SPACING_SLIDE}`,
              '@media (prefers-reduced-motion: reduce)': { transition: 'none' },
            }}
          />
          <ToggleButtonGroup
            exclusive
            fullWidth
            size="small"
            aria-labelledby="interval-label"
            sx={{
              position: 'relative',
              '& .MuiToggleButtonGroup-grouped': {
                border: 0,
                m: 0,
                borderRadius: '9px',
                textTransform: 'none',
                fontWeight: 400,
                color: UI_COLORS.ink,
                transition: `color ${SPACING_SLIDE}`,
                '&.Mui-selected, &.Mui-selected:hover': {
                  bgcolor: 'transparent',
                  color: UI_COLORS.onInk,
                  fontWeight: 500,
                },
                '&.Mui-focusVisible': { outline: `2px solid ${UI_COLORS.ink}`, outlineOffset: 1 },
              },
            }}
            value={spacing}
            onChange={(_, next: Interval | null) => { if (next !== null) setSpacing(next) }}
          >
            {SPACINGS.map((option) => (
              <ToggleButton key={option} value={option}>
                {option === 'auto' ? 'Auto' : `${option} mi`}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </Box>
      </Box>
      <Button
        type="submit"
        variant="contained"
        size="large"
        disabled={loading || !complete}
        sx={{
          height: 44,
          borderRadius: '24px',
          textTransform: 'none',
          fontWeight: 500,
          letterSpacing: '0.3px',
          bgcolor: UI_COLORS.ink,
          color: UI_COLORS.onInk,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
          transition: 'transform 150ms ease, box-shadow 150ms ease',
          '&:hover': { bgcolor: UI_COLORS.ink, transform: 'translateY(-1px)', boxShadow: '0 6px 16px rgba(0, 0, 0, 0.28)' },
          '&.Mui-disabled': { bgcolor: UI_COLORS.ink, color: UI_COLORS.onInk, boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)' },
          '&.Mui-focusVisible': { outline: `2px solid ${UI_COLORS.ink}`, outlineOffset: 2 },
          '@media (prefers-reduced-motion: reduce)': { transition: 'none', '&:hover': { transform: 'none' } },
        }}
      >
        {loading ? 'Searching...' : 'Find routes'}
      </Button>
    </Box>
  )
}
