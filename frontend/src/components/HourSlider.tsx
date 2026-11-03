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
const THUMB_SHADOW = `0 0 0 1px ${UI_COLORS.ink}, 0 2px 6px rgba(0, 0, 0, 0.35)`

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
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.18)',
        px: 2.5,
        pt: 1.75,
        pb: 1.75,
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {plan ? 'Drag to see later hours' : 'Search for a trip to see the forecast'}
        </Typography>
        <Typography variant="body2" sx={{ fontSize: 13, fontWeight: 500, color: UI_COLORS.ink, flexShrink: 0 }}>
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
          color: UI_COLORS.ink,
          '&.Mui-disabled': { color: UI_COLORS.ink },
          '& .MuiSlider-rail': { bgcolor: UI_COLORS.sliderRail, opacity: 1 },
          '& .MuiSlider-track': { border: 0 },
          '& .MuiSlider-thumb': {
            width: 22,
            height: 22,
            border: `3px solid ${UI_COLORS.onInk}`,
            boxShadow: THUMB_SHADOW,
            '&:hover, &.Mui-focusVisible, &.Mui-active': { boxShadow: THUMB_SHADOW },
            '&.Mui-disabled': { width: 22, height: 22, bgcolor: UI_COLORS.ink },
          },
        }}
      />
      <Box aria-hidden sx={{ display: 'flex', justifyContent: 'space-between', typography: 'caption', fontSize: 11, color: UI_COLORS.fieldText }}>
        {HOUR_MARKS.map((mark) => <span key={mark}>{mark}</span>)}
      </Box>
      <Box
        role="group"
        aria-label="Risk levels"
        sx={{ display: 'flex', flexWrap: 'wrap', columnGap: 2, mt: 1, pt: 1, borderTop: `1px solid ${UI_COLORS.border}` }}
      >
        {RISK_LABELS.map((name, level) => (
          <Box key={name} sx={{ display: 'flex', alignItems: 'center', gap: 0.75, typography: 'caption', fontSize: 12 }}>
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius: '3px',
                bgcolor: RISK_COLORS[level],
                opacity: HEAT_OPACITY[level],
                boxShadow: 'inset 0 0 0 1px rgba(0, 0, 0, 0.15)',
              }}
            />
            {name}
          </Box>
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        Squares show the wider area. Route miles use checkpoints at the truck's arrival time.
      </Typography>
    </Paper>
  )
}
