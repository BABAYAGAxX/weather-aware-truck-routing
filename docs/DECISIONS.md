# Decisions

The brief leaves several points open. Each interpretation below is deliberate, and
the tests in `backend/` pin the rules. Change a rule here first, then in code.

## Risk classification

Each reading is classified on its own, and a checkpoint takes the worst of wind,
rain and snow. In every band the lower bound is included and the upper bound is
excluded, so every value lands in exactly one band. The brief's rain and snow bands
share endpoints (0.25 appears twice), so the shared value goes to the higher band.
Values are not rounded: 34.6 mph is Moderate.

| Level | Score | Wind (mph) | Rain (in/hr) | Snow (in/hr) |
|---|---|---|---|---|
| Low | 0 | < 25 | < 0.10 | < 0.5 |
| Moderate | 1 | 25 to < 35 | 0.10 to < 0.25 | 0.5 to < 1.0 |
| High | 2 | 35 to < 45 | 0.25 to < 0.50 | 1.0 to < 2.0 |
| Severe | 3 | 45 to < 55 | 0.50 to 1.00 | 2.0 to 3.0 |
| No Travel | 4 | ≥ 55 | > 1.00 | > 3.0 |

The top band is exclusive for rain and snow (`> 1.00`, `> 3.0`) and inclusive for
wind (`≥ 55`), as written in the brief.

### Load rules

Load rules apply to wind only and can only raise a level:

- Wind ≥ 55 mph: No Travel for any load.
- Wind 45 to < 55 mph and load > 30,000 lb: No Travel.
- Wind 35 to < 45 mph and load > 40,000 lb: Severe.

Load limits are strict: exactly 30,000 lb or 40,000 lb is not affected.

Wind means sustained wind at 10 m.

## Route recommendation

The brief ranks Severe miles, High miles, average risk and travel time, but never
mentions No Travel. No Travel is worse than Severe, so it ranks first. Routes are
compared strictly in this order, lower is better:

1. No Travel miles
2. Severe miles
3. High miles
4. Average risk
5. Travel time

The brief says to balance risk and time and also gives a strict order. We follow the
order and show the extra time, so the trade-off is visible instead of hidden in a
weight. The winning route shows which rule decided it and how much slower it is than
the fastest route.

If the best route still has No Travel miles, no route is recommended and the UI says
"No safe route". The routes are still listed in rank order.

Miles are compared to 0.1 mi and average risk to 0.01, so meaningless floating-point
differences fall through to the next rule.

### Miles and averages

- Checkpoints sit at mile 0, every interval along the route, and the destination.
- Each checkpoint owns half the gap on each side of it, so the miles add up to the
  route length. Checkpoints at 0, 50 and 80 own 25, 40 and 15 miles.
- Average risk is the mile-weighted mean of the level scores.

## Sampling interval

The selector offers Auto, 10, 25 and 50 miles. Auto uses the longest of the routes:
under 250 mi uses 10, 250 to 750 mi uses 25, over 750 mi uses 50.

One interval applies to all routes on a trip, otherwise their miles are not
comparable. A 50 mi interval can miss a narrow storm, which is why the user can
override it and why the heatmap covers the whole corridor.

A chosen interval is refused, with a message, if the search would need more than 550
weather locations. Measured on six real trips (five with three routes, San Diego to
Bangor with one): 10 mi fit on the three trips up to 1,338 mi (495 locations on
Chicago to Denver) and on the single-route 3,307 mi trip (442), but was refused on the
two three-route cross-country trips (1,016 and 1,055). 25 mi now fits on all six
trips, including those two (505 and 529 locations). Open-Meteo allows 600 locations a
minute, so 550 leaves some room. Single-route trips count lower than three-route trips
of the same length. Auto needed at most 345 locations on all six trips, up to
3,556 mi, so it stays under the limit. If Auto or 50 mi is ever
over, the message says the trip is too long instead of asking for a wider interval,
because 50 mi is already the widest. We refuse instead of silently widening because
the user made an explicit choice.

## Timing and weather

- All time math is in UTC. Departure is entered in the browser's local time.
- Checkpoint ETAs come from the routing API's own travel times. TomTom gives elapsed
  time at points along the route, and we estimate the time between two known points
  with a straight line.
- Each checkpoint uses the forecast hour nearest its ETA, with no interpolation. A time
  exactly on the half hour goes to the later hour, so consecutive slider hours always
  read consecutive forecast hours.
- Rain is `rain + showers`, rounded to 3 decimals so a sum lands exactly on a band edge.
  Snow is `snowfall`. They are rated separately.
- Trips longer than 48 hours still get a forecast at every checkpoint. The slider
  stays at the 0 to 48 hours the brief asks for. Hour 0 is the departure time, and
  the slider label shows the clock time.
- Departure can be now (a time up to an hour in the past is treated as now) or up to
  10 days ahead. We fetch 14 days of forecast, which leaves about 3 days after the
  latest departure. The longest route tested took 51 hours.
- A time outside the forecast is an error. It is never treated as Low.
- Driver rest breaks are not modelled, so ETAs are continuous driving time.

## Load weight

The entered load drives the risk rules unchanged. Routing needs the whole vehicle,
so TomTom receives the load plus about 35,000 lb of truck, capped at the 80,000 lb
US limit.

## Heatmap

The heatmap is a set of colored squares covering the trip corridor. The corridor is
every square any route crosses, plus one ring of squares around them. Squares use the
same rules as checkpoints, including the entered load, for each of hours 0 to 48.

Square size follows trip length, using the same bands as Auto: under 250 mi uses 0.25
degrees (about 17 mi), 250 to 750 mi uses 0.5 degrees, 750 to 1,500 mi uses 1 degree,
and over 1,500 mi uses 2 degrees (about 140 mi). The last band keeps cross-country
trips inside the weather limit. Checkpoint spacing for Auto stays 50 mi over 750 mi.

## Weather usage

Open-Meteo's free tier counts every location, not every request, with limits of 600 a
minute, 5,000 an hour and 10,000 a day. Three things keep us inside it:

- **Shared forecast squares.** Each location is rounded to a fixed grid, 0.1 degrees
  for checkpoints, so nearby points share one forecast.
- **A 30 minute cache per square.** Changing the load, departure or interval reuses
  every square already fetched, so only squares not seen yet need a new call.
- **A limit of 550 locations a search.**

If Open-Meteo still refuses a request, the user sees "try again in a minute".

## Providers

- Routing and address search: TomTom truck routing. It returned 3 routes on 13 trips
  tested, from 8 to 3,556 mi, and only 1 on San Diego to Bangor. TomTom's other route
  modes timed out on that trip, so we do not force extra routes. When it returns
  fewer, the UI shows them and says "Only 1 route found". Long trips can take up to
  about 25 s end to end (TomTom alone took 19.0 s on Seattle to Miami), so the routing
  timeout is 30 s.
- Weather: Open-Meteo (no key, hourly, multi-point requests).
- Map: MapLibre GL.

`tomtom.py` and `weather.py` are the only files that talk to these services.

## Scope

US only, no accounts, no saved trips. Nothing is stored, so there is no database. The
cache lives in the server's memory and is lost on restart. To scale past one process,
change the cache setting to Redis.

## Hosting

Frontend on Vercel, Django on Railway. Railway runs one process with four threads, so
every request shares the one in-memory cache. Gunicorn waits up to 60 s for a request,
so a slow long-trip search is not cut off.
