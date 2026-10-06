#!/bin/sh
# Uploads the built package (dist/<app id>/) to a BUSY Bar over its HTTP API.
# usage: tools/push.sh [bar address [api token]]   e.g. tools/push.sh 192.168.1.20 <token>
# Without an address it asks tools/bar.sh, which knows whether the bar is on this network or behind the jump host.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
addr=${1:-$(sh "$root/tools/bar.sh")}
token=${2:-${BAR_TOKEN:-}}
id=$(jq -er .id "$root/src/appmeta/manifest.json")
dist="$root/dist/$id"

[ -d "$dist" ] || { echo "no $dist - run 'pnpm build' first" >&2; exit 1; }

# A file the bar is playing cannot be overwritten: take the app's pictures off the screen first.
curl -fsS -m 10 -X DELETE "http://$addr/api/display/draw?application_name=$id" ${token:+-H "X-API-Token: $token"} >/dev/null || true

cd "$dist"
find . -type f | sed 's|^\./||' | while read -r file; do
  printf '%s ' "$file"
  curl -fsS -m 60 -X POST "http://$addr/api/assets/upload?application_name=$id&file=$file" \
    ${token:+-H "X-API-Token: $token"} --data-binary @"$file"
  echo
done
