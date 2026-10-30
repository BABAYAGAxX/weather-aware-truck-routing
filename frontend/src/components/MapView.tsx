import { useEffect, useRef, useState } from 'react'
import Box from '@mui/material/Box'
import type { FeatureCollection } from 'geojson'
import {
  type ExpressionSpecification,
  type LngLat,
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  Popup,
  type GeoJSONSource,
  type LineLayerSpecification,
  type MapMouseEvent,
  type StyleSpecification,
  setWorkerUrl,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { HeatCell, Plan, Route } from '../api'
import { HEAT_OPACITY, RISK_COLORS, ROUTE_COLORS, UI_COLORS } from '../risk'
import HourSlider from './HourSlider'
import MapUnavailable from './MapUnavailable'
import { showCheckpointPopup, showRoutePopup } from './mapPopups'

interface Props {
  plan: Plan | null
  selectedId: string | null
  onSelect: (id: string) => void
}

// MapLibre looks for its worker file next to its own code, but Vite moves that code when bundling.
setWorkerUrl(workerUrl)

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

// One shared popup, so opening one closes the last.
// closeOnClick stays off: it would close a popup that the same click has just opened.
const popup = new Popup({ closeOnClick: false, focusAfterOpen: false })

// Used when the basemap style fails to load, so the routes still show.
const BLANK_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': UI_COLORS.mapBackground } }],
}

// The map returns hits in layer order, top first, so a checkpoint wins a click over the line under it.
const CLICKABLE_LAYERS = ['checkpoints-selected', 'checkpoints', 'route-hit']

function routesGeoJson(routes: Route[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: routes.map((route) => ({
      type: 'Feature',
      properties: { id: route.id, color: ROUTE_COLORS[route.id] },
      geometry: { type: 'LineString', coordinates: route.geometry },
    })),
  }
}

function checkpointsGeoJson(routes: Route[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: routes.flatMap((route) =>
      route.checkpoints.map((point, index) => ({
        type: 'Feature',
        properties: { routeId: route.id, index, color: RISK_COLORS[point.risk] },
        geometry: { type: 'Point', coordinates: [point.lon, point.lat] },
      })),
    ),
  }
}

function heatGeoJson({ cell_deg, cells }: Plan['heatmap']): FeatureCollection {
  const half = cell_deg / 2
  return {
    type: 'FeatureCollection',
    features: cells.map(({ lat, lon }, id) => ({
      type: 'Feature',
      id, // setFeatureState finds a square by this number
      properties: {},
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [lon - half, lat - half],
            [lon + half, lat - half],
            [lon + half, lat + half],
            [lon - half, lat + half],
            [lon - half, lat - half],
          ],
        ],
      },
    })),
  }
}

// Moving the slider rebuilds no tiles and no geometry: MapLibre recomputes the colors on the main thread and uploads them.
// Reading the hour in the layer's style instead makes it rebuild the tiles in its worker on every step.
function showHour(map: MapLibreMap, cells: HeatCell[], hour: number) {
  cells.forEach(({ risk }, id) => map.setFeatureState({ source: 'heat', id }, { risk: risk[hour] }))
}

function addLayers(map: MapLibreMap) {
  map.addSource('routes', { type: 'geojson', data: routesGeoJson([]) })
  map.addSource('checkpoints', { type: 'geojson', data: checkpointsGeoJson([]) })
  map.addSource('heat', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })

  const addLine = (id: string, paint: LineLayerSpecification['paint']) =>
    map.addLayer({ id, type: 'line', source: 'routes', layout: { 'line-cap': 'round', 'line-join': 'round' }, paint })
  const addCircles = (id: string, radius: number) =>
    map.addLayer({
      id,
      type: 'circle',
      source: 'checkpoints',
      paint: {
        'circle-color': ['get', 'color'],
        'circle-radius': radius,
        'circle-stroke-color': UI_COLORS.checkpointEdge,
        'circle-stroke-width': 1,
      },
    })

  addLine('route-lines', { 'line-color': ['get', 'color'], 'line-width': 3, 'line-opacity': 0.5 })
  addLine('route-selected', { 'line-color': ['get', 'color'], 'line-width': 5 })
  addLine('route-hit', { 'line-width': 12, 'line-opacity': 0 }) // invisible and wide, so lines are easy to click
  addCircles('checkpoints', 4)
  addCircles('checkpoints-selected', 7)

  const firstLabels = map.getStyle().layers.find((layer) => layer.type === 'symbol')?.id
  const level: ExpressionSpecification = ['coalesce', ['feature-state', 'risk'], 0] // Low until its first hour is set
  // Picks one of five values, one per risk level.
  const byLevel = (values: (string | number)[]): ExpressionSpecification =>
    ['step', level, values[0], 1, values[1], 2, values[2], 3, values[3], 4, values[4]]
  map.addLayer(
    {
      id: 'heat',
      type: 'fill',
      source: 'heat',
      paint: {
        'fill-antialias': false, // smoothed edges overlap and draw a dark grid between squares
        'fill-color': byLevel(RISK_COLORS),
        'fill-opacity': byLevel(HEAT_OPACITY),
      },
    },
    firstLabels ?? 'route-lines', // the blank fallback style has no labels
  )

  map.on('mouseenter', CLICKABLE_LAYERS, () => {
    map.getCanvas().style.cursor = 'pointer'
  })
  map.on('mouseleave', CLICKABLE_LAYERS, () => {
    map.getCanvas().style.cursor = ''
  })
}

export default function MapView({ plan, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const [map, setMap] = useState<MapLibreMap | null>(null) // stays null until the layers exist, so a plan can safely wait
  const clickedPoint = useRef<LngLat | null>(null) // where a route line was clicked, for the popup that selection opens
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let created: MapLibreMap
    try {
      created = new MapLibreMap({ container: container.current!, style: STYLE_URL, center: [-96, 38], zoom: 3.5 })
    } catch {
      // oxlint-disable-next-line react/set-state-in-effect -- only creating the map shows that it cannot be created
      setFailed(true) // the constructor throws without WebGL
      return // no map to clean up
    }
    created.addControl(new NavigationControl({ showCompass: false }))
    // 'style.load' fires before any tile is requested, so a tile error cannot land here. An error before it means
    // the style failed. The only other source is a broken worker, and then nothing can draw whichever style is used.
    const fallBack = () => created.setStyle(BLANK_STYLE, { diff: false })
    created.once('error', fallBack)
    created.once('style.load', () => {
      created.off('error', fallBack)
      addLayers(created)
      setMap(created)
    })
    return () => {
      setMap(null)
      created.remove()
    }
  }, [])

  // A new plan replaces the data in the existing sources.
  useEffect(() => {
    if (!map || !plan) return
    map.getSource<GeoJSONSource>('routes')?.setData(routesGeoJson(plan.routes))
    map.getSource<GeoJSONSource>('checkpoints')?.setData(checkpointsGeoJson(plan.routes))
    map.getSource<GeoJSONSource>('heat')?.setData(heatGeoJson(plan.heatmap))
    showHour(map, plan.heatmap.cells, 0)
    const bounds = new LngLatBounds()
    plan.routes.forEach((route) => route.geometry.forEach((point) => bounds.extend(point)))
    // The slider covers the bottom of the map, so that side needs extra room.
    map.fitBounds(bounds, { padding: { top: 60, right: 60, left: 60, bottom: 170 } })
  }, [map, plan])

  // Selecting only moves the filters on the top layers. The data stays as it is.
  useEffect(() => {
    const route = plan?.routes.find((candidate) => candidate.id === selectedId)
    if (!map || !plan || !route) return
    map.setFilter('route-selected', ['==', ['get', 'id'], route.id])
    map.setFilter('checkpoints-selected', ['==', ['get', 'routeId'], route.id])
    showRoutePopup(map, popup, plan.routes, route, clickedPoint.current)
    clickedPoint.current = null
  }, [map, plan, selectedId])

  useEffect(() => {
    if (!map || !plan) return
    const handleClick = (event: MapMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, { layers: CLICKABLE_LAYERS })
      if (features.length === 0) {
        popup.remove()
      } else if (features[0].layer.id === 'route-hit') {
        // Routes often share a road. The selected one is drawn on top there, so it wins the click.
        const ids: string[] = features.map((feature) => feature.properties.id)
        const id = ids.find((candidate) => candidate === selectedId) ?? ids[0]
        // Clicking the selected route changes no state, so no effect would reopen its popup.
        const route = plan.routes.find((candidate) => candidate.id === id)!
        if (id === selectedId) {
          showRoutePopup(map, popup, plan.routes, route, event.lngLat)
        } else {
          clickedPoint.current = event.lngLat
          onSelect(id)
        }
      } else {
        const { routeId, index } = features[0].properties
        const route = plan.routes.find((candidate) => candidate.id === routeId)!
        showCheckpointPopup(map, popup, route, route.checkpoints[index])
      }
    }
    map.on('click', handleClick)
    return () => {
      map.off('click', handleClick)
    }
  }, [map, plan, selectedId, onSelect])

  if (failed) return <MapUnavailable />

  return (
    <Box sx={{ flex: 1, display: 'flex', position: 'relative' }}>
      <Box
        ref={container}
        sx={{
          flex: 1,
          '& .maplibregl-popup-content': { typography: 'body2' },
          '& .popup-title': { display: 'flex', alignItems: 'center', gap: 1, pr: 2, mb: 0.5, fontWeight: 600 },
          '& .popup-title span': { width: 12, height: 12, borderRadius: '50%', flexShrink: 0 },
          '& dl': { display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 2, m: 0 },
          '& dt': { color: 'text.secondary' },
          '& dd': { m: 0, textAlign: 'right' },
        }}
      />
      {/* A sibling of the map box, because MapLibre owns everything inside it. */}
      <HourSlider
        plan={map ? plan : null} // no plan keeps the slider disabled until the map's layers exist to show an hour
        onHourChange={(hour) => {
          if (map && plan) showHour(map, plan.heatmap.cells, hour)
        }}
      />
    </Box>
  )
}
