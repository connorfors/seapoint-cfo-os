#!/usr/bin/env bash
# Start a quick tunnel to the running dev server, then point headroom.cb-63a.workers.dev at it.
# Needs: `npm run dev` running, cloudflared, and `wrangler login` on the Cloop account.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
state="$HOME/.local/state/headroom"
mkdir -p "$state"
if [ -f "$state/tunnel.pid" ] && kill -0 "$(cat "$state/tunnel.pid")" 2>/dev/null; then
  kill "$(cat "$state/tunnel.pid")"
fi
nohup cloudflared tunnel --no-autoupdate --url http://127.0.0.1:4317 \
  --http-host-header 127.0.0.1:4317 >"$state/tunnel.log" 2>&1 &
echo $! >"$state/tunnel.pid"
url=""
for _ in $(seq 1 30); do
  url="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$state/tunnel.log" | head -1 || true)"
  [ -n "$url" ] && break
  sleep 1
done
[ -n "$url" ] || { echo "The tunnel did not start. Read $state/tunnel.log." >&2; exit 1; }
cd "$here"
npx --yes wrangler@4 deploy --var "TUNNEL_ORIGIN:$url"
echo "Tunnel: $url"
echo "Public: https://headroom.cb-63a.workers.dev"
