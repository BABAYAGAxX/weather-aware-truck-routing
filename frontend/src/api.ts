export const API_URL: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type Interval = 'auto' | 10 | 25 | 50

export interface Place {
  label: string
  lat: number
  lon: number
}

export interface Checkpoint {
  mile: number
  lat: number
  lon: number
  eta: string
  wind_mph: number
  gust_mph: number
  rain_in_hr: number
  snow_in_hr: number
  risk: number
  cause: 'wind' | 'wind+load' | 'rain' | 'snow' | null
}

export interface Route {
  id: string
  recommended: boolean
  reason: string | null
  miles: number
  duration_s: number
  arrival: string
  no_travel_miles: number
  severe_miles: number
  high_miles: number
  average_risk: number
  geometry: [number, number][]
  checkpoints: Checkpoint[]
}

export interface HeatCell {
  lat: number
  lon: number
  risk: number[] // 49 entries, hour 0 to 48
}

export interface Plan {
  interval_miles: number
  routes: Route[]
  heatmap: { cell_deg: number; cells: HeatCell[] }
}

export interface PlanRequest {
  origin: { lat: number; lon: number }
  destination: { lat: number; lon: number }
  depart_at: string
  load_lb: number
  interval: Interval
}

// The server names fields like "load_lb: ..."; show the name a driver would use.
const FIELD_NAMES: Record<string, string> = { load_lb: 'Load', depart_at: 'Departure', interval: 'Interval' }

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, init)
  } catch (error) {
    if (init?.signal?.aborted) throw error // a cancelled request is not a failure to report
    throw new Error('Cannot reach the server. Check your connection and try again.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail: string = body?.detail ?? `The server returned an error (${response.status}).`
    throw new Error(detail.replace(/^(load_lb|depart_at|interval)\b/, (name) => FIELD_NAMES[name]))
  }
  return body as T
}

export function searchPlaces(q: string, signal: AbortSignal): Promise<Place[]> {
  return getJson<Place[]>(`${API_URL}/api/places?q=${encodeURIComponent(q)}`, { signal })
}

export function planTrip(request: PlanRequest): Promise<Plan> {
  return getJson<Plan>(`${API_URL}/api/plan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
}
