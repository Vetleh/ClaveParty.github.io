// Worker-side storage for the latest LAN scan reported by the local agent.
// The Worker runs in Cloudflare's cloud and cannot reach the office network, so
// a small agent on-site (agent/scan-and-report.sh) scans and POSTs the device
// list here; we stash it in KV with a short TTL. If the agent stops reporting,
// the entry expires and network presence quietly drops to empty (Slack-only).

const NET_KEY = 'netpresence:current';
const DEFAULT_TTL_MINUTES = 20;

function ttlMinutes(env) {
  const v = Number(env.NETWORK_PRESENCE_TTL_MINUTES);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TTL_MINUTES;
}

// Validate + persist a reported scan. `now` is a Date (injectable for tests).
export async function storeScan(env, body, now) {
  if (!body || !Array.isArray(body.devices)) {
    throw new Error('body.devices must be an array');
  }
  const record = {
    devices: body.devices.map((d) => ({
      ip: String((d && d.ip) || ''),
      mac: String((d && d.mac) || ''),
      hostname: String((d && d.hostname) || ''),
    })),
    receivedAt: now.getTime(),
  };
  await env.KV.put(NET_KEY, JSON.stringify(record), { expirationTtl: ttlMinutes(env) * 60 });
  return record;
}

// Read the freshest scan; returns [] if missing or older than the TTL.
export async function getNetworkDevices(env, now) {
  const rec = await env.KV.get(NET_KEY, 'json');
  if (!rec || !Array.isArray(rec.devices)) return [];
  const ageMs = now.getTime() - (rec.receivedAt || 0);
  if (ageMs > ttlMinutes(env) * 60 * 1000) return []; // stale agent
  return rec.devices;
}
