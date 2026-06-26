import { getPresent, postCheckin } from './slack.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/present') {
      try {
        const present = await getPresent(env, new Date());
        return Response.json({ present });
      } catch (err) {
        // Never crash the screen: report empty + error, screen handles gracefully.
        return Response.json({ present: [], error: String(err.message || err) }, { status: 502 });
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
