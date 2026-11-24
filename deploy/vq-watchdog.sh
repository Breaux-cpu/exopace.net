#!/bin/sh
# Host watchdog for terrawatch. Restarts that container only, and only after repeated health failure.
# Low disk runs the legacy builder prune. It does not remove images held by stopped rollbacks.
set -u
FAIL=/var/tmp/exopace-vq-watchdog.count
HEALTH=$(curl -fsS --max-time 5 http://127.0.0.1:3100/api/health 2>/dev/null || true)
OK=0
printf '%s' "$HEALTH" | grep -q '"ok":true' && printf '%s' "$HEALTH" | grep -q '"mongo":true' && OK=1
if [ "$OK" -eq 1 ]; then
  printf '0\n' > "$FAIL"
else
  N=0
  if [ -f "$FAIL" ]; then
    N=$(cat "$FAIL" 2>/dev/null || printf '0')
  fi
  N=$((N + 1))
  printf '%s\n' "$N" > "$FAIL"
  if [ "$N" -ge 3 ]; then
    docker restart terrawatch >/dev/null 2>&1 || true
    printf '0\n' > "$FAIL"
  fi
fi
AVAIL=$(df -P / | awk 'NR==2 { print $4 }')
if [ "${AVAIL:-0}" -lt 800000 ]; then
  docker builder prune -f >/dev/null 2>&1 || true
fi
exit 0
