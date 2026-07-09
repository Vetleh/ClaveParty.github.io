---
name: verify
description: Build/launch/drive recipe for verifying changes to the office activity wheel app at runtime
---

# Verifying this app

## Launch

```
npx wrangler dev --port 8787 --local
```

Run it in the background; ready when the log says `Ready on http://127.0.0.1:8787`.
Serves the static frontend from `public/` plus the Worker API (`/api/present` etc.)
with local KV (empty roster).

## Drive (Playwright MCP)

- `http://127.0.0.1:8787/` — idle view: heading, next-draw label, hint.
- `http://127.0.0.1:8787/?test=1` — test mode: shows a **Spin now (test)** button
  (or press **S**) that starts a round immediately. With an empty roster, test mode
  falls back to a 3-person demo roster, so the full countdown → wheel → result flow
  works offline.
- Full round takes `countdownSeconds` (config.json) + ~`spinSeconds` — wait that
  long before expecting the result view.
- Scheduling state lives in `localStorage`: `ranKeys` (JSON array of
  `YYYY-MM-DDTHH:MM` keys, marks spins already run) and `lastActivity`. Seed
  `ranKeys` with today's times to exercise rollover; `localStorage.clear()` when done.
- Current view is `document.getElementById('state').dataset.state`
  (idle / announcing / spinning / result / nobody).

## Gotchas

- `/favicon.ico` 404s in the console — pre-existing, ignore.
- Scheduled spins only fire while the state is `idle`, on a `pollSeconds` (20s) tick.
