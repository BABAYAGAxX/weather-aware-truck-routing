import type { LngLat, Map as MapLibreMap, Popup } from 'maplibre-gl'
import type { Checkpoint, Route } from '../api'
import { formatDuration, formatEta } from '../format'
import { CAUSE_LABELS, RISK_COLORS, RISK_LABELS, ROUTE_COLORS } from '../risk'

// Text goes in through textContent, so a server string can never become HTML.
function popupContent(title: string, color: string, rows: [string, string][]): HTMLElement {
  const box = document.createElement('div')
  const heading = document.createElement('div')
  heading.className = 'popup-title'
  const dot = document.createElement('span')
  dot.style.backgroundColor = color
  heading.append(dot, title)

  const list = document.createElement('dl')
  for (const [label, value] of rows) {
    const term = document.createElement('dt')
    term.textContent = label
    const detail = document.createElement('dd')
    detail.textContent = value
    list.append(term, detail)
  }
  box.append(heading, list)
  return box
}

export function showRoutePopup(map: MapLibreMap, popup: Popup, routes: Route[], route: Route, clicked: LngLat | null) {
  const rank = routes.indexOf(route) + 1
  const content = popupContent(`Route ${route.id}, ranked ${rank} of ${routes.length}`, ROUTE_COLORS[route.id], [
    ['Distance', `${Math.round(route.miles).toLocaleString()} mi`],
    ['Duration', formatDuration(route.duration_s)],
    [RISK_LABELS[4], `${route.no_travel_miles.toFixed(1)} mi`],
    [RISK_LABELS[3], `${route.severe_miles.toFixed(1)} mi`],
    [RISK_LABELS[2], `${route.high_miles.toFixed(1)} mi`],
    ['Average risk', `${route.average_risk.toFixed(2)} of 4`],
  ])
  // Without a click, the middle of the part on screen, so a zoomed-in map still shows the popup.
  const bounds = map.getBounds()
  const visible = route.geometry.filter((point) => bounds.contains(point))
  const points = visible.length > 0 ? visible : route.geometry
  popup.setLngLat(clicked ?? points[Math.floor(points.length / 2)]).setDOMContent(content).addTo(map)
}

export function showCheckpointPopup(map: MapLibreMap, popup: Popup, route: Route, point: Checkpoint) {
  const content = popupContent(`Route ${route.id}, mile ${Math.round(point.mile)}`, RISK_COLORS[point.risk], [
    ['ETA', formatEta(point.eta)],
    ['Wind', `${point.wind_mph.toFixed(1)} mph`],
    ['Rain', `${point.rain_in_hr.toFixed(2)} in/hr`],
    ['Snow', `${point.snow_in_hr.toFixed(2)} in/hr`],
    ['Risk', RISK_LABELS[point.risk]],
    ['Cause', point.cause ? CAUSE_LABELS[point.cause] : 'None'],
  ])
  popup.setLngLat([point.lon, point.lat]).setDOMContent(content).addTo(map)
}
