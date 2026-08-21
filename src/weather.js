// Weather data from the Norwegian Meteorological Institute (met.no).
// This lives in the Worker (not the browser) because met.no requires an
// identifying User-Agent header, which a browser fetch is not allowed to set.
//
// Two products are used:
//   - nowcast/2.0/complete       — radar-based real-time precipitation (Nordics),
//                                   the most accurate "is it raining right now".
//   - locationforecast/2.0/complete — air temperature and cloud cover, from which
//                                   we derive `sunny`.
// Each is fetched independently so one product failing only makes its own
// properties unknown. No caching: a spin happens ~twice a day, so a live call
// per prefetch is cheap.

const NOWCAST_URL = 'https://api.met.no/weatherapi/nowcast/2.0/complete';
const LOCATIONFORECAST_URL = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';
// met.no's terms require a unique, identifiable User-Agent with contact info.
const WEATHER_USER_AGENT = 'clave-party/1.0 (github.com/Vetleh/ClaveParty.github.io)';
const MAX_ATTEMPTS = 3; // total tries before giving up (caller then fails closed)

const DEFAULT_LAT = '59.9105'; // Kongens gate 12, Oslo
const DEFAULT_LON = '10.7422';
const DEFAULT_SUNNY_MAX_CLOUD = 20; // cloud_area_fraction (%) below which we call it sunny

function coords(env) {
  const lat = env.WEATHER_LAT || DEFAULT_LAT;
  const lon = env.WEATHER_LON || DEFAULT_LON;
  return `lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`;
}

function sunnyMaxCloud(env) {
  const raw = Number(env.WEATHER_SUNNY_MAX_CLOUD);
  return Number.isFinite(raw) ? raw : DEFAULT_SUNNY_MAX_CLOUD;
}

// Retry `fn` up to MAX_ATTEMPTS, logging per attempt. Throws the last error.
async function withRetries(fn, label) {
  let lastErr;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const value = await fn();
      console.info(`met.no ${label} ok`, { attempt });
      return value;
    } catch (err) {
      lastErr = err;
      console.warn(`met.no ${label} failed`, { attempt, error: String(err.message || err) });
    }
  }
  console.error(`met.no ${label} giving up`, {
    attempts: MAX_ATTEMPTS,
    error: String(lastErr?.message || lastErr),
  });
  throw lastErr;
}

// The `instant.details` object of the first timeseries entry, or throw.
async function fetchInstantDetails(url) {
  const res = await fetch(url, { headers: { 'User-Agent': WEATHER_USER_AGENT } });
  if (!res.ok) throw new Error(`met.no HTTP ${res.status}`);
  const data = await res.json();
  const details = data?.properties?.timeseries?.[0]?.data?.instant?.details;
  if (!details) throw new Error('met.no response missing instant details');
  return details;
}

// Current precipitation rate (mm/h) from the nowcast product. Throws on failure.
async function fetchNowcastRate(env) {
  return withRetries(async () => {
    const details = await fetchInstantDetails(`${NOWCAST_URL}?${coords(env)}`);
    const rate = details.precipitation_rate;
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      throw new Error('met.no response missing precipitation_rate');
    }
    return rate;
  }, 'nowcast');
}

// Temperature (°C) and cloud cover (%) from the locationforecast product.
async function fetchConditions(env) {
  return withRetries(async () => {
    const details = await fetchInstantDetails(`${LOCATIONFORECAST_URL}?${coords(env)}`);
    return { temperature: details.air_temperature, cloudCover: details.cloud_area_fraction };
  }, 'locationforecast');
}

// Returns true if it is currently precipitating at the configured location.
// Any precipitation (> 0 mm/h) counts as rain. Throws if met.no cannot be
// reached or parsed after MAX_ATTEMPTS — the route layer turns that into a
// fail-closed "assume rain". Kept for the /api/weather route.
export async function isRaining(env) {
  return (await fetchNowcastRate(env)) > 0;
}

// A data provider (see src/providers.js) exposing weather properties to the
// query language. Each met.no product is fetched independently and fails closed:
// on nowcast failure `raining` defaults to true (the meaningful safe default)
// while precipitationRate stays unknown; on locationforecast failure
// temperature/cloudCover/sunny stay unknown so any query on them evaluates false.
export const weatherProvider = {
  name: 'weather',
  properties: [
    { name: 'raining', type: 'boolean' },
    { name: 'precipitationRate', type: 'number' },
    { name: 'temperature', type: 'number' },
    { name: 'cloudCover', type: 'number' },
    { name: 'sunny', type: 'boolean' },
  ],
  async load(env) {
    const out = {};

    // Concurrent, and settled independently: one product failing (or retrying)
    // must not delay or discard the other. Sequential awaits would double the
    // worst-case wait, stalling the spin that is about to use this.
    const [rain, conditions] = await Promise.allSettled([
      fetchNowcastRate(env),
      fetchConditions(env),
    ]);

    if (rain.status === 'fulfilled') {
      out.precipitationRate = rain.value;
      out.raining = rain.value > 0;
    } else {
      out.raining = true; // fail closed: unknown rain is treated as rain
    }

    if (conditions.status === 'fulfilled') {
      const { temperature, cloudCover } = conditions.value;
      if (typeof temperature === 'number') out.temperature = temperature;
      if (typeof cloudCover === 'number') {
        out.cloudCover = cloudCover;
        out.sunny = cloudCover < sunnyMaxCloud(env);
      }
    }
    // On rejection temperature/cloudCover/sunny stay unknown -> fail closed.

    return out;
  },
};
