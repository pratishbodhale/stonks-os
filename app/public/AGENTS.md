# Public Static Assets

## Purpose

Static files served at the site root. The Firebase messaging service worker must live here at a fixed path.

## Files

| File | Role |
|------|------|
| `firebase-messaging-sw.js` | Background FCM handler; notification click resolves URL from payload |
| `file.svg` | Notification icon |
| `vercel.svg`, `window.svg`, `globe.svg`, `next.svg` | Default Next/Vercel assets (unused in app UI) |

## Service worker constraints

- Registered at `/firebase-messaging-sw.js` from `NotificationSetup`
- Service workers **cannot** read build-time env vars — Firebase config is hardcoded here
- Keep config in sync with `src/lib/firebase-client.ts` when changing Firebase project settings
- Background notifications use the `file.svg` icon path

## Notification click routing

`resolveNotificationUrl()` in the service worker:

1. `data.url` if present (absolute or relative) — used by `sendDailyScanNotification()` for combined daily scan alerts
2. Fallback: `/runs/{data.snapshot_id}` for legacy volume-only notifications
3. Default: `/`

Daily scan payloads include `type: daily_scan`, `snapshot_id`, `weekly_snapshot_id`, and a pre-built `url` pointing to the volume run page.

## Conventions

- Do not move `firebase-messaging-sw.js` to `src/` — browsers require it at the origin root
- When updating Firebase credentials, update both `firebase-client.ts` and this service worker
