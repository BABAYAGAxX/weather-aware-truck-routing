import { useState, type FormEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import type { Interval, Place, PlanRequest } from '../api'
import { fieldSx } from '../panelStyles'
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
const SPACING_SLIDE = '250ms ease'

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
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
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
        <Typography id="interval-label" variant="body2" sx={{ mb: 0.75, fontWeight: 600 }}>
          Check the weather every
        </Typography>
        <Box sx={{ position: 'relative', bgcolor: UI_COLORS.onPanel, borderRadius: '12px', p: `${SPACING_INSET}px` }}>
          {/* One pill slides under the buttons, which stay transparent. */}
          <Box
            aria-hidden
            sx={{
              position: 'absolute',
              top: SPACING_INSET,
              bottom: SPACING_INSET,
              left: SPACING_INSET,
              width: `calc((100% - ${2 * SPACING_INSET}px) / ${SPACINGS.length})`,
              borderRadius: '10px',
              bgcolor: UI_COLORS.panelDark,
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
                borderRadius: '10px',
                textTransform: 'none',
                color: 'text.primary',
                transition: `color ${SPACING_SLIDE}`,
                '&.Mui-selected, &.Mui-selected:hover': {
                  bgcolor: 'transparent',
                  color: UI_COLORS.onPanel,
                  fontWeight: 600,
                },
                '&.Mui-focusVisible': { outline: `2px solid ${UI_COLORS.panel}`, outlineOffset: 1 },
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
          bgcolor: UI_COLORS.onPanel,
          color: UI_COLORS.panel,
          '&:hover': { bgcolor: UI_COLORS.onPanel },
          '&.Mui-disabled': { bgcolor: UI_COLORS.onPanel, color: UI_COLORS.panel, boxShadow: 2 },
          '&.Mui-focusVisible': { outline: `2px solid ${UI_COLORS.onPanel}`, outlineOffset: 2 },
        }}
      >
        {loading ? 'Searching...' : 'Find routes'}
      </Button>
    </Box>
  )
}
