import { useState, type FormEvent } from 'react'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import InputAdornment from '@mui/material/InputAdornment'
import TextField from '@mui/material/TextField'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import type { Interval, Place, PlanRequest } from '../api'
import PlaceField from './PlaceField'

interface Props {
  onSubmit: (request: PlanRequest) => void
  loading: boolean
}

// datetime-local wants "YYYY-MM-DDTHH:mm" in the browser's own time zone.
function localInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export default function TripForm({ onSubmit, loading }: Props) {
  const [origin, setOrigin] = useState<Place | null>(null)
  const [destination, setDestination] = useState<Place | null>(null)
  const [departure, setDeparture] = useState(() => localInputValue(new Date(Date.now() + 3_600_000)))
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
    <Box component="form" onSubmit={handleSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <PlaceField label="From" value={origin} onChange={setOrigin} />
      <PlaceField label="To" value={destination} onChange={setDestination} />
      <TextField
        label="Departure"
        type="datetime-local"
        size="small"
        value={departure}
        onChange={(event) => setDeparture(event.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      />
      <TextField
        label="Load"
        type="number"
        size="small"
        value={load}
        onChange={(event) => setLoad(event.target.value)}
        slotProps={{
          htmlInput: { min: 1, max: 80000 },
          input: { endAdornment: <InputAdornment position="end">lb</InputAdornment> },
        }}
      />
      <Box>
        <Typography id="interval-label" variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
          Check the weather every
        </Typography>
        <ToggleButtonGroup
          exclusive
          fullWidth
          size="small"
          aria-labelledby="interval-label"
          sx={{ '& .MuiToggleButton-root': { textTransform: 'none' } }}
          value={spacing}
          onChange={(_, next: Interval | null) => { if (next !== null) setSpacing(next) }}
        >
          <ToggleButton value="auto">Auto</ToggleButton>
          <ToggleButton value={10}>10 mi</ToggleButton>
          <ToggleButton value={25}>25 mi</ToggleButton>
          <ToggleButton value={50}>50 mi</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Button type="submit" variant="contained" size="large" disableElevation sx={{ textTransform: 'none' }} disabled={loading || !complete}>
        {loading ? 'Searching...' : 'Find routes'}
      </Button>
    </Box>
  )
}
