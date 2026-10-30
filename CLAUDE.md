# Weather-Aware Truck Routing

React + Django app that picks the safest truck route from weather, load and time.

- `backend/`: Django + DRF. `frontend/`: Vite + React + TypeScript + MUI + MapLibre.
- `docs/DECISIONS.md` is the source of truth for risk and ranking rules. Update it
  before changing a rule, and keep the tests in step.
- Risk and ranking code is pure, with no I/O. External APIs stay behind adapters.
- All time math is in UTC. Never commit `backend/.env`.
- Backend tests: `cd backend && .venv/Scripts/python -m pytest`
