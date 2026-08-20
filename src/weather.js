// Rain check via the Norwegian Meteorological Institute (met.no) nowcast API.
// This lives in the Worker (not the browser) because met.no requires an
// identifying User-Agent header, which a browser fetch is not allowed to set.
// No caching: a spin happens ~twice a day, so a live call per prefetch is cheap.

const MET_URL = 'https://api.met.no/weatherapi/nowcast/2.0/complete';
// met.no's terms require a unique, identifiable User-Agent with contact info.
const WEATHER_USER_AGENT = 'clave-party/1.0 (github.com/Vetleh/ClaveParty.github.io)';
const MAX_ATTEMPTS = 3; // total tries before giving up (caller then fails closed)

const DEFAULT_LAT = '59.9105'; // Kongens gate 12, Oslo
const DEFAULT_LON = '10.7422';

// Returns true if it is currently precipitating at the configured location.
// Any precipitation (> 0 mm/h) counts as rain. Throws if met.no cannot be
// reached or parsed after MAX_ATTEMPTS — the route layer turns that into a
// fail-closed "assume rain".
export async function isRaining(env) {
  const lat = env.WEATHER_LAT || DEFAULT_LAT;
  const lon = env.WEATHER_LON || DEFAULT_LON;
  const url = `${MET_URL}?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;

  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': WEATHER_USER_AGENT } });
      if (!res.ok) throw new Error(`met.no HTTP ${res.status}`);
      const data = await res.json();
      const rate = data?.properties?.timeseries?.[0]?.data?.instant?.details?.precipitation_rate;
      if (typeof rate !== 'number' || !Number.isFinite(rate)) {
        throw new Error('met.no response missing precipitation_rate');
      }
      const raining = rate > 0;
      console.info('met.no nowcast ok', { attempt, rate, raining });
      return raining;
    } catch (err) {
      lastErr = err;
      console.warn('met.no nowcast failed', { attempt, error: String(err.message || err) });
    }
  }
  throw lastErr;
}
