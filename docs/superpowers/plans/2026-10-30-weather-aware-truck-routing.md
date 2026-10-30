# Weather-Aware Truck Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A hosted React + Django app that recommends the safest truck route from weather, load and travel time, meeting every line of the brief with the least code.

**Architecture:** One synchronous request: Django calls TomTom once and Open-Meteo once, runs pure rule functions, and returns one JSON document. React draws it with MUI and MapLibre. No database.

**Tech Stack:** Django 6.1, DRF, httpx, gunicorn, pytest. React 19, TypeScript, MUI 9, MapLibre 6.16.

**Spec:** `docs/DESIGN.md` and `docs/DECISIONS.md`. Read both first.

## Global Constraints

- Every rule value comes from `docs/DECISIONS.md`. If code and doc disagree, stop and fix the doc first.
- All time math is UTC. Datetimes in the API are ISO 8601 with `Z`.
- `trips/domain/` makes no network calls and imports nothing from Django.
- Only `tomtom.py` and `weather.py` call external services.
- Risk levels are `RiskLevel` 0 to 4. Colors live only in `src/risk.ts`.
- No new dependency without approval. Backend adds only `gunicorn`. Frontend removes `@tanstack/react-query` and `@mui/icons-material`.
- Never commit `backend/.env`. The TomTom key never reaches the browser.
- `MAX_LOCATIONS = 500`, `FORECAST_DAYS = 14`, `MAX_DEPARTURE_DAYS = 10`, cache 30 minutes, `MAX_ENTRIES = 2000`.
- A line that a beginner cannot explain in two sentences must be simplified, not commented.

## Review Focus

1. A departure so far ahead that a checkpoint ETA passes the forecast: 400 with a clear message, never Low. Test in Task 6.
2. All routes contain No Travel miles: `recommended` false everywhere, UI says "No safe route". Test in Task 2, shown in Task 9.
3. 10 mi chosen on a 3,000 mi trip: 400 asking for a wider interval, and the same result whether or not the cache is warm. Test in Task 6.
4. Open-Meteo returns 429 or TomTom finds no route: a readable message and no crash. Test in Task 7.
5. Origin equals destination, or a place typed but not picked from the list: a readable message. Test in Task 7, enforced in Task 8.

---

### Task 1: Trim the scaffolds

**Files:**
- Modify: `backend/config/settings.py`, `backend/config/urls.py`, `backend/requirements.txt`, `backend/.env.example`, `frontend/package.json`, `frontend/src/main.tsx`, `.gitignore`
- Delete: `backend/config/asgi.py`, `backend/trips/apps.py`, `frontend/src/App.css`, `frontend/src/index.css`, `frontend/src/assets/*`, unused files in `frontend/public/`
- Create: `backend/Procfile`

**Interfaces:**
- Produces: `settings.TOMTOM_API_KEY`, the Django cache, `corsheaders`, `rest_framework` and `trips` as the only installed apps.

- [ ] **Step 1:** Remove admin, auth, contenttypes, sessions, messages, staticfiles, templates, password validators and the Redis branch. Set `DATABASES = {}` and add the `REST_FRAMEWORK` block that disables authentication and sets `UNAUTHENTICATED_USER = None` and JSON-only rendering. Keep `GZipMiddleware` and `corsheaders` middleware.
- [ ] **Step 2:** Set `CACHES` to LocMem with `OPTIONS: {"MAX_ENTRIES": 2000}`.
- [ ] **Step 3:** Remove `redis` and the direct `certifi` pin from `requirements.txt`, add `gunicorn`, and remove `REDIS_URL` from `.env.example`. Write `Procfile`: `web: gunicorn config.wsgi --workers 1 --threads 4 --bind 0.0.0.0:$PORT`.
- [ ] **Step 4:** `npm uninstall @tanstack/react-query @mui/icons-material`. Remove the scaffold assets and the CSS imports. Add `.claude/`, `.omc/`, `.playwright-mcp/` to the root `.gitignore`.
- [ ] **Step 5:** Run `cd backend && .venv/Scripts/python manage.py check && .venv/Scripts/python -m pytest -q`. Expected: no issues, 56 passed. If pytest-django needs a database, add a one-line in-memory sqlite entry and note why. Run `cd frontend && npm run build`. Expected: success.
- [ ] **Step 6:** Commit: `Trim Django and Vite scaffolds`.

### Task 2: Cause and recommendation rules

**Files:**
- Modify: `backend/trips/domain/risk.py`, `backend/trips/domain/ranking.py`
- Test: `backend/tests/test_risk.py`, `backend/tests/test_ranking.py`

**Interfaces:**
- Produces: `checkpoint_cause(weather: Weather, load_lb: float) -> str | None`, `resolve_interval(choice: str | int, longest_miles: float) -> int`, `heat_cell_deg(longest_miles: float) -> float`, `is_recommended(ranked: Sequence[RouteRisk]) -> bool`, `recommendation_reason(ranked: Sequence[RouteRisk]) -> str`

- [ ] **Step 1: Write failing tests.**

```python
def test_cause_names_load_when_load_raised_the_level():
    assert checkpoint_cause(Weather(50, 0, 0), 35_000) == "wind+load"
    assert checkpoint_cause(Weather(50, 0, 0), 10_000) == "wind"

def test_cause_is_worst_condition_and_none_when_low():
    assert checkpoint_cause(Weather(10, 0.6, 0), 0) == "rain"
    assert checkpoint_cause(Weather(10, 0, 2.5), 0) == "snow"
    assert checkpoint_cause(Weather(10, 0, 0), 0) is None

def test_cell_size_follows_trip_length():
    assert [heat_cell_deg(m) for m in (100, 500, 900)] == [0.25, 0.5, 1.0]

def test_resolve_interval():
    assert resolve_interval("auto", 500) == 25
    assert resolve_interval(10, 500) == 10

def test_no_recommendation_when_best_route_has_no_travel():
    assert is_recommended([route("a", no_travel=1), route("b", no_travel=5)]) is False
    assert is_recommended([route("a", severe=9)]) is True

def test_reason_names_deciding_rule_and_extra_time():
    ranked = rank_routes([route("a", high=12.5, duration=4200), route("b", high=38, duration=2640)])
    assert recommendation_reason(ranked) == "Fewest High miles (12.5 vs 38.0). 26 min slower than the fastest route."

def test_reason_when_tied_on_risk():
    ranked = rank_routes([route("a", duration=100), route("b", duration=200)])
    assert recommendation_reason(ranked) == "Equal risk, shortest travel time."

def test_reason_with_one_route():
    assert recommendation_reason([route("a")]) == "Only route found."
```

- [ ] **Step 2:** Run `pytest tests/test_risk.py tests/test_ranking.py -q`. Expected: FAIL with import errors.
- [ ] **Step 3:** Implement. `heat_cell_deg` maps `auto_interval(miles)` through `{10: 0.25, 25: 0.5, 50: 1.0}`. `recommendation_reason` walks the rank rules in order against the runner-up and stops at the first that differs. Ties between wind, rain and snow go in that order. Also add the docstring example `[0, 50, 80] -> [25, 40, 15]` to `covered_miles`, a comment that `apply_load_rules` relies on `classify_wind` handling 55 mph, and a "ignore float noise" comment on `_rank_key`.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `Add risk cause and recommendation reason`.

### Task 3: Geometry

**Files:**
- Create: `backend/trips/domain/geometry.py`
- Test: `backend/tests/test_geometry.py`

**Interfaces:**
- Produces: `Point = tuple[float, float]` (lat, lon). `cumulative_lengths(points: Sequence[Point]) -> list[float]`, `point_at_fraction(points, lengths, fraction: float) -> Point`, `elapsed_at(pairs: Sequence[tuple[float, float]], distance: float) -> float`, `snap(point: Point, step: float) -> Point`, `corridor_cells(routes: Sequence[Sequence[Point]], cell_deg: float) -> set[Point]`

- [ ] **Step 1: Write failing tests.**

```python
def test_point_at_fraction_stays_on_route_and_clamps():
    points = [(0.0, 0.0), (0.0, 1.0), (0.0, 2.0)]
    lengths = cumulative_lengths(points)
    assert point_at_fraction(points, lengths, 0.25) == pytest.approx((0.0, 0.5))
    assert point_at_fraction(points, lengths, 1.0) == (0.0, 2.0)

def test_elapsed_is_a_straight_line_between_known_pairs():
    assert elapsed_at([(0, 0), (100, 50), (300, 250)], 200) == 150
    assert elapsed_at([(0, 0), (100, 50)], 100) == 50

def test_snap_aligns_to_absolute_grid():
    assert snap((32.77, -96.79), 0.5) == (33.0, -97.0)
    assert snap((32.77, -96.79), 0.1) == (32.8, -96.8)

def test_corridor_is_route_cells_plus_one_ring():
    assert len(corridor_cells([[(10.0, 10.0)]], 1.0)) == 9
```

- [ ] **Step 2:** Run `pytest tests/test_geometry.py -q`. Expected: FAIL with import error.
- [ ] **Step 3:** Implement with `math` and `bisect` only. `snap` rounds to the step and then to 2 decimals, so keys are stable: this is what lets a 0.5 square reuse a cached 0.1 location.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `Add route geometry helpers`.

### Task 4: TomTom

**Files:**
- Create: `backend/trips/tomtom.py`
- Test: `backend/tests/test_tomtom.py`

**Interfaces:**
- Produces: `RouteData` dataclass with `points: list[Point]`, `miles: float`, `duration_s: float`, `pairs: list[tuple[float, float]]` (miles, seconds). `fetch_routes(origin: Point, destination: Point, depart_at: datetime, load_lb: float) -> list[RouteData]`. `search_places(query: str) -> list[dict]` with keys `label`, `lat`, `lon`. `RoutingError(Exception)`.

- [ ] **Step 1: Write failing tests** with a small hand-made response dict passed to a pure `parse_routes(payload: dict) -> list[RouteData]`.

```python
def test_parse_adds_start_and_end_and_drops_duplicate_offsets():
    payload = {"routes": [{
        "summary": {"lengthInMeters": 1609.34, "travelTimeInSeconds": 60},
        "legs": [{"points": [{"latitude": 1.0, "longitude": 2.0}, {"latitude": 1.1, "longitude": 2.1}]}],
        "guidance": {"instructions": [
            {"routeOffsetInMeters": 0, "travelTimeInSeconds": 0},
            {"routeOffsetInMeters": 804.67, "travelTimeInSeconds": 20},
            {"routeOffsetInMeters": 804.67, "travelTimeInSeconds": 20},
        ]},
    }]}
    route = parse_routes(payload)[0]
    assert route.miles == pytest.approx(1.0)
    assert route.pairs == [(0, 0), (pytest.approx(0.5), 20), (pytest.approx(1.0), 60)]

def test_vehicle_weight_adds_truck_and_caps_at_legal_limit():
    assert vehicle_weight_kg(10_000) == round(45_000 / 2.20462)
    assert vehicle_weight_kg(60_000) == round(80_000 / 2.20462)
```

- [ ] **Step 2:** Run `pytest tests/test_tomtom.py -q`. Expected: FAIL with import error.
- [ ] **Step 3:** Implement. Request: `travelMode=truck`, `vehicleCommercial=true`, `vehicleWeight`, `maxAlternatives=2`, `routeType=fastest`, `instructionsType=coded`, `departAt`, `timeout=15`. Search: `search/2/search/{q}.json` with `typeahead=true`, `countrySet=US`, `limit=5`, `idxSet=Geo,Str`. Raise `RoutingError` on any HTTP failure or empty `routes`, with the key never in the message.
- [ ] **Step 4:** Run the same command. Expected: PASS. Then call `fetch_routes` once live for Dallas to Atlanta and confirm 3 routes.
- [ ] **Step 5:** Commit: `Add TomTom routing and address search`.

### Task 5: Weather

**Files:**
- Create: `backend/trips/weather.py`
- Test: `backend/tests/test_weather.py`

**Interfaces:**
- Produces: `Forecast` dataclass with `start: datetime`, `wind: list[float]`, `gust: list[float]`, `rain: list[float]`, `snow: list[float]`, and `weather_at(when: datetime) -> tuple[Weather, float]` returning weather and gust for the nearest hour, raising `OutOfForecast` past either end. `get_forecasts(cells: Iterable[Point]) -> dict[Point, Forecast]`. `WeatherUnavailable(Exception)`.

- [ ] **Step 1: Write failing tests.**

```python
def forecast(hours=3):
    return Forecast(datetime(2026, 10, 30, tzinfo=UTC), [10.0] * hours, [20.0] * hours,
                    [0.0] * hours, [0.0] * hours)

def test_weather_at_uses_nearest_hour():
    f = forecast()
    f.wind[1] = 40.0
    assert f.weather_at(datetime(2026, 10, 30, 1, 29, tzinfo=UTC))[0].wind_mph == 40.0
    assert f.weather_at(datetime(2026, 10, 30, 1, 31, tzinfo=UTC))[0].wind_mph == 10.0

def test_weather_at_outside_forecast_raises():
    with pytest.raises(OutOfForecast):
        forecast().weather_at(datetime(2026, 11, 2, tzinfo=UTC))

def test_get_forecasts_only_requests_uncached_cells(monkeypatch):
    calls = []
    monkeypatch.setattr(weather, "_fetch", lambda cells: calls.append(cells) or {c: forecast() for c in cells})
    get_forecasts([(1.0, 1.0)])
    get_forecasts([(1.0, 1.0), (2.0, 2.0)])
    assert calls == [[(1.0, 1.0)], [(2.0, 2.0)]]

def test_rate_limit_raises_weather_unavailable(httpx_429):
    with pytest.raises(WeatherUnavailable):
        weather._fetch([(1.0, 1.0)])
```

`httpx_429` is a fixture patching `httpx.post` to return status 429. Clear the cache in an autouse fixture.

- [ ] **Step 2:** Run `pytest tests/test_weather.py -q`. Expected: FAIL with import error.
- [ ] **Step 3:** Implement. POST form fields: `latitude`, `longitude` (comma-joined), `hourly=wind_speed_10m,wind_gusts_10m,rain,showers,snowfall`, `wind_speed_unit=mph`, `precipitation_unit=inch`, `timezone=UTC`, `timeformat=unixtime`, `forecast_days=14`, `timeout=10`. Rain is `rain + showers`. Cache each `Forecast` under `wx:{lat}:{lon}` for 1800 seconds with `cache.get_many` and `cache.set_many`. Storing `start` per square is what keeps a square cached yesterday correct today. A single location returns an object rather than a list, so wrap it.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `Add cached Open-Meteo forecasts`.

### Task 6: Planner

**Files:**
- Create: `backend/trips/planner.py`
- Test: `backend/tests/test_planner.py`

**Interfaces:**
- Consumes: Tasks 2 to 5.
- Produces: `plan_trip(origin: Point, destination: Point, depart_at: datetime, load_lb: float, interval: str | int) -> dict` in the shape of the `POST /api/plan` response in `docs/DESIGN.md`. `IntervalTooFine(Exception)`.

- [ ] **Step 1: Write failing tests.** Patch `planner.fetch_routes` and `planner.get_forecasts` with fakes: a straight 100-mile route with pairs at 0 and 100 mi over 2 hours, and forecasts with a chosen weather.

```python
def test_checkpoint_eta_comes_from_route_time(plan):
    checkpoint = plan()["routes"][0]["checkpoints"][1]
    assert checkpoint["mile"] == 10
    assert checkpoint["eta"] == "2026-10-31T14:12:00Z"

def test_one_interval_applies_to_all_routes(plan):
    assert {len(r["checkpoints"]) for r in plan(interval=25)["routes"]} == {5}

def test_load_changes_the_outcome(plan):
    windy = Weather(50, 0, 0)
    assert plan(weather=windy, load_lb=30_000)["routes"][0]["severe_miles"] == 100
    assert plan(weather=windy, load_lb=30_001)["routes"][0]["no_travel_miles"] == 100

def test_heatmap_has_49_hours_from_departure(plan):
    assert all(len(cell["risk"]) == 49 for cell in plan()["heatmap"]["cells"])

def test_interval_refused_over_budget_whatever_is_cached(plan, long_route):
    with pytest.raises(IntervalTooFine):
        plan(routes=long_route, interval=10)

def test_time_past_forecast_is_an_error_not_low(plan):
    with pytest.raises(OutOfForecast):
        plan(forecast_hours=1)

def test_only_best_route_has_a_reason(plan):
    routes = plan()["routes"]
    assert routes[0]["reason"] and all(r["reason"] is None for r in routes[1:])
```

- [ ] **Step 2:** Run `pytest tests/test_planner.py -q`. Expected: FAIL with import error.
- [ ] **Step 3:** Implement one short top-level function with small private helpers, following steps 2 to 10 in `docs/DESIGN.md`. Keep every 10th route point for `geometry`, always including the last, rounded to 5 decimals. Route ids are `A`, `B`, `C` in TomTom's order and stay with the route after ranking. Wrap `fetch_routes` in `cache.get_or_set` for 10 minutes, keyed on origin, destination, departure and load, so changing only the interval does not call TomTom again.
- [ ] **Step 4:** Run the same command. Expected: PASS.
- [ ] **Step 5:** Commit: `Add trip planner`.

### Task 7: API

**Files:**
- Create: `backend/trips/serializers.py`, `backend/trips/views.py`
- Modify: `backend/config/urls.py`
- Test: `backend/tests/test_api.py`

**Interfaces:**
- Consumes: `plan_trip`, `search_places`, the exceptions from Tasks 4 to 6.
- Produces: `GET /api/places?q=`, `POST /api/plan`.

- [ ] **Step 1: Write failing tests** with DRF's `APIClient` and `plan_trip` patched.

```python
@pytest.mark.parametrize("change", [
    {"load_lb": 0}, {"load_lb": 80_001}, {"interval": 30},
    {"depart_at": "2020-01-01T00:00:00Z"}, {"depart_at": "2030-01-01T00:00:00Z"},
    {"destination": {"lat": 32.77, "lon": -96.79}},
])
def test_bad_input_is_400_with_a_message(client, body, change):
    response = client.post("/api/plan", {**body, **change}, format="json")
    assert response.status_code == 400

@pytest.mark.parametrize("error, status", [
    (IntervalTooFine("x"), 400), (OutOfForecast("x"), 400),
    (RoutingError("x"), 502), (WeatherUnavailable("x"), 503),
])
def test_failures_become_readable_errors(client, body, monkeypatch, error, status):
    monkeypatch.setattr(views, "plan_trip", Mock(side_effect=error))
    response = client.post("/api/plan", body, format="json")
    assert response.status_code == status and response.json()["detail"]

def test_places_needs_two_characters(client):
    assert client.get("/api/places?q=d").json() == []
```

- [ ] **Step 2:** Run `pytest tests/test_api.py -q`. Expected: FAIL with 404s.
- [ ] **Step 3:** Implement. `depart_at` may be up to 1 hour in the past, so a form left open still submits, and at most 10 days ahead. `load_lb` is from 1 to 80,000. Use DRF's `@api_view` and one `try` block mapping the four exceptions to the messages in `docs/DESIGN.md`.
- [ ] **Step 4:** Run the full suite: `pytest -q`. Expected: PASS.
- [ ] **Step 5:** Run `manage.py runserver` and POST one real Dallas to Atlanta search with `curl`. Expected: 200 with 3 routes in under 8 s, then under 1 s on repeat.
- [ ] **Step 6:** Commit: `Add plan and places API`.

### Task 8: Form and shell

**Files:**
- Create: `frontend/src/api.ts`, `frontend/src/risk.ts`, `frontend/src/components/TripForm.tsx`, `frontend/src/components/PlaceField.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/main.tsx`

**Interfaces:**
- Produces: TypeScript types matching the API (`Plan`, `Route`, `Checkpoint`, `HeatCell`, `Place`), `searchPlaces(q, signal)`, `planTrip(request)` throwing `Error` with the server's `detail`. `RISK_LABELS`, `RISK_COLORS`. `<TripForm onSubmit={...} loading={...} />`. `API_URL` from `VITE_API_URL`.

- [ ] **Step 1:** Build the shell: `CssBaseline`, a 400 px panel, and a map area, using `flexDirection: {xs: 'column', md: 'row'}`. Follow the `frontend-design` skill for type and spacing, using MUI's `sx` and no theme file.
- [ ] **Step 2:** Build `PlaceField` on MUI `Autocomplete` with a 250 ms debounce and an ignore-stale-response flag. A place counts only when picked from the list, which is how a typed-but-unpicked name is rejected.
- [ ] **Step 3:** Build `TripForm`: two `PlaceField`s, a `datetime-local` field defaulting to one hour from now, load in lb with an "lb" adornment, an Auto/10/25/50 `ToggleButtonGroup`, and a submit button. Disable submit while loading or incomplete. Convert the departure with `new Date(value).toISOString()`.
- [ ] **Step 4:** Wire `App`: `plan`, `loading`, `error`, `selectedId` state with one `useState` each, a stale-response guard, `LinearProgress` while loading, and an MUI `Alert` showing the error text.
- [ ] **Step 5:** Run `npm run build`. Expected: success. In a browser, confirm a real search returns data and a server error shows in the Alert.
- [ ] **Step 6:** Commit: `Add trip form and app shell`.

### Task 9: Route cards

**Files:**
- Create: `frontend/src/components/RouteCards.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `Route`, `RISK_COLORS`.
- Produces: `<RouteCards routes={...} selectedId={...} onSelect={...} />`

- [ ] **Step 1:** Render one card per route in order: route id with its fixed route color from `src/risk.ts`, a "Recommended" chip, `reason`, miles, duration, arrival, No Travel, Severe and High miles, average risk, and a thin bar of checkpoint risk colors weighted by position.
- [ ] **Step 2:** Show "No safe route" when no route is `recommended`, and "Only N routes found" when fewer than 3. Show the interval line, such as "Checkpoints every 25 mi".
- [ ] **Step 3:** Select the recommended route, or the first, when results arrive.
- [ ] **Step 4:** Run `npm run build`. Expected: success. Confirm the No Travel state by temporarily forcing the prop in the browser.
- [ ] **Step 5:** Commit: `Add route comparison cards`.

### Task 10: Map, routes and checkpoints

**Files:**
- Create: `frontend/src/components/MapView.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: `Plan`, `selectedId`, `RISK_COLORS`.
- Produces: `<MapView plan={...} selectedId={...} onSelect={...} />`

- [ ] **Step 1:** Create the map in `useEffect`, and call `map.remove()` on cleanup. Style: `https://tiles.openfreemap.org/styles/positron`, confirmed reachable first. On a style load error, use an inline blank style. Import with `import { Map, Popup } from 'maplibre-gl'` because this version has no default export.
- [ ] **Step 2:** One GeoJSON source for routes and one for checkpoints. Layers: route lines with a fixed color per route, a selected-route line layer on top using `setFilter`, others at 0.5 opacity, an invisible 12 px line for clicks, and checkpoint circles for all routes colored by `risk`, larger on the selected route. Use circles and popups only, as text layers need font files.
- [ ] **Step 3:** Clicking a route line or selecting a card calls `onSelect` and opens a popup with miles, duration, Severe and High miles. Clicking a checkpoint opens a popup with ETA in local time, weather values, gusts, risk label and cause. On a new plan, `fitBounds` with left padding of 400 px on desktop.
- [ ] **Step 4:** Check in a browser: all 3 routes and all checkpoints show, selecting works both ways, and no console errors appear.
- [ ] **Step 5:** Commit: `Add route map with checkpoints`.

### Task 11: Heatmap and slider

**Files:**
- Modify: `frontend/src/components/MapView.tsx`

**Interfaces:**
- Consumes: `plan.heatmap`.

- [ ] **Step 1:** Build square polygons from `cells` and `cell_deg`, with `risk` as a feature property. Low risk is faint green, never transparent. Add a fill layer below the basemap's first symbol layer, at about 0.4 opacity.
- [ ] **Step 2:** Call `map.setGlobalStateProperty('hour', hour)` before adding the layer, because the remote style does not declare it. Paint: `['step', ['at', ['global-state', 'hour'], ['get', 'risk']], ...]` using `RISK_COLORS`.
- [ ] **Step 3:** Keep `hour` state inside `MapView`, so moving the slider re-renders only it. Render an MUI `Slider` (0 to 48) on a floating `Paper` at the bottom of the map with a label such as "+6 h, Sat 8:00 PM" and a risk legend. Disable it before results.
- [ ] **Step 4:** Measure in the real app with Playwright: sweep hours 0 to 48 on the longest test route. Expected: frames under 16.7 ms on average, no source reloads, colors change. If global state fails with the remote style, use `setPaintProperty` with `['at', h, ...]`.
- [ ] **Step 5:** Commit: `Add forecast heatmap and slider`.

### Task 12: Ship

**Files:**
- Create: `backend/railway.json` only if the Procfile is not enough, `frontend/vercel.json` only if required
- Modify: `README.md`, `backend/.env.example`, `CLAUDE.md`

- [ ] **Step 1:** End-to-end check on a live build: short, medium and cross-country trips, each interval, a heavy and a light load, a 10-day departure, and 10 mi on a long trip. Compare one checkpoint's weather by hand against Open-Meteo.
- [ ] **Step 2:** Run `superpowers:requesting-code-review` on the branch and fix what it finds. Reviewers get the code, not the conclusions.
- [ ] **Step 3:** Deploy Django to Railway and the frontend to Vercel, with `TOMTOM_API_KEY`, `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS` and `VITE_API_URL`. The owner creates the accounts and approves the deploy. Confirm the service does not sleep.
- [ ] **Step 4:** Rewrite `README.md`: what it does, live link, how to run locally, how the logic works, how AI agents were used. Add a Loom outline of 5 to 10 minutes.
- [ ] **Step 5:** Commit: `Add deployment config and README`.
