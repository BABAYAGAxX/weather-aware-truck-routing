# Decisions

The brief leaves several points open. Each interpretation below is deliberate, and
the tests in `backend/` pin the rules. Change a rule here first, then in code.

## Risk classification

Each reading is classified on its own, and a checkpoint takes the worst of wind,
rain and snow. Bands are half-open so that every value lands in exactly one band.
The brief's rain and snow bands share endpoints (0.25 appears twice), so the shared
value goes to the higher band. Values are not rounded: 34.6 mph is Moderate.

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

Wind means sustained wind at 10 m. Gusts are shown for information only.

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
weight. If all routes contain No Travel miles, the one with the fewest is still
listed first, with a "not safe to travel" warning.

Miles are compared to 0.1 mi and average risk to 0.01, so meaningless floating-point
differences fall through to the next rule.

### Miles and averages

- Checkpoints sit at mile 0, every interval along the route, and the destination.
- Each checkpoint covers the route from the midpoint before it to the midpoint after
  it, so the covered miles add up to the route length.
- Average risk is the mile-weighted mean of the level scores.

## Sampling interval

The selector offers Auto, 10, 25 and 50 miles. Auto uses the longest of the three
routes: under 250 mi uses 10, 250 to 750 mi uses 25, over 750 mi uses 50.

One interval applies to all routes on a trip, otherwise their miles are not
comparable. A 50 mi interval can miss a narrow storm, which is why the user can
override it and why the heatmap covers the whole corridor.

## Timing and weather

- All time math is in UTC. Departure is entered in the user's local time.
- Checkpoint ETAs come from the routing API's own travel times, not average speed.
- Each checkpoint uses the forecast hour nearest its ETA, with no interpolation.
- Rain is `rain + showers`. Snow is `snowfall`. They are rated separately.
- Trips longer than 48 hours still get a forecast at every checkpoint. The slider
  stays at the 0 to 48 hours the brief asks for, and hour 0 is the departure time.
- Departure can be now or up to 14 days ahead.
- Driver rest breaks are not modelled, so ETAs are continuous driving time.

## Load weight

The entered load drives the risk rules unchanged. Routing needs the whole vehicle,
so TomTom receives the load plus about 35,000 lb of truck, capped at the 80,000 lb
US limit.

## Providers

- Routing and address search: TomTom (truck mode, returns alternatives).
- Weather: Open-Meteo (no key, hourly, multi-point requests).
- Map: MapLibre GL.

Providers sit behind adapters so they can be swapped.

## Scope

US only, no accounts, no saved trips. Django's in-memory cache by default, Redis
when `REDIS_URL` is set.

## Hosting

Frontend on Vercel, Django on Railway.
