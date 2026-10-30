import { useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'
import type { Plan } from '../api'
import { formatForecastHour } from '../format'
import { HEAT_OPACITY, RISK_COLORS, RISK_LABELS } from '../risk'

interface Props {
  plan: Plan | null
  onHourChange: (hour: number) => void
}

// The hour lives here, not in MapView, so moving the slider re-renders only this small box.
export default function HourSlider({ plan, onHourChange }: Props) {
  const [hour, setHour] = useState(0)
  const [lastPlan, setLastPlan] = useState(plan)
  if (plan !== lastPlan) {
    setLastPlan(plan)
    setHour(0) // a new plan starts again at departure
  }

  // The plan has no departure field, and every route's mile 0 checkpoint is the departure time.
  const departure = plan?.routes[0].checkpoints[0].eta
  const label = departure ? formatForecastHour(departure, hour) : 'Search for a trip to see the forecast'

  return (
    <Paper
      elevation={3}
      sx={{
        position: 'absolute',
        left: 12,
        bottom: { xs: 56, lg: 36 }, // the map's credits wrap to two lines on a small map, and must stay readable
        width: 400,
        maxWidth: 'calc(100% - 24px)',
        boxSizing: 'border-box',
        px: 2.5,
        py: 1.5,
      }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {label}
      </Typography>
      <Slider
        aria-label="Forecast hour after departure"
        getAriaValueText={() => label}
        disabled={!plan}
        min={0}
        max={48}
        value={hour}
        onChange={(_, value) => {
          setHour(value)
          onHourChange(value)
        }}
        size="small"
      />
      <Box role="group" aria-label="Risk levels" sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 1 }}>
        {RISK_LABELS.map((name, level) => (
          <Box key={name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5, typography: 'caption' }}>
            <Box sx={{ width: 12, height: 12, bgcolor: RISK_COLORS[level], opacity: HEAT_OPACITY[level] }} />
            {name}
          </Box>
        ))}
      </Box>
    </Paper>
  )
}
