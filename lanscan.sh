#!/usr/bin/env bash
# Scan the local /24 for live hosts; resolve names (reverse-DNS + mDNS/Bonjour)
# and vendor (offline OUI lookup via nmap's database). No sudo required.
# Usage: lanscan [subnet-prefix]   e.g. lanscan 10.0.0   (defaults to en0's /24)
set -u

PREFIX="${1:-$(ipconfig getifaddr en0 | cut -d. -f1-3)}"
OUI=""
for f in /opt/homebrew/share/nmap/nmap-mac-prefixes /usr/local/share/nmap/nmap-mac-prefixes; do
  [ -f "$f" ] && OUI="$f" && break
done
echo "Scanning ${PREFIX}.0/24 ..."

# 1) Ping-sweep in parallel to populate the ARP cache.
for i in $(seq 1 254); do
  ping -c1 -W1 "${PREFIX}.${i}" >/dev/null 2>&1 &
done
wait

# vendor_for MAC -> prints vendor, "(randomized MAC)", or ""
vendor_for() {
  local mac="$1" first oui
  first=$(printf '%s' "$mac" | cut -d: -f1)
  # locally-administered bit set (2,6,a,e as 2nd nibble) => randomized/private
  case "$first" in
    ?[26aeAE]) echo "(randomized MAC)"; return;;
  esac
  [ -z "$OUI" ] && return
  # build zero-padded 6-hex-digit prefix from first 3 octets
  oui=$(printf '%s' "$mac" | awk -F: '{printf "%02s%02s%02s", $1,$2,$3}' | tr 'a-z' 'A-Z' | tr ' ' '0')
  grep -i "^$oui " "$OUI" | head -1 | cut -d' ' -f2-
}

# 2) Read ARP -> IP + MAC, skip multicast/broadcast, resolve vendor + name.
printf "\n%-15s %-18s %-22s %s\n" "IP" "MAC" "VENDOR" "NAME"
printf "%-15s %-18s %-22s %s\n" "---------------" "------------------" "----------------------" "--------------------"

arp -an | awk '/\(/{gsub(/[()]/,"",$2); gsub(/[()]/,"",$4); print $2, $4}' | sort -t. -k4 -n | while read -r ip mac; do
  o1=${ip%%.*}; o2=$(echo "$ip" | cut -d. -f2); lasto=${ip##*.}
  [ "$o1" -ge 224 ] && continue                      # multicast (224-239) / reserved
  [ "$o1.$o2" = "169.254" ] && continue              # link-local (e.g. metadata svc)
  [ "$lasto" = "255" ] && continue                   # broadcast
  [ "$mac" = "incomplete" ] && mac=""                # no ARP entry -> blank, keep only if named

  name=$(host "$ip" 2>/dev/null | awk '/domain name pointer/{sub(/\.$/,"",$NF); print $NF; exit}')
  if [ -z "$name" ]; then
    name=$(dns-sd -timeout 1 -Q "$(echo "$ip" | awk -F. '{print $4"."$3"."$2"."$1".in-addr.arpa"}')" PTR 2>/dev/null \
      | awk '/PTR/{print $NF; exit}' | sed 's/\.$//')
  fi

  # drop pure noise: no MAC and no name
  [ -z "$mac" ] && [ -z "$name" ] && continue

  printf "%-15s %-18s %-22s %s\n" "$ip" "${mac:-—}" "$(vendor_for "$mac")" "${name:-<unknown>}"
done
