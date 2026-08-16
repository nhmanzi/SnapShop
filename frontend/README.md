# SnapShop — Frontend

A Next.js (App Router) app: a viewfinder camera UI that captures a photo, sends
it to the backend, and shows the identified item plus local Kigali sellers.
Ported from a single-file vanilla HTML/JS app — the design and logic are
unchanged, just re-homed into React (`app/Viewfinder.js`) so it can deploy to
Vercel.

## Run locally
```
npm install
cp .env.local.example .env.local   # set NEXT_PUBLIC_API_BASE if not localhost:8000
npm run dev -- --port 5500
```
Open http://localhost:5500 (start the backend first — see ../backend).

## Config
- `NEXT_PUBLIC_API_BASE` (in `.env.local`) points to the backend. Defaults to
  `http://localhost:8000` in dev if unset.
- Override per-session with a query param: `?api=http://192.168.1.20:8000`
  (useful when testing from a phone against your Mac's LAN IP).
- `?demo=1` — preview the full flow with no camera and no backend (sample data).

## Deploy (Vercel)
1. Push this repo to GitHub.
2. In Vercel: **New Project** → import the repo → set **Root Directory** to `frontend`.
3. Add the env var `NEXT_PUBLIC_API_BASE` = your deployed backend URL (e.g. the
   Render service URL).
4. Deploy. Vercel gives you HTTPS automatically, so live camera works directly
   on a phone (no Upload-button workaround needed, unlike plain http).

## Notes
- Photos are downscaled to ~1024px on the long edge before upload to keep
  recognition cost and latency low.
- The whole interactive UI lives in a client-only component
  (`app/DynamicViewfinder.js` → `app/Viewfinder.js`, loaded with `ssr: false`)
  since it depends entirely on browser APIs (camera, canvas, file input).
