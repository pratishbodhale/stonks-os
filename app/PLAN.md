# Indian Stock Scanner V1

## Scope
- Market universe: NIFTY 200 (seed list included, easy to extend to full 200 symbols)
- Data source: Yahoo Finance delayed market data
- V1 signals:
  - Unusual volume (current volume vs 20-day average)
  - Price + volume breakout (price above recent 20-day high with strong volume)
  - Manual social discussion notes per stock

## Architecture
- Next.js web app with API routes
- `src/lib/yahoo.ts` for Yahoo data ingestion
- `src/lib/signals.ts` for signal computation and ranking
- `src/app/api/scan/route.ts` for scanner endpoint
- `src/app/api/notes/route.ts` for manual social notes CRUD
- Dashboard UI in `src/app/page.tsx`

## Delivery Steps
1. Build core symbol list + Yahoo ingestion.
2. Implement signal engine and scanner API.
3. Build dashboard with filters and refresh.
4. Add manual social notes pane.
5. Add stale-data messaging and basic error handling.
