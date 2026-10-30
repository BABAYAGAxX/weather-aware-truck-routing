# Loom outline (about 8 minutes)

Say it in your own words. The lines under "Say" are a guide, not a script. Do a dry run
first, with a trip whose weather you have already searched, so the search is fast and the
forecast is cached.

Setup before recording: backend and frontend running, a trip with some Moderate weather
ready (check the heatmap for yellow squares), and a second browser tab with
`docs/DECISIONS.md` open.

## 1. The problem and the result (0:00 to 0:45)

**Show:** the app with a finished search already on screen.
**Say:** A truck driver picks a route by weather, load and time. You give it two places,
a departure time and a load. It gets three truck routes, checks the forecast at
checkpoints using when the truck will actually be there, and recommends one.

## 2. A search, start to finish (0:45 to 2:15)

**Show:** type the origin and destination (point at the address suggestions), set a
departure and a load, leave the interval on Auto, press Find routes.
**Say:** Auto picks the checkpoint spacing from the trip length: 10, 25 or 50 miles.
I can override it. While it loads, mention that long trips can take up to about 25
seconds, because TomTom is slow on cross-country routes.

## 3. The map and the cards (2:15 to 4:00)

**Show:** the three coloured routes, the recommended card, click a route line, then
click a checkpoint circle.
**Say:** Each route has one colour on its line and its card. The recommended route has a
summary popup straight away. A checkpoint shows the ETA, wind, gust, rain, snow, the risk
level and what caused it. Checkpoint colour is the risk level. Point at the miles of High,
Severe and No Travel on the card and at the average risk.

## 4. Why this route won (4:00 to 5:15)

**Show:** the reason line on the recommended card. Then switch to the DECISIONS tab, the
ranking list.
**Say:** The brief gives a strict order but never mentions No Travel. I put it first
because it is worse than Severe. Routes are compared by No Travel miles, Severe miles,
High miles, average risk, then travel time. The card shows which rule decided and how
many minutes slower the winner is than the fastest route, so the trade-off is visible.
If every route has No Travel miles it says "No safe route".

## 5. The load rules (5:15 to 5:45)

**Show:** the risk table in DECISIONS, load rules section.
**Say:** Load only matters for wind and only makes it worse. Above 30,000 lb, 45 to 55
mph wind is No Travel. Above 40,000 lb, 35 to 45 mph is Severe. Say plainly that real
wind that strong is rare, so the tests, not a live trip, prove these rules.

## 6. The heatmap and slider (5:45 to 6:45)

**Show:** drag the slider from 0 to 48 hours and watch the squares change.
**Say:** The whole 48 hours arrives in one response, so the slider never calls the server.
I first planned to repaint with a layer colour, but measured it: the map rebuilt its tiles
on every step. Feature state changes every square in one frame, so I used that.

## 7. Protecting the free weather limit (6:45 to 7:30)

**Show:** run the same trip again and point out it comes back fast. Then try 10 mi on a
cross-country trip and show the "wider interval" message.
**Say:** Open-Meteo counts locations, not requests. Nearby points share one square, each
square is cached for 30 minutes, and a search over 500 locations is refused with a message.
Live testing on cross-country trips found my first numbers were too low, so I made the
squares bigger on very long trips.

## 8. Honest limits and one trade-off (7:30 to 8:30)

**Show:** the Known limits section of the README.
**Say:** TomTom sometimes gives only one route. The cache is in memory and is lost on
restart. ETAs ignore rest breaks.

**Trade-off to defend:** I follow the brief's strict ranking order instead of a weighted
score. A route with slightly lower average risk can win even if it is hours slower, and
the card says how much slower. I chose this because a weight (how many minutes is one
point of risk worth?) is a made-up number I could not defend, while the order is what the
brief states and every result can be explained in one sentence. If the brief wanted a
balance, the first thing I would add is a cap on how much extra time the safer route may
cost.
