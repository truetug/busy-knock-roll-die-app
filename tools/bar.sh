#!/bin/sh
# Finds the way to the BUSY Bar and prints the address to give to push.sh (or to curl): the bar itself when it is on this network,
# else a local port tunnelled through the jump host and the Raspberry Pi the bar is plugged into.
#
#   tools/bar.sh            print the address; start the tunnel if that is the way
#   tools/bar.sh --probe    only say how it is reachable ("direct", "tunnel" or "none"), start nothing
#
# Tried in this order, the first that answers wins:
#   $BAR                    set it to force an address
#   the last address found  (remembered in $TMPDIR/bar-address)
#   BAR_LAN                 the bar's usual address on the local network
#   busybar.local           the name the bar announces over mDNS
#   a sweep of this /24     anything that answers /api/version like a bar
#   a tunnel that is up     127.0.0.1:$BAR_PORT
#   a new tunnel            through $BAR_JUMP to $BAR_PI, where the bar is $BAR_BEHIND (only without --probe)
# Environment, or a file `.bar.env` in the project (see .bar.env.example; it is not committed): BAR, BAR_LAN, BAR_MDNS, BAR_JUMP,
# BAR_PI, BAR_BEHIND, BAR_PORT. A tunnel needs BAR_JUMP, BAR_PI and BAR_BEHIND. Exit code 1 when the bar can not be reached.
set -eu

root=$(cd "$(dirname "$0")/.." && pwd)
# shellcheck disable=SC1091
[ -f "$root/.bar.env" ] && . "$root/.bar.env"

lan=${BAR_LAN:-}                  # the bar's address on the local network, if it has a fixed one
mdns=${BAR_MDNS:-busybar.local}
jump=${BAR_JUMP:-}                # the jump host, when the bar is only reachable through one
pi=${BAR_PI:-}                    # the machine the bar is plugged into, as user@host
behind=${BAR_BEHIND:-}            # the bar's address as that machine sees it
port=${BAR_PORT:-18080}           # not 10080: browsers refuse it
memo=${TMPDIR:-/tmp}/bar-address

probe_only=0
[ "${1:-}" = "--probe" ] && probe_only=1

# Whether a BUSY Bar answers at the address: its /api/version names an "api_semver" (a status like 401 would not tell).
is_bar() {
  curl -s -m "${2:-2}" "http://$1/api/version" 2>/dev/null | grep -q api_semver
}

found() { # $1 address, $2 how
  echo "$1" > "$memo" 2>/dev/null || true
  if [ "$probe_only" = 1 ]; then echo "$2"; else echo "$1"; fi
  exit 0
}

if [ -n "${BAR:-}" ]; then
  is_bar "$BAR" 4 && found "$BAR" direct
  echo "bar: $BAR does not answer" >&2
  exit 1
fi

[ -f "$memo" ] && last=$(cat "$memo") && [ -n "$last" ] && is_bar "$last" && {
  case "$last" in 127.0.0.1:*) found "$last" tunnel ;; *) found "$last" direct ;; esac
}
[ -n "$lan" ] && is_bar "$lan" && found "$lan" direct
is_bar "$mdns" 3 && found "$mdns" direct

# A sweep of the local /24: a hundred requests at a time, a second each - a few seconds in all.
mine=$(ipconfig getifaddr en0 2>/dev/null || hostname -I 2>/dev/null | cut -d' ' -f1 || true)
if [ -n "$mine" ]; then
  prefix=${mine%.*}
  hit=$(seq 1 254 | xargs -P 100 -I{} sh -c "curl -s -m 1.5 http://$prefix.{}/api/version 2>/dev/null | grep -q api_semver && echo $prefix.{}" | head -n 1 || true)
  [ -n "$hit" ] && found "$hit" direct
fi

is_bar "127.0.0.1:$port" 3 && found "127.0.0.1:$port" tunnel

if [ "$probe_only" = 1 ]; then
  echo none
  exit 1
fi

if [ -z "$jump" ] || [ -z "$pi" ] || [ -z "$behind" ]; then
  echo "bar: not found on this network. If it is behind a jump host, set BAR_JUMP, BAR_PI and BAR_BEHIND (see .bar.env.example)" >&2
  exit 1
fi
echo "bar: not on this network, opening a tunnel through $jump" >&2
# ssh -f leaves a daemon that inherits this script's output; if that were the caller's pipe (push.sh reads our address from it) the
# caller would wait for the tunnel to end. So the daemon gets a log file of its own, which we show if it fails.
log=$(mktemp)
if ! ssh -f -N -o BatchMode=yes -o ConnectTimeout=8 -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=6 \
  -L "$port:$behind:80" -J "$jump" "$pi" </dev/null >"$log" 2>&1; then
  cat "$log" >&2
  # Say which hop it is: the jump host itself, or the Pi behind it.
  if ssh -o BatchMode=yes -o ConnectTimeout=8 "$jump" true </dev/null >/dev/null 2>&1; then
    echo "bar: the jump host $jump answers, but the Pi $pi behind it does not" >&2
  else
    echo "bar: the jump host $jump does not answer" >&2
  fi
  exit 1
fi
for _ in 1 2 3 4 5; do
  is_bar "127.0.0.1:$port" 3 && found "127.0.0.1:$port" tunnel
  sleep 1
done
echo "bar: the tunnel is up, but the bar does not answer behind it ($behind)" >&2
exit 1
