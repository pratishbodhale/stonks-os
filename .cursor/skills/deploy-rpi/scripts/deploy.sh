#!/usr/bin/env bash
# Deploy StonksOS app/ to Raspberry Pi via docker save | ssh docker load
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
APP_DIR="$ROOT/app"
SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Repo-root .env holds RPI_SSH_PASSWORD (never commit)
if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

RPI_SSH="${RPI_SSH:-pratishbodhale@raspberrypi.local}"
RPI_APP_DIR="${RPI_APP_DIR:-stonks-os-app}"
DOCKER_IMAGE="${DOCKER_IMAGE:-ghcr.io/pratishbodhale/stonks-os-app:latest}"
RPI_PORT="${RPI_PORT:-3002}"
RPI_BASE_PATH="${RPI_BASE_PATH:-/stonksos}"
RPI_APP_URL="${RPI_APP_URL:-https://orbits.pratish.dev${RPI_BASE_PATH}}"

if [[ -x "/Applications/Docker.app/Contents/Resources/bin/docker" ]]; then
  DOCKER="${DOCKER:-/Applications/Docker.app/Contents/Resources/bin/docker}"
else
  DOCKER="${DOCKER:-docker}"
fi

SYNC_COMPOSE=false
SYNC_CONFIG=false
PUSH_GHCR=false
SKIP_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --sync-compose) SYNC_COMPOSE=true ;;
    --sync-config) SYNC_CONFIG=true ;;
    --push-ghcr) PUSH_GHCR=true ;;
    --skip-build) SKIP_BUILD=true ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

remote() {
  local cmd="$1"
  if [[ -n "${RPI_SSH_PASSWORD:-}" ]] && command -v expect >/dev/null 2>&1; then
    expect <<EOF >/dev/null
set timeout 120
spawn ssh -o StrictHostKeyChecking=accept-new "$RPI_SSH" bash -lc "$cmd"
expect {
  -re "(?i)password:" { send "$RPI_SSH_PASSWORD\r"; exp_continue }
  eof
}
EOF
  else
    ssh -o StrictHostKeyChecking=accept-new "$RPI_SSH" bash -lc "$cmd"
  fi
}

remote_scp() {
  if [[ -n "${RPI_SSH_PASSWORD:-}" ]] && command -v expect >/dev/null 2>&1; then
    expect <<EOF >/dev/null
set timeout 120
spawn scp -o StrictHostKeyChecking=accept-new $1 "$RPI_SSH:$2"
expect {
  -re "(?i)password:" { send "$RPI_SSH_PASSWORD\r"; exp_continue }
  eof
}
EOF
  else
    scp -o StrictHostKeyChecking=accept-new "$1" "$RPI_SSH:$2"
  fi
}

echo "==> Ensuring remote directory ~/${RPI_APP_DIR}"
remote "mkdir -p ~/${RPI_APP_DIR}/data"

if $SYNC_COMPOSE; then
  echo "==> Syncing docker-compose.yml"
  remote_scp "$SKILL_DIR/scripts/rpi-docker-compose.yml" "~/${RPI_APP_DIR}/docker-compose.yml"
fi

if $SYNC_CONFIG; then
  echo "==> Syncing .env and firebase-credentials.json"
  if [[ ! -f "$APP_DIR/.env.local" ]]; then
    echo "Missing $APP_DIR/.env.local" >&2
    exit 1
  fi
  ENV_TMP="$(mktemp)"
  trap 'rm -f "$ENV_TMP"' EXIT
  cp "$APP_DIR/.env.local" "$ENV_TMP"
  {
    echo "DATA_DIR=/app/data"
    echo "FIREBASE_CREDENTIALS=/app/firebase-credentials.json"
    echo "DAILY_SCAN_CRON_ENABLED=true"
    echo "PORT=${RPI_PORT}"
    echo "NEXT_PUBLIC_APP_URL=${RPI_APP_URL}"
    if [[ -n "${RPI_BASE_PATH}" ]]; then
      echo "NEXT_PUBLIC_BASE_PATH=${RPI_BASE_PATH}"
    fi
  } >> "$ENV_TMP"
  # Drop host-only paths that break in-container
  sed -i.bak '/^FIREBASE_CREDENTIALS=\.\//d' "$ENV_TMP" && rm -f "${ENV_TMP}.bak"
  remote_scp "$ENV_TMP" "~/${RPI_APP_DIR}/.env"
  remote_scp "$APP_DIR/firebase-credentials.json" "~/${RPI_APP_DIR}/firebase-credentials.json"
  remote "chmod 644 ~/${RPI_APP_DIR}/firebase-credentials.json 2>/dev/null || true; chmod 600 ~/${RPI_APP_DIR}/.env 2>/dev/null || true"
fi

if ! $SKIP_BUILD; then
  echo "==> Building $DOCKER_IMAGE from app/ (NEXT_PUBLIC_BASE_PATH=${RPI_BASE_PATH:-<none>})"
  BUILD_ARGS=()
  if [[ -n "${RPI_BASE_PATH}" ]]; then
    BUILD_ARGS+=(--build-arg "NEXT_PUBLIC_BASE_PATH=${RPI_BASE_PATH}")
  fi
  (cd "$APP_DIR" && "$DOCKER" build "${BUILD_ARGS[@]}" -t "$DOCKER_IMAGE" .)
fi

if $PUSH_GHCR; then
  echo "==> Pushing to GHCR"
  if ! command -v gh >/dev/null 2>&1; then
    echo "gh CLI required for --push-ghcr" >&2
    exit 1
  fi
  gh auth token | "$DOCKER" login ghcr.io -u "${RPI_SSH%%@*}" --password-stdin
  "$DOCKER" push "$DOCKER_IMAGE"
fi

echo "==> Transferring image to Pi (this may take a few minutes)"
if command -v sshpass >/dev/null 2>&1 && [[ -n "${RPI_SSH_PASSWORD:-}" ]]; then
  "$DOCKER" save "$DOCKER_IMAGE" | sshpass -p "$RPI_SSH_PASSWORD" ssh -o StrictHostKeyChecking=accept-new "$RPI_SSH" docker load
elif [[ -n "${RPI_SSH_PASSWORD:-}" ]] && command -v expect >/dev/null 2>&1; then
  expect <<EOF
set timeout 600
spawn bash -c "$DOCKER save $DOCKER_IMAGE | ssh -o StrictHostKeyChecking=accept-new $RPI_SSH docker load"
expect {
  -re "(?i)password:" { send "$RPI_SSH_PASSWORD\r"; exp_continue }
  eof
}
EOF
else
  "$DOCKER" save "$DOCKER_IMAGE" | ssh -o StrictHostKeyChecking=accept-new "$RPI_SSH" docker load
fi

echo "==> Fixing data dir ownership (uid 1001), Firebase creds perms, and restarting"
remote "sudo chown -R 1001:1001 ~/${RPI_APP_DIR}/data 2>/dev/null || true; chmod 644 ~/${RPI_APP_DIR}/firebase-credentials.json 2>/dev/null || true; cd ~/${RPI_APP_DIR} && docker compose up -d --force-recreate"

echo "==> Waiting for startup"
sleep 8

echo "==> Status"
remote "cd ~/${RPI_APP_DIR} && docker compose ps && docker compose exec scanner node -v && docker compose logs --tail 12"

echo "==> HTTP check"
CHECK_PATH="${RPI_BASE_PATH:-/}"
CHECK_PATH="${CHECK_PATH%/}"
CHECK_PATH="${CHECK_PATH:-/}"
if curl -sfI "http://raspberrypi.local:${RPI_PORT}${CHECK_PATH}" | head -3; then
  echo "Deploy OK — ${RPI_APP_URL}"
else
  echo "Warning: HTTP check failed for http://raspberrypi.local:${RPI_PORT}${CHECK_PATH}; inspect logs on Pi" >&2
  exit 1
fi
