# SnapShop

Point your phone camera at any item → SnapShop tells you **what it is** and
**where to buy it locally** (Kigali sellers), instead of only foreign retailers.

```
snapshop/
  backend/       FastAPI: recognition (Claude Haiku vision) + local seller matching (Supabase)
  frontend/      Next.js app: viewfinder camera UI
  render.yaml    Render Blueprint for one-click backend deploy
  CLAUDE.md      Project brief for Claude Code
```

## Quick start

Two terminals.

**Backend**
```
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # add ANTHROPIC_API_KEY + DATABASE_URL, or leave blank for mock/seed mode
uvicorn app.main:app --reload   # http://localhost:8000  (API + /docs)
```

**Frontend**
```
cd frontend
npm install
npm run dev -- --port 5500      # http://localhost:5500
```

Open http://localhost:5500, allow the camera, tap the shutter.
- No `ANTHROPIC_API_KEY` → mock mode (canned earbuds result), everything runs offline.
- With a key → live Claude Haiku recognition.
- No `DATABASE_URL` (or Supabase unreachable) → falls back to built-in seed sellers.
- `?demo=1` → preview the flow with no camera and no backend.

## How it fits together
```
frontend (camera)  --photo-->  backend /recognize/upload  --image-->  Claude Haiku
        ^                              |                                   |
        +-------- item + sellers ------+  <-- local seller matching (Supabase, yours)
```

Claude handles raw recognition; the matching engine, local seller index,
structured-output prompt, and evaluation are the project's own contribution.

## Tests
```
cd backend && python -m pytest tests/ -v   # runs in mock mode, no key or DB needed
```

## Deploy
- **Frontend → Vercel.** Import this repo, set Root Directory to `frontend`, add
  `NEXT_PUBLIC_API_BASE` pointing at your deployed backend. Free HTTPS means live
  camera works directly on a phone. See `frontend/README.md`.
- **Backend → Render.** `render.yaml` at the repo root is a ready-to-use Blueprint
  (Root Directory `backend`, uvicorn start command). Set `ANTHROPIC_API_KEY` and
  `DATABASE_URL` as secrets in the Render dashboard after creating the service.
- **Database → Supabase** (already set up — see `backend/scripts/seed_supabase.py`).

## Roadmap
1. ~~Real seller DB (Supabase) to replace the seed data~~ — done, with seed-data fallback.
2. Live recognition test on real objects + prompt tuning.
3. Evaluation harness (accuracy + local match rate).
4. Native iOS client (SwiftUI) on the same backend.

See `CLAUDE.md` for the full brief.
