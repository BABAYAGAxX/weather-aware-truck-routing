import type { ReactNode } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Typography from '@mui/material/Typography'
import type { Route } from '../api'
import { formatDayTime, formatDuration, formatMiles } from '../format'
import { RISK_COLORS, RISK_LABELS, ROUTE_COLORS, UI_COLORS } from '../risk'

interface Props {
  routes: Route[]
  selectedId: string | null
  intervalMiles: number
  onSelect: (id: string) => void
}

const SOFT = 0.55 // the risk colors at full strength are too loud for a bar on every card

// The worst level any checkpoint reaches, as a short status for the collapsed card. Kept short so the arrival fits on one line.
function weatherStatus({ checkpoints }: Route) {
  const worst = Math.max(...checkpoints.map((point) => point.risk))
  return { worst, text: worst === 0 ? 'Clear weather' : RISK_LABELS[worst] }
}

// Like "0 mi in High, Severe or No Travel", or "25.0 mi High · 10.0 mi Severe" when there are some.
function dangerText(route: Route): string {
  const parts = [
    [2, route.high_miles],
    [3, route.severe_miles],
    [4, route.no_travel_miles],
  ].filter(([, miles]) => miles > 0)
  if (parts.length === 0) return '0 mi in High, Severe or No Travel'
  return parts.map(([risk, miles]) => `${formatMiles(miles, 1)} mi ${RISK_LABELS[risk]}`).join(' · ')
}

// One colored piece per checkpoint, as wide as the miles it covers: half the gap to each neighbor.
function RiskStrip({ route }: { route: Route }) {
  const points = route.checkpoints
  return (
    <Box
      role="img"
      aria-label="Weather along the route, from start to destination"
      sx={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', opacity: SOFT }}
    >
      {points.map((point, index) => {
        const start = index === 0 ? point.mile : (points[index - 1].mile + point.mile) / 2
        const end = index === points.length - 1 ? point.mile : (point.mile + points[index + 1].mile) / 2
        return <Box key={point.mile} sx={{ flexGrow: end - start, flexBasis: 0, bgcolor: RISK_COLORS[point.risk] }} />
      })}
    </Box>
  )
}

function Tile({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Box sx={{ bgcolor: UI_COLORS.tile, borderRadius: 2, px: 1.5, py: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 600 }}>{children}</Typography>
    </Box>
  )
}

export default function RouteCards({ routes, selectedId, intervalMiles, onSelect }: Props) {
  const anyRecommended = routes.some((route) => route.recommended)

  return (
    <Box component="section" aria-label="Route comparison" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
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
        const arrives = formatDayTime(new Date(route.arrival))
        const status = weatherStatus(route)
        return (
          <Card
            key={route.id}
            variant="outlined"
            sx={{ borderWidth: 2, borderColor: selected ? color : 'transparent', borderRadius: 3 }}
          >
            <CardActionArea
              aria-pressed={selected}
              aria-expanded={selected}
              onClick={() => onSelect(route.id)}
              sx={{ p: 1.5, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 0.75 }}
            >
              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Box component="span" aria-hidden sx={{ width: 12, height: 12, borderRadius: '50%', bgcolor: color }} />
                <Typography component="span" sx={{ fontWeight: 600 }}>
                  Route {route.id}
                </Typography>
                {route.recommended && (
                  <Chip
                    label="Recommended"
                    size="small"
                    sx={{ height: 22, fontWeight: 600, bgcolor: UI_COLORS.recommendedBg, color: UI_COLORS.recommendedText }}
                  />
                )}
                <Typography component="span" sx={{ ml: 'auto', fontSize: '1.375rem', fontWeight: 600, lineHeight: 1.2 }}>
                  {formatDuration(route.duration_s)}
                </Typography>
              </Box>

              <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography component="span" variant="body2" color="text.secondary">
                  {formatMiles(route.miles)} mi · arrives {arrives}
                </Typography>
                <Box component="span" sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 0.75, flexShrink: 0 }}>
                  <Box
                    component="span"
                    aria-hidden
                    sx={{ width: 10, height: 10, borderRadius: '2px', bgcolor: RISK_COLORS[status.worst], opacity: SOFT }}
                  />
                  <Typography
                    component="span"
                    variant="body2"
                    sx={{ color: status.worst === 0 ? UI_COLORS.recommendedText : 'text.primary' }}
                  >
                    {status.text}
                  </Typography>
                </Box>
              </Box>
            </CardActionArea>

            {/* Outside the clickable area, because a button may not hold the blocks that Collapse draws. */}
            <Collapse in={selected} unmountOnExit>
              <Box sx={{ px: 1.5, pb: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
                {route.reason && (
                  <Typography variant="body2" color="text.secondary">
                    {route.reason}
                  </Typography>
                )}
                <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                  <Tile label="Arrives">{arrives}</Tile>
                  <Tile label="Avg. risk">
                    {route.average_risk.toFixed(2)}
                    <Typography component="span" color="text.secondary">
                      {' '}/ 4
                    </Typography>
                  </Tile>
                </Box>
                <RiskStrip route={route} />
                <Typography variant="caption" color="text.secondary">
                  {dangerText(route)}
                </Typography>
                {route.nearby_risk && (
                  <Typography variant="body2" color="warning.dark">
                    Passes near {RISK_LABELS[route.nearby_risk.risk]} weather at mile {formatMiles(route.nearby_risk.mile)}.
                    Not counted in the miles above.
                  </Typography>
                )}
              </Box>
            </Collapse>
          </Card>
        )
      })}

      {routes.length < 3 && (
        <Typography variant="body2">
          Only {routes.length} {routes.length === 1 ? 'route' : 'routes'} found.
        </Typography>
      )}
      <Typography variant="body2">Checkpoints every {intervalMiles} mi</Typography>
    </Box>
  )
}
