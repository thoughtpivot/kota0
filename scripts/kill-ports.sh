#!/usr/bin/env bash
# Kill any processes occupying the ports used by the Kota0 dev stack.
# Run before start:workspace to ensure a clean slate.

PORTS=(3000 3001 3002 3030 4000)

for port in "${PORTS[@]}"; do
  pids=$(lsof -ti ":$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Killing port $port (pids: $pids)"
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
done

echo "Ports cleared: ${PORTS[*]}"
