# Weather-Aware Truck Routing

React + Django app that picks the safest truck route from weather, load and time.

- `backend/`: Django + DRF. `frontend/`: Vite + React + TypeScript + MUI + MapLibre.
- Risk and ranking code is pure, with no I/O. External APIs stay behind adapters.
- All time math is in UTC. Never commit `backend/.env`.
- Backend tests: `cd backend && .venv/Scripts/python -m pytest`
