# WindWatch — day-ahead wind forecast intelligence (GB)

A full-stack decision-support web app for a UK energy utility's **day-ahead power buying desk**. It answers two questions using Elexon national wind data only (`FUELHH` actuals, `WINDFOR` forecasts):

1. **What is the latest wind forecast I can act on at gate closure?** (Day-ahead view)
2. **How accurate are these forecasts, quantitatively?** (Forecast accuracy view)

Scope: purchase decisions made in **January 2026** → delivery days **2 Jan – 1 Feb 2026**.

- **Live app:** `https://wwgfy-c1f7p8wf3-abc-3421.vercel.app/`

## Features
- **Decision-time forecast:** for each half-hour, the forecast run with the latest `publishTime` ≤ gate closure (default 09:20 UK on D−1, editable). Later runs are excluded — no hindsight bias.
- **Uncertainty band + suggested buffer:** empirical P10–P90 of historic errors (previous days only, no look-ahead).
- **Accuracy analytics:** MAE, RMSE, bias, WMAPE, P90/P95 error, worst over/under-forecast; error by **lead time**, **time of day**, **day**; error histogram; forecast-vs-actual scatter; auto-generated takeaways.
- Compare with the *final* forecast and earlier runs, CSV export, light/dark theme, responsive.

## Repository layout
```
backend/
  app/config.py       settings (scope dates, default gate closure, paths)
  app/models.py       WindData: actuals + forecast "vintages", snapshot IO, latest-before lookup
  app/elexon.py       async Elexon Insights client (FUELHH / WINDFOR streams, retries, chunking)
  app/analytics.py    decision-time selection, metrics, error band, accuracy views, insights
  app/synthetic.py    deterministic SYNTHETIC data, demo/test only (UI shows a banner)
  app/store.py        cached snapshot loader, delivery-day list
  app/main.py         FastAPI: /api/meta, /api/forecast, /api/accuracy, serves built SPA
  scripts/fetch_data.py   downloads real data -> backend/data/wind_snapshot.json.gz
  tests/              pytest unit + end-to-end tests
frontend/             React + TypeScript + Vite + Recharts
  src/components/     ForecastPage, AccuracyPage, About, ui primitives
api/index.py          Vercel serverless entrypoint (re-exports the FastAPI app)
Dockerfile, docker-compose.yml, vercel.json
```

## Run it

### 1. Get the real data (do this once)
```bash
cd backend
pip install -r requirements.txt
python -m scripts.fetch_data      # writes backend/data/wind_snapshot.json.gz (needs internet)
```
This creates the exact snapshot file:
`backend/data/wind_snapshot.json.gz`

Commit that file to GitHub (or include it in your deployment artifact) so deployments are fast and don't depend on Elexon being up. Without it the app falls back to clearly-labelled **synthetic** data. Vercel is configured to include `backend/data/**` in the serverless deployment.

### 2a. Docker
```bash
docker compose up --build         # http://localhost:8000
# or fetch data inside docker:  docker compose run --rm fetch
```
### 2b. Local dev
```bash
cd backend && uvicorn app.main:app --reload --port 8000
cd frontend && npm install && npm run dev      # http://localhost:5173 (proxies /api)
```
### Tests
```bash
cd backend && pip install -r requirements-dev.txt && pytest
```

## Deploy to Vercel
1. Push the repo including the generated snapshot at `backend/data/wind_snapshot.json.gz` to GitHub.
2. Import it in Vercel — `vercel.json` builds the React app and exposes FastAPI at `/api/*`, and includes `backend/data/**` in serverless files.
3. Set env var `ALLOW_SYNTHETIC=0` so a missing snapshot fails loudly instead of showing demo data.
4. Open the URL in incognito and check the banner is absent and the pill says **Live Elexon data**.

## Design decisions
- **Pure-Python analytics (no pandas):** small data, tiny serverless bundle, easy to unit test.
- **Snapshot instead of live calls:** reproducible numbers, fast responses, no rate-limit risk. Re-run the fetch script to refresh.
- **Sign convention:** error = forecast − actual; positive = wind over-forecast = shortfall exposure for the buyer.
- **Time:** epochs in UTC internally; gate closure and delivery days use `Europe/London`.

## Assumptions & limitations
- Gate closure 09:20 UK on D−1 is an assumption (editable in the UI).
- "Decisions made in January" is interpreted as delivery days 2 Jan–1 Feb.
- Demand and prices are out of scope per the brief; the app supplies the wind input, not the final volume to buy.
- The error band is empirical and unconditional over one month — indicative, not a guarantee.
