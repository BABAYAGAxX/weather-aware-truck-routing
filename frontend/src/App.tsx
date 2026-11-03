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

// datetime-local wants "YYYY-MM-DDTHH:mm" in the browser's own time zone.
function localInputValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export default function App() {
  const [departure, setDeparture] = useState(() => localInputValue(new Date(Date.now() + 3_600_000)))
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
          color: UI_COLORS.onPanel,
          p: 2.25,
          display: 'flex',
          flexDirection: 'column',
          gap: 1.75,
          overflowY: { md: 'auto' },
          maxHeight: { md: '100vh' },
          scrollbarWidth: 'thin',
          scrollbarColor: `${UI_COLORS.panelDark} transparent`,
        }}
      >
        <Box component="header">
          <Typography component="h1" sx={{ fontSize: '1.375rem', fontWeight: 600, letterSpacing: '-0.01em' }}>
            Weather-aware truck routing
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            Compare three routes by the weather your truck will meet, hour by hour.
          </Typography>
        </Box>

        <TripForm departure={departure} onDepartureChange={setDeparture} onSubmit={search} loading={loading} />

        {loading && <LinearProgress color="inherit" aria-label="Searching for routes" />}

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
          <MapView plan={plan} departure={departure} selectedId={selectedId} onSelect={setSelectedId} />
        </Suspense>
      </Box>
    </Box>
  )
}
