// Pure network-presence logic: map scanned devices to known people, and merge
// network-derived presence with Slack-reaction presence. No DOM, no Node, no
// Worker APIs — trivially unit-testable.
//
// Why hostname-first matching: phones and laptops randomize their Wi-Fi MAC
// address (a new MAC per network/rotation), so a MAC is NOT a stable identity.
// The device's advertised mDNS/Bonjour hostname ("Karine-sin-MBP", "Vetles-MacBook")
// is stable across reboots and MAC rotation, so we match on that first and treat
// a fixed MAC as an optional secondary signal (useful for things that never
// randomize: printers, TVs, access points).

export function normalizeHostname(hostname) {
  if (!hostname) return '';
  let s = String(hostname).trim().toLowerCase();
  s = s.replace(/\.$/, ''); // trailing dot from FQDNs
  // strip common local-network suffixes so "Mac.localdomain" === "mac"
  s = s.replace(/\.(local|localdomain|lan|home|internal)$/i, '');
  return s;
}

export function normalizeMac(mac) {
  if (!mac) return '';
  const hex = String(mac).toLowerCase().replace(/[^0-9a-f]/g, '');
  if (hex.length !== 12) return '';
  return hex.match(/.{2}/g).join(':');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A glob-ish hostname matcher: case-insensitive, supports "*" wildcards.
// e.g. "karine-sin-mbp*" matches "Karine-sin-MBP" and "Karine-sin-MBP-2".
export function hostnameMatches(pattern, normalizedHost) {
  if (!normalizedHost) return false;
  const p = normalizeHostname(pattern);
  if (!p) return false;
  if (!p.includes('*')) return p === normalizedHost;
  const re = new RegExp('^' + p.split('*').map(escapeRegex).join('.*') + '$');
  return re.test(normalizedHost);
}

function personMatchesDevice(person, nHost, nMac) {
  const m = person.match || {};
  const hostnames = m.hostnames || [];
  const macs = (m.macs || []).map(normalizeMac).filter(Boolean);
  if (nHost && hostnames.some((pat) => hostnameMatches(pat, nHost))) return true;
  if (nMac && macs.includes(nMac)) return true;
  return false;
}

// Map raw scanned devices [{ip, mac, hostname}] onto the people roster.
// Returns:
//   present:   [{ id, name, avatar, slackId, sources:['network'], devices:[...] }]
//   unmatched: [{ ip, mac, hostname }]  — identifiable devices nobody claims yet
export function matchDevices(devices, people) {
  const byPerson = new Map(); // person.id -> { person, devices: [] }
  const unmatched = [];

  for (const device of devices || []) {
    const nHost = normalizeHostname(device.hostname);
    const nMac = normalizeMac(device.mac);
    if (!nHost && !nMac) continue; // pure noise (no identity at all)

    const person = (people || []).find((p) => personMatchesDevice(p, nHost, nMac));
    if (!person) {
      unmatched.push({ ip: device.ip || '', mac: device.mac || '', hostname: device.hostname || '' });
      continue;
    }
    if (!byPerson.has(person.id)) byPerson.set(person.id, { person, devices: [] });
    byPerson.get(person.id).devices.push({
      ip: device.ip || '',
      mac: device.mac || '',
      hostname: device.hostname || '',
    });
  }

  const present = [...byPerson.values()].map(({ person, devices: matched }) => ({
    id: person.id,
    name: person.name,
    avatar: person.avatar || null,
    slackId: person.slackId || null,
    sources: ['network'],
    devices: matched,
  }));

  return { present, unmatched };
}

// Union the two presence sources into one list. A person known to both sources
// (linked via people roster `slackId`) collapses into a single entry tagged with
// both sources. Network entries win on name; Slack fills in a missing avatar.
export function mergePresence(networkPresent = [], slackPresent = []) {
  const out = new Map();

  for (const n of networkPresent) {
    out.set(`person:${n.id}`, {
      id: n.id,
      name: n.name,
      avatar: n.avatar || null,
      sources: ['network'],
      slackId: n.slackId || null,
      devices: n.devices || [],
    });
  }

  for (const s of slackPresent) {
    const linked = [...out.values()].find((e) => e.slackId && e.slackId === s.id);
    if (linked) {
      if (!linked.sources.includes('slack')) linked.sources.push('slack');
      if (!linked.avatar) linked.avatar = s.avatar || null;
      continue;
    }
    out.set(`slack:${s.id}`, {
      id: s.id,
      name: s.name,
      avatar: s.avatar || null,
      sources: ['slack'],
    });
  }

  // Drop the internal slackId before returning.
  return [...out.values()].map(({ slackId, ...rest }) => rest);
}
