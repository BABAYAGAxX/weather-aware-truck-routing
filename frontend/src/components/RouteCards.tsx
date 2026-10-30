import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Chip from '@mui/material/Chip'
import Typography from '@mui/material/Typography'
import type { Checkpoint, Route } from '../api'
import { formatArrival, formatDuration } from '../format'
import { RISK_COLORS, RISK_LABELS, ROUTE_COLORS, UI_COLORS } from '../risk'

interface Props {
  routes: Route[]
  selectedId: string | null
  intervalMiles: number
  onSelect: (id: string) => void
}

// Each checkpoint covers half the gap to the checkpoint before it and half the gap to the one after it.
function coveredMiles(checkpoints: Checkpoint[]): number[] {
  return checkpoints.map((point, i) => {
    const before = i > 0 ? point.mile - checkpoints[i - 1].mile : 0
    const after = i < checkpoints.length - 1 ? checkpoints[i + 1].mile - point.mile : 0
    return (before + after) / 2
  })
}

// Color alone is not enough, so the bar also gets a sentence: "Low for 80 mi, then High for 25 mi".
function describeBar(checkpoints: Checkpoint[]): string {
  const runs: { risk: number; miles: number }[] = []
  coveredMiles(checkpoints).forEach((miles, i) => {
    const last = runs[runs.length - 1]
    if (last && last.risk === checkpoints[i].risk) last.miles += miles
    else runs.push({ risk: checkpoints[i].risk, miles })
  })
  const parts = runs.map((run) => `${RISK_LABELS[run.risk]} for ${Math.round(run.miles).toLocaleString()} mi`)
  return `Risk along the route, start to finish: ${parts.join(', then ')}`
}

function RiskMiles({ risk, miles }: { risk: number; miles: number }) {
  return (
    <Box component="span" sx={{ display: 'flex', flexDirection: 'column' }}>
      <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        <Box component="span" aria-hidden sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: RISK_COLORS[risk] }} />
        <Typography component="span" variant="caption" color="text.secondary">
          {RISK_LABELS[risk]}
        </Typography>
      </Box>
      <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>
        {miles.toFixed(1)} mi
      </Typography>
    </Box>
  )
}

export default function RouteCards({ routes, selectedId, intervalMiles, onSelect }: Props) {
  const anyRecommended = routes.some((route) => route.recommended)

  return (
    <Box component="section" aria-label="Route comparison" sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {!anyRecommended && (
        <Alert severity="warning">
          <Typography component="span" sx={{ fontWeight: 600, display: 'block' }}>
            No safe route
          </Typography>
          Every route has miles where travel is not advised. They are listed from least to most risky.
        </Alert>
      )}

      {routes.map((route) => {
        const selected = route.id === selectedId
        const color = ROUTE_COLORS[route.id]
        const widths = coveredMiles(route.checkpoints)
        return (
          <Card
            key={route.id}
            variant="outlined"
            sx={{ borderWidth: 2, borderColor: selected ? color : UI_COLORS.border, borderRadius: 2 }}
          >
            <CardActionArea
              aria-pressed={selected}
              onClick={() => onSelect(route.id)}
              sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1.25 }}
            >
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box component="span" aria-hidden sx={{ width: 14, height: 14, borderRadius: '50%', bgcolor: color }} />
                <Typography component="span" sx={{ fontWeight: 600 }}>
                  Route {route.id}
                </Typography>
                {route.recommended && <Chip label="Recommended" size="small" color="success" />}
                <Typography component="span" sx={{ ml: 'auto', fontWeight: 600 }}>
                  {Math.round(route.miles).toLocaleString()} mi
                </Typography>
              </Box>

              {route.reason && (
                <Typography component="span" variant="body2" color="text.secondary">
                  {route.reason}
                </Typography>
              )}

              <Typography component="span" variant="body2">
                {formatDuration(route.duration_s)}, arrives {formatArrival(route.arrival)}
              </Typography>

              <Box component="span" sx={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1 }}>
                <RiskMiles risk={4} miles={route.no_travel_miles} />
                <RiskMiles risk={3} miles={route.severe_miles} />
                <RiskMiles risk={2} miles={route.high_miles} />
              </Box>

              <Typography component="span" variant="body2" color="text.secondary">
                Average risk {route.average_risk.toFixed(2)} of 4
              </Typography>

              <Box
                component="span"
                role="img"
                aria-label={describeBar(route.checkpoints)}
                sx={{ display: 'flex', height: 8, borderRadius: 1, overflow: 'hidden', bgcolor: UI_COLORS.border }}
              >
                {route.checkpoints.map((point, i) => (
                  <Box key={point.mile} component="span" sx={{ flex: widths[i], bgcolor: RISK_COLORS[point.risk] }} />
                ))}
              </Box>
            </CardActionArea>
          </Card>
        )
      })}

      {routes.length < 3 && (
        <Typography variant="body2" color="text.secondary">
          Only {routes.length} {routes.length === 1 ? 'route' : 'routes'} found.
        </Typography>
      )}
      <Typography variant="body2" color="text.secondary">
        Checkpoints every {intervalMiles} mi
      </Typography>
    </Box>
  )
}
