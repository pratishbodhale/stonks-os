# Public Static Assets

## Purpose

Static files served at the site root. The Firebase messaging service worker must live here at a fixed path.

## Files

| File | Role |
|------|------|
| `firebase-messaging-sw.js` | Background FCM handler; notification click navigates to `/runs/{snapshotId}` |
| `file.svg` | Notification icon |
| `vercel.svg`, `window.svg` | Default Next/Vercel assets (unused in app UI) |

## Service worker constraints

- Registered at `/firebase-messaging-sw.js` from `NotificationSetup`
- Service workers **cannot** read build-time env vars — Firebase config is hardcoded here
- Keep config in sync with `src/lib/firebase-client.ts` when changing Firebase project settings
- Background notifications use the `file.svg` icon path

## Conventions

- Do not move `firebase-messaging-sw.js` to `src/` — browsers require it at the origin root
- When updating Firebase credentials, update both `firebase-client.ts` and this service worker
