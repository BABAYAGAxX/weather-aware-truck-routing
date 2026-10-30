# Weather-Aware Truck Routing

You enter an origin, a destination, a departure time and a load weight. The app asks
TomTom for up to three truck routes, checks the weather your truck will meet at each
checkpoint (using the time the truck should actually be there), and recommends the safest
route. Everything is drawn on a map, with a heatmap and a 0 to 48 hour forecast slider.

**Live app:** TBD after deployment

## Run it locally

You need Python 3.12, Node.js, and a free [TomTom developer key](https://developer.tomtom.com/).
Open-Meteo (the weather source) needs no key. Use two terminals.

**Backend**, from the `backend` folder:

```
python -m venv .venv
.venv\Scripts\activate          # Windows (in PowerShell: .venv\Scripts\Activate.ps1)
source .venv/bin/activate       # macOS
pip install -r requirements.txt
copy .env.example .env          # Windows
cp .env.example .env            # macOS
```

Open `backend/.env` and paste your key after `TOMTOM_API_KEY=`. Also put any long random
text after `DJANGO_SECRET_KEY=`. Never commit this file. Then:

```
python manage.py runserver
```

The API is now at http://localhost:8000. To run the 121 backend tests: `python -m pytest`.

**Frontend**, from the `frontend` folder:

```
npm install
npm run dev
```

Open http://localhost:5173. The frontend finds the backend at `http://localhost:8000`
unless you copy `frontend/.env.example` to `frontend/.env` and change `VITE_API_URL`.
`npm run build` makes the production build and `npm run preview -- --port 5173` serves it.
The backend only allows the origin listed in `CORS_ALLOWED_ORIGINS`, and `vite preview`
defaults to port 4173, so keep it on 5173.

## Deploy

The backend goes on Railway and the frontend on Vercel. Deploy the backend first, because
the frontend needs its address.

**Railway (backend)**

1. New project, deploy from your GitHub repo. In the service settings set **Root
   Directory** to `backend`. Railway picks up the `Procfile` (gunicorn) and
   `.python-version` (Python 3.12) by itself.
2. Under Variables add:
   - `TOMTOM_API_KEY`: your TomTom key.
   - `DJANGO_SECRET_KEY`: a long random string.
   - `DJANGO_ALLOWED_HOSTS`: the Railway domain, for example `my-app.up.railway.app`
     (no `https://`).
   - `CORS_ALLOWED_ORIGINS`: the Vercel address, for example `https://my-app.vercel.app`
     (no trailing slash).
   - Leave `DJANGO_DEBUG` unset.
3. Under Settings, Networking, generate a public domain.

If `DJANGO_ALLOWED_HOSTS` is missing, Django answers every request with 400 "Bad Request"
(it only allows localhost). If `CORS_ALLOWED_ORIGINS` is missing, the page loads but the
browser blocks every call to the API, so a search shows a network error.

**Vercel (frontend)**

1. Import the same repo. Set **Root Directory** to `frontend`. Vercel detects Vite.
2. Add the environment variable `VITE_API_URL=https://<railway domain>` with no trailing
   slash. It is read at build time, so redeploy after changing it.
3. Put the Vercel address into Railway's `CORS_ALLOWED_ORIGINS`, then open the app.

## How it works

The full reasoning is in [docs/DECISIONS.md](docs/DECISIONS.md) (the rules and why) and
[docs/DESIGN.md](docs/DESIGN.md) (the structure and the measurements). The short version:

1. **One request per search.** The browser sends one `POST /api/plan`. Django has no
   database and no background jobs, so everything happens inside that request.
2. **Routes.** `trips/tomtom.py` asks TomTom once for the routes. It returns the road
   shape plus travel times at points along it.
3. **Checkpoints and ETA.** Checkpoints sit at mile 0, every 10, 25 or 50 miles, and at
   the destination. The ETA at each one comes from TomTom's own travel times, with a
   straight-line estimate between its points. "Auto" picks the interval from the longest
   route: 10 mi under 250 mi, 25 mi up to 750 mi, 50 mi beyond.
4. **Weather.** `trips/weather.py` asks Open-Meteo for the forecast and each checkpoint
   reads the forecast hour nearest its ETA. Rain is rain plus showers, snow is snowfall.
5. **Risk.** Wind, rain and snow are each rated Low, Moderate, High, Severe or No Travel,
   and a checkpoint takes the worst one. The load can only make wind worse: above 30,000 lb,
   45 to 55 mph wind is No Travel, and above 40,000 lb, 35 to 45 mph wind is Severe.
   Any wind of 55 mph or more is No Travel. These rules are pure functions in
   `trips/domain/risk.py` with no network calls, so the tests pin them down.
6. **Ranking.** Routes are compared in strict order: No Travel miles, Severe miles, High
   miles, average risk, then travel time. No Travel comes first because the brief never
   mentions it but it is worse than Severe. The winner shows which rule decided it and how
   much slower it is than the fastest route. If even the best route has No Travel miles,
   the app says "No safe route".
7. **Heatmap.** The area around the routes is cut into squares, and each square gets a
   risk level for every hour from 0 to 48 after departure. All 49 hours are sent in the
   same response, so the slider never calls the server. It uses MapLibre feature state,
   which repaints every square in one frame.
8. **Caching and the weather budget.** Open-Meteo's free tier counts locations, not
   requests (600 a minute). Nearby points share one forecast square, each square is
   cached for 30 minutes, and a search that needs more than 500 locations is refused
   with a message asking for a wider interval. Changing the load or interval on a trip
   you just searched makes no new weather calls.

## Known limits

- TomTom sometimes returns fewer than three routes. San Diego to Bangor returned one,
  and the app says "Only 1 route found". There is no code to invent extra routes.
- Very long trips can take up to about 25 seconds, mostly TomTom's routing call.
- The cache lives in the server's memory and is lost when the server restarts. Past one
  server process it would need Redis.
- ETAs are continuous driving time. Rest breaks are not modelled.
- Free weather limits can make the app say "try again in a minute", for example after
  two different cross-country searches in quick succession.
- 10 mi spacing is refused on very long trips (it would need more than 500 weather
  locations). Pick 25 or 50 mi, or Auto.
- US only. No accounts, no saved trips.
- A 50 mi interval can miss a narrow storm. The heatmap covers the whole corridor for
  that reason.

## How AI agents were used

I built this with Claude Code agents, and kept a human in the loop for decisions.

- **Design council.** Before any code, five reviewer agents, chaired by Fable, argued
  over the design. The result is in `docs/DESIGN.md` and `docs/DECISIONS.md`.
- **Live tests before decisions.** Real TomTom and Open-Meteo calls settled questions
  such as how many routes TomTom returns, how slow long trips are, and how Open-Meteo
  counts usage. The numbers are in the table at the top of `docs/DESIGN.md`.
- **Builder plus reviewer.** Each task had one agent write it and a separate agent
  review it, and the reviewer saw the code, not the builder's conclusions.

Two places where this changed the outcome:

1. **The weather budget.** Running real cross-country trips found a defect: Seattle to
   Miami on Auto needed 605 weather locations and Los Angeles to New York 571, over the
   500 limit, so the search was refused with advice to pick a wider interval that was
   already the widest. The fix was larger heatmap squares (2 degrees) on trips over
   1,500 miles, which brought Auto down to 345 and 333, and a plain "too long" message
   instead of the wrong advice. The planned numbers in the design had been too low.
2. **The slider.** The plan was to repaint the heatmap by changing a layer color with
   the hour. I measured it on a Seattle to Miami trip with the CPU slowed 4x: each step
   rebuilt the map tiles and a step could take more than one frame. MapLibre feature
   state rebuilt no tiles and painted every hour in one frame (22 to 24 ms from step to
   screen), so we use that instead.

## Project layout

```
backend/   Django + Django REST Framework (trips/ has the code, trips/domain/ the pure rules)
frontend/  Vite + React + TypeScript + MUI + MapLibre
docs/      DECISIONS.md (rules), DESIGN.md (structure), LOOM.md (video outline)
```
