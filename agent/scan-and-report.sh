#!/usr/bin/env bash
# Office presence agent: scan the local network and POST the device list to the
# ClaveParty Worker, which maps devices -> people (people.js) for /api/present.
#
# Run this on an always-on machine ON the office LAN (the office screen/kiosk is
# ideal). The Worker lives in Cloudflare's cloud and cannot scan the LAN itself.
#
# Required env:
#   WORKER_URL          e.g. https://claveparty.<account>.workers.dev
#   NETWORK_AGENT_TOKEN must match the Worker secret (wrangler secret put NETWORK_AGENT_TOKEN)
# Optional env:
#   SUBNET              /24 prefix to scan (default: en0's subnet, e.g. 10.0.0)
#   IFACE               interface to derive the subnet from (default: en0)
#   LOOP_SECONDS        if set (>0), scan repeatedly every N seconds; else scan once
#   DRY_RUN             if set, print the JSON payload instead of POSTing
#
# Examples:
#   WORKER_URL=https://claveparty.example.workers.dev NETWORK_AGENT_TOKEN=secret ./scan-and-report.sh
#   LOOP_SECONDS=300 WORKER_URL=... NETWORK_AGENT_TOKEN=... ./scan-and-report.sh   # every 5 min
set -u

IFACE="${IFACE:-en0}"
PREFIX="${SUBNET:-$(ipconfig getifaddr "$IFACE" 2>/dev/null | cut -d. -f1-3)}"
: "${PREFIX:?Could not determine subnet; set SUBNET=10.0.0 (or IFACE=...)}"

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

scan_once() {
  # 1) Parallel ping sweep populates the ARP cache.
  local i
  for i in $(seq 1 254); do ping -c1 -W1 "${PREFIX}.${i}" >/dev/null 2>&1 & done
  wait

  # 2) Build a JSON array of {ip, mac, hostname} from ARP + reverse-DNS + mDNS.
  local rows
  rows=$(arp -an | awk '/\(/{gsub(/[()]/,"",$2); gsub(/[()]/,"",$4); print $2, $4}' \
    | sort -t. -k4 -n -u | while read -r ip mac; do
      local o1 lasto host esc
      o1=${ip%%.*}; lasto=${ip##*.}
      [ "$o1" -ge 224 ] && continue        # multicast / reserved
      [ "$lasto" = "255" ] && continue     # broadcast
      [ "$mac" = "incomplete" ] && mac=""
      host=$(host "$ip" 2>/dev/null | awk '/domain name pointer/{sub(/\.$/,"",$NF); print $NF; exit}')
      if [ -z "$host" ]; then
        host=$(dns-sd -timeout 1 -Q "$(echo "$ip" | awk -F. '{print $4"."$3"."$2"."$1".in-addr.arpa"}')" PTR 2>/dev/null \
          | awk '/PTR/{print $NF; exit}' | sed 's/\.$//')
      fi
      [ -z "$mac" ] && [ -z "$host" ] && continue   # no identity -> skip
      esc=$(json_escape "$host")
      printf '{"ip":"%s","mac":"%s","hostname":"%s"}\n' "$ip" "$mac" "$esc"
    done | paste -sd, -)

  local payload="{\"devices\":[${rows}]}"

  if [ -n "${DRY_RUN:-}" ]; then
    printf '%s\n' "$payload"
    return 0
  fi

  : "${WORKER_URL:?set WORKER_URL}"
  : "${NETWORK_AGENT_TOKEN:?set NETWORK_AGENT_TOKEN}"
  curl -fsS -X POST "${WORKER_URL%/}/api/network-presence" \
    -H "Authorization: Bearer ${NETWORK_AGENT_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$payload" && echo
}

if [ -n "${LOOP_SECONDS:-}" ] && [ "${LOOP_SECONDS}" -gt 0 ] 2>/dev/null; then
  echo "Reporting ${PREFIX}.0/24 every ${LOOP_SECONDS}s (Ctrl-C to stop)..."
  while true; do
    scan_once || echo "scan/report failed; will retry"
    sleep "$LOOP_SECONDS"
  done
else
  scan_once
fi
