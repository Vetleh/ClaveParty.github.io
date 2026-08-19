import { getPresent as getSlackPresent, postCheckin } from './slack.js';
import { getNetworkDevices, storeScan } from './network.js';
import { matchDevices, mergePresence } from './presence.js';
import { isRaining } from './weather.js';
import { people } from '../people.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/present') {
      const now = new Date();

      // Network presence is best-effort and never throws — a missing/stale scan
      // or a bad roster just yields no network-derived people.
      let networkPresent = [];
      try {
        const devices = await getNetworkDevices(env, now);
        networkPresent = matchDevices(devices, people).present;
      } catch {
        networkPresent = [];
      }

      // Slack presence may fail (token/channel/network). Capture, don't crash.
      let slackPresent = [];
      let slackError = null;
      try {
        slackPresent = await getSlackPresent(env, now);
      } catch (err) {
        slackError = String(err.message || err);
      }

      const present = mergePresence(networkPresent, slackPresent);

      // Only surface a hard failure when we truly have nobody to show.
      if (slackError && present.length === 0) {
        return Response.json({ present: [], error: slackError }, { status: 502 });
      }
      const body = { present };
      if (slackError) body.warning = slackError; // network carried us through
      return Response.json(body);
    }

    // Ingest a LAN scan from the on-site agent. Auth: shared bearer secret.
    if (url.pathname === '/api/network-presence') {
      if (request.method !== 'POST') {
        return Response.json({ error: 'method_not_allowed' }, { status: 405 });
      }
      if (!env.NETWORK_AGENT_TOKEN) {
        return Response.json({ error: 'agent_token_not_configured' }, { status: 503 });
      }
      const auth = request.headers.get('authorization') || '';
      if (auth !== `Bearer ${env.NETWORK_AGENT_TOKEN}`) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }
      let payload;
      try {
        payload = await request.json();
      } catch {
        return Response.json({ error: 'invalid_json' }, { status: 400 });
      }
      try {
        const record = await storeScan(env, payload, new Date());
        const matched = matchDevices(record.devices, people);
        return Response.json({
          ok: true,
          received: record.devices.length,
          present: matched.present.map((p) => p.id),
          unmatched: matched.unmatched,
        });
      } catch (err) {
        return Response.json({ error: String(err.message || err) }, { status: 400 });
      }
    }

    // Is it raining? Prefetched by the screen ~1 min before a spin so outdoor
    // activities can be dropped. Fail-closed: if met.no can't be reached we
    // report rain, so a spin never suggests going outside on a maybe-wet day.
    if (url.pathname === '/api/weather') {
      try {
        const raining = await isRaining(env);
        return Response.json({ raining });
      } catch {
        return Response.json({ raining: true });
      }
    }

    // Everything else: static assets (with default routing, the Worker is only
    // invoked for paths with no matching asset).
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(postCheckin(env, new Date()));
  },
};
