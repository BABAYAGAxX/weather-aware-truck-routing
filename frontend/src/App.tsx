import { lazy, Suspense, useState } from 'react'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import LinearProgress from '@mui/material/LinearProgress'
import Typography from '@mui/material/Typography'
import { planTrip, type Plan, type PlanRequest } from './api'
import MapUnavailable from './components/MapUnavailable'
import RouteCards from './components/RouteCards'
import TripForm from './components/TripForm'
import { UI_COLORS } from './risk'

// MapLibre is large, so it downloads after the form has painted. If that fails, the form stays on the page.
const MapView = lazy(() => import('./components/MapView').catch(() => ({ default: MapUnavailable })))

export default function App() {
  const [plan, setPlan] = useState<Plan | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function search(request: PlanRequest) {
    setLoading(true)
    setError(null)
    try {
      const result = await planTrip(request)
      setPlan(result)
      setSelectedId((result.routes.find((route) => route.recommended) ?? result.routes[0]).id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, minHeight: '100vh' }}>
      <Box
        component="aside"
        sx={{
          width: { xs: '100%', md: 400 },
          flexShrink: 0,
          boxSizing: 'border-box',
          bgcolor: UI_COLORS.panel,
          borderRight: { md: `1px solid ${UI_COLORS.border}` },
          borderBottom: { xs: `1px solid ${UI_COLORS.border}`, md: 'none' },
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          gap: 3,
          overflowY: { md: 'auto' },
          maxHeight: { md: '100vh' },
        }}
      >
        <Box component="header">
          <Typography component="h1" sx={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.01em' }}>
            Weather-aware truck routing
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Compare three routes by the weather your truck will meet, hour by hour.
          </Typography>
        </Box>

        <TripForm onSubmit={search} loading={loading} />

        <Box sx={{ minHeight: 4 }}>{loading && <LinearProgress aria-label="Searching for routes" />}</Box>

        {error && <Alert severity="error">{error}</Alert>}

        {plan && (
          <RouteCards
            routes={plan.routes}
            selectedId={selectedId}
            intervalMiles={plan.interval_miles}
            onSelect={setSelectedId}
          />
        )}
      </Box>

      <Box
        component="main"
        sx={{ flex: 1, minHeight: { xs: 360, md: 'auto' }, display: 'flex', bgcolor: UI_COLORS.page }}
      >
        <Suspense fallback={<Typography color="text.secondary" sx={{ m: 'auto' }}>Loading map...</Typography>}>
          <MapView plan={plan} selectedId={selectedId} onSelect={setSelectedId} />
        </Suspense>
      </Box>
    </Box>
  )
}
