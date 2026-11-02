import { useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Slider from '@mui/material/Slider'
import Typography from '@mui/material/Typography'
import type { Plan } from '../api'
import { formatForecastHour } from '../format'
import { HEAT_OPACITY, RISK_COLORS, RISK_LABELS, UI_COLORS } from '../risk'

interface Props {
  plan: Plan | null
  departure: string
  onHourChange: (hour: number) => void
}

const HOUR_MARKS = ['Depart', '+12h', '+24h', '+36h', '+48h']

// The hour lives here, not in MapView, so moving the slider re-renders only this small box.
export default function HourSlider({ plan, departure, onHourChange }: Props) {
  const [hour, setHour] = useState(0)
  const [lastPlan, setLastPlan] = useState(plan)
  if (plan !== lastPlan) {
    setLastPlan(plan)
    setHour(0) // a new plan starts again at departure
  }

  // The plan has no departure field, and every route's mile 0 checkpoint is the departure time.
  const label = formatForecastHour(plan?.routes[0].checkpoints[0].eta ?? departure, hour)

  return (
    <Paper
      elevation={3}
      sx={{
        position: 'absolute',
        left: 12,
        bottom: { xs: 56, xl: 12 }, // the map's credits wrap to two lines on a small map, and must stay readable
        width: 440,
        maxWidth: 'calc(100% - 24px)',
        boxSizing: 'border-box',
        borderRadius: 2,
        px: 2.5,
        pt: 1.75,
        pb: 1.5,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {plan ? 'Drag to see later hours' : 'Search for a trip to see the forecast'}
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 500, color: UI_COLORS.panel, flexShrink: 0 }}>
          {label}
        </Typography>
      </Box>
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
        sx={{
          display: 'block',
          height: 8,
          color: UI_COLORS.panel,
          '&.Mui-disabled': { color: UI_COLORS.panel },
          '& .MuiSlider-rail': { bgcolor: UI_COLORS.sliderRail, opacity: 1 },
          '& .MuiSlider-track': { border: 0 },
          '& .MuiSlider-thumb': {
            width: 20,
            height: 20,
            border: `2px solid ${UI_COLORS.onPanel}`,
            boxShadow: `0 0 0 2px ${UI_COLORS.panel}`,
            '&.Mui-disabled': { width: 20, height: 20, bgcolor: UI_COLORS.panel },
          },
        }}
      />
      <Box aria-hidden sx={{ display: 'flex', justifyContent: 'space-between', typography: 'caption', color: 'text.secondary' }}>
        {HOUR_MARKS.map((mark) => <span key={mark}>{mark}</span>)}
      </Box>
      <Box
        role="group"
        aria-label="Risk levels"
        sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, mt: 1, pt: 1, borderTop: `1px solid ${UI_COLORS.border}` }}
      >
        {RISK_LABELS.map((name, level) => (
          <Box key={name} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, typography: 'caption' }}>
            <Box sx={{ width: 12, height: 12, borderRadius: '3px', bgcolor: RISK_COLORS[level], opacity: HEAT_OPACITY[level] }} />
            {name}
          </Box>
        ))}
      </Box>
    </Paper>
  )
}
