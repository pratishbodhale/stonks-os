# Public Static Assets

## Purpose

Static files served at the site root. The Firebase messaging service worker must live here at a fixed path.

## Files

| File | Role |
|------|------|
| `firebase-messaging-sw.js` | **Generated** — background FCM handler; not committed (see below) |
| `file.svg` | Notification icon |
| `vercel.svg`, `window.svg`, `globe.svg`, `next.svg` | Default Next/Vercel assets (unused in app UI) |

## Service worker constraints

- Registered at `/firebase-messaging-sw.js` from `NotificationSetup`
- **Do not commit** `firebase-messaging-sw.js` — it is generated at dev/build time by `scripts/generate-firebase-sw.mjs` from `NEXT_PUBLIC_FIREBASE_*` in `.env.local` (and `NEXT_PUBLIC_BASE_PATH` for subpath deploys)
- Run `npm run dev` or `npm run build` after clone or env changes; Docker builds need the same `NEXT_PUBLIC_FIREBASE_*` values available at **image build** time (not only runtime `.env` on the Pi)
- Service workers cannot read runtime env — config is baked in when the generator runs
- Background notifications use the `file.svg` icon path (with base path when configured)

## Notification click routing

`resolveNotificationUrl()` in the service worker:

1. `data.url` if present (absolute or relative) — used by `sendDailyScanNotification()` for combined daily scan alerts
2. Fallback: `/runs/{data.snapshot_id}` for legacy volume-only notifications
3. Default: `/`

Daily scan payloads include `type: daily_scan`, `snapshot_id`, `weekly_snapshot_id`, and a pre-built `url` pointing to the volume run page.

## Conventions

- Do not move `firebase-messaging-sw.js` to `src/` — browsers require it at the origin root
- When changing Firebase project settings, update `NEXT_PUBLIC_FIREBASE_*` in `.env.local` and regenerate — do not hand-edit or commit the generated file
