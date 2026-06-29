---
name: deploy-rpi
description: Deploy StonksOS app (app/) to the Raspberry Pi via Docker build, image transfer, and compose restart. Use when the user asks to deploy to RPi, raspberry pi, raspberrypi.local, push to Pi, update the Pi server, or redeploy stonks-os-app.
---

# Deploy StonksOS to Raspberry Pi

Deploys the Next.js scanner from `app/` to the home-lab Pi. Image transfer uses `docker save | ssh docker load` because GHCR package `ghcr.io/pratishbodhale/stonks-os-app` is private.

## Defaults

| Setting | Value |
|---------|-------|
| SSH target | `pratishbodhale@raspberrypi.local` |
| Remote dir | `~/stonks-os-app` |
| Image | `ghcr.io/pratishbodhale/stonks-os-app:latest` |
| Host port | `3002` (Grafana uses 3000 on Pi) |
| Public URL | `https://orbits.pratish.dev/stonksos` (Cloudflare → Pi) |
| Direct URL | `http://raspberrypi.local:3002/stonksos` |
| Base path | `/stonksos` — **must be set at Docker build time** (see below) |

Override via env: `RPI_SSH`, `RPI_APP_DIR`, `DOCKER_IMAGE`, `RPI_PORT`, `RPI_APP_URL`, `RPI_BASE_PATH`, `DOCKER`.

**SSH password:** `deploy.sh` auto-loads repo-root `.env` (parent of `app/`). Set `RPI_SSH_PASSWORD` there — used for all `ssh`/`scp`/`docker load` over SSH when key auth is unavailable. Never commit `.env`.

## Subpath (`/stonksos`) — build-time, not runtime

The Pi is served behind `https://orbits.pratish.dev/stonksos`. Next.js `basePath` and all `NEXT_PUBLIC_*` client values are **baked into the image at `npm run build`**. Setting `NEXT_PUBLIC_BASE_PATH` in Pi `.env` and restarting **does not** fix routing or client fetches — you get **404 on `/stonksos`**.

**Always build with:**

```bash
docker build --build-arg NEXT_PUBLIC_BASE_PATH=/stonksos -t ghcr.io/pratishbodhale/stonks-os-app:latest app/
```

`deploy.sh` does this automatically via `RPI_BASE_PATH` (default `/stonksos`). Override with `RPI_BASE_PATH=` (empty) for a root-hosted image (local dev only).

`public/firebase-messaging-sw.js` is **not committed** — it is generated during `npm run build` from `NEXT_PUBLIC_FIREBASE_*` in `app/.env.local`. Docker builds must see those values at **image build** time (same as `NEXT_PUBLIC_BASE_PATH`), not only in Pi runtime `.env`.

Also set on Pi `.env` (documentation + `NEXT_PUBLIC_APP_URL` alignment):

```
NEXT_PUBLIC_BASE_PATH=/stonksos
NEXT_PUBLIC_APP_URL=https://orbits.pratish.dev/stonksos
```

**Verify after deploy** (not the bare root — that 404s when base path is set):

```bash
curl -sI http://raspberrypi.local:3002/stonksos | head -1          # HTTP/1.1 200
curl -sI https://orbits.pratish.dev/stonksos | head -1             # HTTP/2 200
curl -sI http://raspberrypi.local:3002/stonksos/api/weekly-movers | head -1
```


## Before deploying

1. **Docker Desktop** running on the Mac (`/Applications/Docker.app/.../docker`).
2. **SSH access** to the Pi — `RPI_SSH_PASSWORD` in repo-root `.env` (loaded automatically by `deploy.sh` and agents using the same pattern).
3. **Ask permission** before running deploy commands if the user has not explicitly asked to deploy in this turn.
4. **Do not commit** `.env`, `firebase-credentials.json`, `public/firebase-messaging-sw.js`, or passwords.

## Quick deploy

From repo root:

```bash
.cursor/skills/deploy-rpi/scripts/deploy.sh
```

Options:

| Flag | Effect |
|------|--------|
| `--sync-compose` | Copy `rpi-docker-compose.yml` to Pi |
| `--sync-config` | Copy `app/.env.local` → Pi `.env` and `app/firebase-credentials.json` (updates URLs/paths for Pi) |
| `--push-ghcr` | Also `docker push` to GHCR (requires `gh auth token` + `write:packages`) |
| `--skip-build` | Skip local build; transfer existing image tag only |

## Manual workflow (if script fails)

```bash
export DOCKER=/Applications/Docker.app/Contents/Resources/bin/docker
export IMAGE=ghcr.io/pratishbodhale/stonks-os-app:latest
export RPI=pratishbodhale@raspberrypi.local

# 1. Build (from app/) — include base path for orbits.pratish.dev/stonksos
cd app && $DOCKER build --build-arg NEXT_PUBLIC_BASE_PATH=/stonksos -t "$IMAGE" . && cd ..

# 2. Transfer image
$DOCKER save "$IMAGE" | ssh "$RPI" docker load

# 3. Restart on Pi
ssh "$RPI" 'cd ~/stonks-os-app && docker compose up -d --force-recreate'

# 4. Verify
ssh "$RPI" 'cd ~/stonks-os-app && docker compose logs --tail 15'
curl -sI http://raspberrypi.local:3002/ | head -3
```

## Verify success

Logs should include:

- `[daily-scan-cron] Scheduler active — weekdays 16:30 IST`
- No `yahoo-finance2` Node version warning (image uses Node 24)
- `HTTP/1.1 200 OK` from `curl http://raspberrypi.local:3002/stonksos` (and public URL above)

Inside container: `node -v` → v24.x.

## Pi layout (persistent)

```
~/stonks-os-app/
├── docker-compose.yml
├── .env
├── firebase-credentials.json
└── data/              # SQLite bind mount (uid 1001 in container)
    └── scanner.db
```

If SQLite fails with `SQLITE_CANTOPEN`, fix ownership: `sudo chown -R 1001:1001 ~/stonks-os-app/data`.

`firebase-credentials.json` must be world-readable (`chmod 644`) so the container user (uid 1001) can read the bind mount. `deploy.sh` sets this on every deploy.

## Config-only updates (no rebuild)

Sync env/firebase and restart — **does not** change `NEXT_PUBLIC_BASE_PATH` (build-time only). Use for API keys, `NEXT_PUBLIC_APP_URL`, Firebase, etc.:

```bash
.cursor/skills/deploy-rpi/scripts/deploy.sh --sync-config --skip-build
```

If the public subpath changes, you **must** rebuild with a new `NEXT_PUBLIC_BASE_PATH` build arg.

## First-time Pi setup

If `~/stonks-os-app` does not exist:

```bash
.cursor/skills/deploy-rpi/scripts/deploy.sh --sync-compose --sync-config
```

Ensure `data/` exists and is owned by uid 1001 before first run.

## Reference

- Pi compose template: [scripts/rpi-docker-compose.yml](scripts/rpi-docker-compose.yml)
- App Docker docs: [app/README.md](../../../app/README.md)
