# Design

The smallest system that meets every requirement in the brief. Rule details live in
`DECISIONS.md`. This file covers constraints and structure.

## Constraints

- Every requirement in the brief must be met. Nothing beyond it.
- The author must be able to explain every file in a 5 to 10 minute walkthrough.
- Grading: 40% logic, 40% UI, map and heatmap smoothness, 15% code quality, 5% docs.
- Job post: React + MUI, DRF, scoring logic visible in the UI, caching instincts.
- Free tiers only. Weather: 600 locations a minute, 5,000 an hour, 10,000 a day.

## What live tests showed (2026-10-30)

| Question | Result | Effect on design |
|---|---|---|
| Does TomTom always return 3 truck routes? | Yes on 13 of 14 trips, 8 to 3,556 mi. San Diego to Bangor gave 1 route, because TomTom's other route modes timed out, and the app shows "Only 1 route found" | No code to force extra routes |
| Can we get real ETAs along a route? | Yes. `instructionsType=coded` gives distance and elapsed time, 47 pairs on a 786 mi route, largest gap 206 mi | Estimate time between pairs |
| Does the route's point list match TomTom's length? | Within 0.2% on 12 routes | Position by fraction of length |
| TomTom response time | 3.9 s on a 780 mi trip, 5.9 s on 1,338 mi, 11.9 s on 2,987 mi, 19.0 s on 3,556 mi, for all routes in one call. The 6.3 s on 3,307 mi was a single-route response | One call per search, 30 s timeout |
| Open-Meteo speed | 500 points in 0.8 s, 350 points for 14 days in 2.1 s | One call per search, no async |
| How does Open-Meteo count usage? | Per location: a 750-point burst hit the limit | 550 locations a search |
| Do 14-day requests cost extra? | No: 590 locations in a minute passed | `forecast_days=14` |
| Snow units | `precipitation_unit=inch` converts correctly (4.41 cm = 1.74 in) | No manual conversion |
| Forecast gaps | 0 missing values in 240 hours for 30 points | No gap-filling logic |
| Address search | TomTom typeahead works with `countrySet=US` | Same key, same vendor |
| Slider repaint | Seattle to Miami, 163 squares, 4x CPU slowdown, keyboard sweep (6 runs, 3 for step to screen). Feature state: 0 tile reloads, 22 to 24 ms from step to screen, 2 frames over 20 ms, every hour painted in one frame. Global state: 4 tile reloads per step, 44 to 54 ms, 11 frames over 20 ms, a step could paint over more than one frame. `setPaintProperty` reloads just the same | Use feature state |
| Railway request limit | 15 minutes | A long-trip request of up to about 25 s (22.9 s end to end measured) is safe, with gunicorn set to 60 s |

## Architecture

```
Browser (React + MUI + MapLibre)          Vercel
   |  GET  /api/places?q=dall
   |  POST /api/plan
Django + DRF (2 views, no database)       Railway
   |-- trips/tomtom.py    routes and address search
   |-- trips/weather.py   hourly forecast with per-square cache
   |-- trips/planner.py   the one function that ties it together
   `-- trips/domain/      pure rules, no network calls (risk, ranking, geometry)
```

Everything happens inside one normal request. No background jobs, no database, no
websockets.

## One search, step by step

1. Check the input.
2. Call TomTom once. Get the routes: points plus (distance, elapsed time) pairs.
3. Pick one interval for all routes.
4. For each route, find each checkpoint's position and ETA.
5. List the heatmap squares around the routes.
6. If the search needs more than 550 weather locations, refuse the interval.
7. Call Open-Meteo once for every location not already cached.
8. For each checkpoint, read the forecast hour nearest its ETA and classify it.
9. For each heatmap square, classify hours 0 to 48 after departure.
10. Summarize and rank the routes, then pick the recommendation.
11. Return everything as one JSON response.

The slider never calls the server. All 49 hours are already in the browser.

## Weather budget

Measured with real TomTom routes, a 40,000 lb load, and the unique locations
`plan_trip` would send to Open-Meteo. Squares are 1 degree up to 1,500 mi and 2 degrees
above.

| Trip | Longest route | Routes | Auto (interval) | 10 mi | 25 mi | 50 mi |
|---|---|---|---|---|---|---|
| Seattle to Miami | 3,556 mi | 3 | 345 (50 mi) | 1,055, refused | 529, fits | 345 |
| LA to New York | 2,987 mi | 3 | 333 (50 mi) | 1,016, refused | 505, fits | 333 |
| San Diego to Bangor | 3,307 mi | 1 | 178 (50 mi) | 442 | 244 | 178 |
| Chicago to Denver | 1,338 mi | 3 | 219 (50 mi) | 495 | 288 | 219 |
| Dallas to Atlanta | 968 mi | 3 | 144 (50 mi) | 331 | 189 | 144 |
| Reno to Salt Lake | 780 mi | 3 | 109 (50 mi) | 244 | 140 | 109 |

Auto stays at or under 345 on all six. Two different cross-country searches inside one
minute can pass 600, so the second gets "try again in a minute". Repeating a search
within 30 minutes makes no weather calls.

## API

`GET /api/places?q=dall` returns `[{"label": "Dallas, TX", "lat": 32.77, "lon": -96.79}]`

`POST /api/plan`

```json
{
  "origin": {"lat": 32.77, "lon": -96.79},
  "destination": {"lat": 33.74, "lon": -84.38},
  "depart_at": "2026-10-31T14:00:00Z",
  "load_lb": 35000,
  "interval": "auto"
}
```

`interval` is `"auto"`, `10`, `25` or `50`. Routes come back best first.

```json
{
  "interval_miles": 50,
  "routes": [
    {
      "id": "A",
      "recommended": true,
      "reason": "Fewest High miles (12.5 vs 38.0). 26 min slower than the fastest route.",
      "miles": 786.2,
      "duration_s": 39924,
      "arrival": "2026-11-01T01:05:24Z",
      "no_travel_miles": 0,
      "severe_miles": 0,
      "high_miles": 12.5,
      "average_risk": 0.31,
      "geometry": [[-96.79, 32.77]],
      "checkpoints": [
        {
          "mile": 50, "lat": 32.5, "lon": -96.1, "eta": "2026-10-31T14:48:00Z",
          "wind_mph": 18.2, "rain_in_hr": 0.0, "snow_in_hr": 0.0,
          "risk": 0, "cause": null
        }
      ]
    }
  ],
  "heatmap": {
    "cell_deg": 0.5,
    "cells": [{"lat": 32.5, "lon": -96.5, "risk": [0, 0, 1]}]
  }
}
```

- `risk` is the level score, 0 to 4. A square's `risk` list has 49 entries.
- `cause` is `"wind"`, `"wind+load"`, `"rain"`, `"snow"`, or `null` when Low.
- `reason` is set on the first route only. `recommended` is `false` on every route
  when none is safe.
- Errors return `{"detail": "..."}`: 400 for bad input, a refused interval or a time
  outside the forecast, 502 when TomTom fails, 503 when Open-Meteo says to wait.

## Backend files

| File | Job |
|---|---|
| `trips/domain/risk.py` | Classify weather, name the cause |
| `trips/domain/ranking.py` | Spacing, summaries, ranking, recommendation |
| `trips/domain/geometry.py` | Position and ETA at a mile, heatmap squares |
| `trips/tomtom.py` | Call TomTom, return plain data |
| `trips/weather.py` | Call Open-Meteo, cache per square |
| `trips/planner.py` | Steps 2 to 10 above |
| `trips/serializers.py` | Check requests |
| `trips/views.py` | Two thin endpoints |
| `config/settings.py` | Settings from environment variables and CORS |
| `config/urls.py` | Maps `/api/plan` and `/api/places` to the views |
| `Procfile` | Starts gunicorn on Railway |

## Frontend files

| File | Job |
|---|---|
| `src/main.tsx` | Mounts the app |
| `src/App.tsx` | Layout, search and selected route state |
| `src/api.ts` | Types and fetch calls |
| `src/risk.ts` | Risk labels and the shared colors |
| `src/format.ts` | Duration and time text |
| `src/components/TripForm.tsx` | Form, including interval selector |
| `src/components/PlaceField.tsx` | Address autocomplete |
| `src/components/RouteCards.tsx` | Summaries and the why |
| `src/components/mapPopups.ts` | Route and checkpoint popups |
| `src/components/MapView.tsx` | Routes, checkpoints, heatmap |
| `src/components/MapUnavailable.tsx` | Message when the map cannot load |
| `src/components/HourSlider.tsx` | Forecast slider, its hour label, risk legend |

## Screen

- Desktop: a 400 px left panel with the form and route cards, and the map filling the
  rest. The slider floats at the bottom of the map.
- Narrow screens: the panel stacks with the map. No other mobile work.
- During a search: the button is disabled and a progress bar shows. Long trips can
  take up to about 25 s.
- Each route has one fixed color, shared by its line and its card.
- Selecting a route, by clicking its line or card, highlights it, dims the others to
  half strength and opens a popup with its summary. The recommended route is selected
  when results arrive, so a summary is on the map straight away.
- Checkpoints on all routes are circles colored by risk, larger on the selected route.
  Clicking one shows ETA, weather, risk and
  cause.

## Heatmap

Colored squares drawn as one MapLibre layer, under the place names and the routes.
Low-risk squares are faint green, so the heatmap is visible in calm weather. The
browser holds each square's 49 risk values. When the slider moves, the app gives each
square its risk for that hour as MapLibre feature state. No tiles or geometry are
rebuilt. MapLibre recomputes the colors on the main thread and uploads them to the
graphics card again, and only the small slider box re-renders in React.

A layer color that read the hour directly was tried first and measured. It worked, but
MapLibre rebuilt the tiles in its worker on every step, and a step could paint over
more than one frame. Feature state changes every square in the same frame.

Squares are used instead of a blurred heatmap because weather risk is a value at a
place, not a density of points.

If the basemap fails to load, the app uses a blank background so routes and the
heatmap still show.

## Requirement map

| Brief | Where it is met |
|---|---|
| Origin, destination, departure, load | `TripForm`, `/api/plan` |
| 3 routes via routing API | `tomtom.py` |
| Sample every 10, 25 or 50 mi at ETA | `geometry.py`, `planner.py` |
| Risk rules and load rules | `domain/risk.py` |
| Recommendation | `domain/ranking.py`, `reason` field |
| Routes, checkpoints, risk levels and ETAs on a map | `MapView` |
| Route summaries on a map | `MapView` popup, `RouteCards` beside it |
| Heatmap with 0 to 48 h slider | `MapView`, `HourSlider` |
| GitHub repo, hosted app, Loom | Repo and hosting per README, Loom video linked from README |

## Left out on purpose

Accounts, saved trips, database, background jobs, async views, Redis, driver rest
breaks, forced extra routes, wind/rain/snow heatmap layers, weather interpolation,
react-query, MUI icons, a custom theme file.
