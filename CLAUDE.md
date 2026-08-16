# SnapShop — project brief (for Claude Code)

SnapShop is a final-year CS project. Point a phone camera at any item → it tells
you **what the item is** and **where to buy it from local Kigali sellers**
(instead of only foreign retailers). Recognition is powered by Claude Haiku
vision; the local "where to buy" layer is the project's own contribution.

## Structure
```
snapshop/
  backend/       FastAPI service: recognition (Claude Haiku) + local seller matching (Supabase)
  frontend/      Next.js (App Router) app: viewfinder camera UI that calls the backend
  render.yaml    Render Blueprint for the backend
```

## Run it
Backend (terminal 1):
```
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # add ANTHROPIC_API_KEY + DATABASE_URL, or leave blank for mock/seed mode
uvicorn app.main:app --reload # -> http://localhost:8000
```
Frontend (terminal 2):
```
cd frontend
npm install
cp .env.local.example .env.local   # NEXT_PUBLIC_API_BASE, defaults to localhost:8000
npm run dev -- --port 5500    # -> http://localhost:5500
```
Camera needs http on localhost (works) or HTTPS on a phone; deployed on Vercel this
is automatic. The Upload button is the fallback and opens the camera on mobile over http.
Add `?demo=1` to preview the flow with no camera and no backend.

## Key files
- `backend/app/recognition.py`  — Claude Haiku vision call + mock fallback + prompt
- `backend/app/matching.py`     — scores a recognized item against local sellers
- `backend/app/sellers.py`      — Supabase-backed sellers + seed-data fallback (`get_sellers()`)
- `backend/app/db.py`, `db_models.py` — SQLAlchemy/Supabase connection, lazily imported
- `backend/scripts/seed_supabase.py`  — one-off script to create tables + load seed data
- `frontend/app/Viewfinder.js`  — the whole interactive UI (client component, ported 1:1 from the
  original single-file HTML/JS app); `frontend/app/globals.css` has the styling
- `frontend/app/DynamicViewfinder.js` — loads Viewfinder with `ssr: false` (it's browser-API-only)

## Conventions
- Recognition returns structured JSON: category, brand, model, attributes,
  visible_text, confidence. Keep that contract stable — the matcher and UI rely on it.
- Mock mode is enabled whenever there is no API key, or MOCK_MODE=true. Tests run
  in mock mode and must stay green: `cd backend && python -m pytest tests/ -v`.
- Sellers come from Supabase when `DATABASE_URL` is set and reachable; otherwise
  (or on any DB error) `get_sellers()` falls back to seed data — never let this regress
  to a hard failure, that fallback is what keeps a live demo safe.
- Photos are downscaled to ~1024px long edge before upload (cost/latency).
- Recognition model must be the dated Haiku ID (`claude-haiku-4-5-20251001`), not the
  bare `claude-haiku-4-5` alias — the latter 404s.

## Next tasks (suggested order)
1. ~~Replace seed sellers with a real DB (Supabase) + a small scraper.~~ DB done; scraper still open.
2. Add your Anthropic key and test live recognition on ~10 real objects; tune the prompt.
3. Build an evaluation harness: recognition accuracy + local match rate on the sample space.
4. Later: native iOS client (SwiftUI) calling the same backend.

## Deploy
- Frontend → Vercel (root directory `frontend`, env var `NEXT_PUBLIC_API_BASE`).
- Backend → Render (`render.yaml` Blueprint at repo root; set `ANTHROPIC_API_KEY` and
  `DATABASE_URL` as dashboard secrets — they're marked `sync: false` so they're never in the repo).

## Security
- The API key and DB connection string live only in `backend/.env` (gitignored) locally,
  and as dashboard secrets in Render for deploys. Never commit them, never hard-code them,
  never paste them into chat. The app calls the backend, not Anthropic or Supabase
  directly, so neither secret ever ships to the client.
