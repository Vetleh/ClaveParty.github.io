# Office Activity Engagement Screen — Design Spec

**Date:** 2026-06-26
**Status:** Approved design, pre-implementation
**Repo:** `ClaveParty.github.io`

## Summary

An always-on office screen that, twice a day, randomly selects an activity from a
curated list and a present employee to carry it out. Presence is established by
employees reacting with an emoji to a daily Slack check-in message. At each
scheduled time the screen plays an announcement sound, runs a 30-second countdown,
then "spins a wheel" to reveal the chosen person and activity. The chosen person
can accept or skip; skipping re-picks a different present person while keeping the
same activity.

The whole thing is one Cloudflare Worker (static assets + API + cron + KV) deployed
from this Git repository. Activities are curated as a JSON file in the repo.

## Goals

- Encourage social engagement with near-zero daily friction.
- Curating activities is as easy as editing a JSON file and pushing.
- Publicly accessible on the internet, no login required to view.
- Slack credentials never reach the browser.
- Reliable enough to run unattended on an office TV all day.

## Non-Goals

- No multi-screen real-time synchronization (single authoritative office screen only).
- No per-user accounts, authentication, or profiles beyond what Slack provides.
- No historical analytics dashboard (a minimal last-activity memory is the only history).
- No mobile-first / responsive design beyond what's convenient; the target is a TV.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| How do people check in? | React with an emoji (✅) to a daily Slack bot message. |
| Where does the screen run? | One always-on office screen (TV/kiosk). No cross-device sync. |
| Where does the activity list live? | `activities.json` committed to the Git repo; edit = commit + auto-deploy. |
| Skip behavior | Re-pick a different present person, keep the same activity; exclude the skipper from that round. |
| Hosting | Single Cloudflare Worker with static assets, KV, and a cron trigger. |
| Screen tech | Plain HTML/CSS/JS, no framework, no build step. |

## Architecture

### Topology

A single Cloudflare Worker is the only deployable unit:

- **Static assets** — serves the screen (`index.html`, CSS, JS) plus `activities.json`
  and `config.json` directly from the asset bundle.
- **`fetch()` handler** — serves `/api/*` endpoints. Routes not under `/api/` fall
  through to static assets.
- **`scheduled()` handler** — the daily cron that posts the Slack check-in message.
- **KV binding** — small persistent state (today's Slack message reference, user-name cache).
- **Secret** — the Slack bot token, set via `wrangler secret put`, never exposed to the client.

Deployed from this GitHub repo via Cloudflare Workers Builds; a push to `main`
auto-deploys. Reachable on a `*.workers.dev` URL or a custom domain.

### Components

| Component | Responsibility | Location |
|---|---|---|
| Screen app | Watches local clock; runs countdown; spins wheel; plays sound; renders result and Skip/Accept controls; idle standby between spins. | Static `index.html` + `app.js` + `styles.css` |
| `activities.json` | Curated activity list. | Repo, served statically |
| `config.json` | Spin times, timezone, Slack channel id, check-in emoji, countdown seconds, sound file path. | Repo, served statically |
| Selection logic | Pure function `pick(present, activities, lastActivity, excluded) → {person, activity}`. | `selection.js` (shared/testable) |
| Cron handler | Posts the Slack check-in message each morning; stores message `ts` + channel in KV. | Worker `scheduled()` |
| `GET /api/present` | Reads reactions on today's message via Slack; returns present people. | Worker `fetch()` |
| KV namespace | `checkin:<YYYY-MM-DD>` → `{channel, ts}`; `user:<id>` → `{name, avatar}` cache. | Cloudflare KV |
| Slack app | Bot token with `chat:write`, `reactions:read`, `channels:history`, `users:read`; bot is a channel member. | Slack |
| Network agent | On-site script that scans the office LAN and POSTs the device list to the Worker (the Worker can't reach the LAN). | `agent/scan-and-report.sh` |
| `people.js` | Roster mapping device hostnames/MACs → people; imported by the Worker, not served. | Repo |
| `POST /api/network-presence` | Agent ingest (bearer-auth); stores latest scan in KV with a short TTL. | Worker `fetch()` |

## Data Flow — A Day in the Life

1. **Morning (cron fires):** Worker `scheduled()` calls Slack `chat.postMessage` to the
   configured channel: *"☀️ React with ✅ if you're in the office today!"*. It stores the
   returned `{channel, ts}` in KV under `checkin:<today>`.
2. **Through the day:** employees react ✅ to that message in Slack.
3. **Spin time (screen's local clock, e.g. 10:30 and 14:30 Europe/Oslo):**
   1. Screen plays the announcement sound.
   2. 30-second countdown animation.
   3. Screen calls `GET /api/present`.
   4. Worker reads `checkin:<today>` from KV, calls Slack `reactions.get` for that
      message, filters reactors by the configured emoji, resolves user ids to display
      names/avatars (KV-cached), and returns `[{id, name, avatar}]`.
   5. Screen runs `pick()` and animates the wheel to land on the chosen person + activity.
   6. Result announced on screen.
4. **Skip:** chosen person taps **"Skip / can't right now"** → that person id is added to
   `excluded` for this round → wheel re-spins for a new person, **same activity**. If the
   pool empties, show a friendly "everyone's busy 😅" message.
5. **Accept ("I'm on it!"):** record the chosen activity as `lastActivity` (to avoid an
   immediate repeat) and the spin as completed for today; return to idle standby until the
   next spin.

## Selection Logic

> **Superseded (2026-08-20).** Which activities are *eligible* is now decided by a
> `betingelse` query on each activity, evaluated in the Worker — see
> `2026-08-20-activity-query-language-design.md`. The `pick` behaviour below still
> holds; it just receives an already-filtered pool.

Pure, framework-free, unit-testable:

```
pick(present, activities, lastActivity, excluded):
  candidates = present without anyone in `excluded`
  if candidates is empty: return { person: null, activity: <kept activity> }
  activity = if lastActivity and >1 activity available:
               random activity != lastActivity
             else random activity
  person = uniform random from candidates
  return { person, activity }
```

- On a fresh spin both person and activity are chosen.
- On a skip re-spin, the caller passes the already-chosen activity through unchanged and
  only the person is re-rolled.
- Fairness: uniform random over present candidates. (No weighting by past selection in v1.)

## Data Shapes

### `activities.json`

> **Superseded (2026-08-20).** The shipped shape uses `aktiviteter` with
> `id`/`kategori`/`tekst` plus an optional `betingelse` condition — see
> `2026-08-20-activity-query-language-design.md`.

```json
{
  "activities": [
    { "title": "Coffee run ☕", "description": "Grab orders and make a fresh pot." },
    { "title": "2-minute stretch 🧘", "description": "Lead a quick desk-stretch break." }
  ]
}
```

- Flat array of objects. `title` required, `description` optional.

### `config.json`

```json
{
  "spinTimes": ["10:30", "14:30"],
  "timezone": "Europe/Oslo",
  "countdownSeconds": 30,
  "checkInEmoji": "white_check_mark",
  "slackChannel": "C0XXXXXXX",
  "soundFile": "/assets/announce.mp3"
}
```

### KV entries

- `checkin:<YYYY-MM-DD>` → `{ "channel": "C0XXXXXXX", "ts": "1719400000.000100" }`
- `user:<slackUserId>` → `{ "name": "Alice", "avatar": "https://..." }` (cached)

### `GET /api/present` response

```json
{ "present": [ { "id": "U01", "name": "Alice", "avatar": "https://...", "sources": ["slack"] } ] }
```

`sources` is `["slack"]`, `["network"]`, or both. If Slack fails but network presence
is available, the response is still `200` with an added `"warning"` field; only an empty
result from a Slack failure returns `502`.

## Network Presence (added after initial approval)

Presence has two sources, unioned by `/api/present`:

1. **Slack** — ✅ reactions (above).
2. **Network** — devices seen on the office LAN, mapped to people.

**Why an agent:** the Worker runs in Cloudflare and cannot reach the office LAN, so a
small script (`agent/scan-and-report.sh`) on an always-on on-site machine ping-sweeps the
`/24`, resolves each device's reverse-DNS + mDNS hostname, and POSTs `[{ip, mac, hostname}]`
to `POST /api/network-presence` (bearer-auth via the `NETWORK_AGENT_TOKEN` secret). The
Worker stores the scan in KV under `netpresence:current` with a TTL of
`NETWORK_PRESENCE_TTL_MINUTES` (default 20); a stopped agent therefore decays to
Slack-only presence rather than showing stale people.

**Matching (rotation-proof):** modern phones/laptops randomize their Wi-Fi MAC, so MAC is
not a stable identity. The mDNS/Bonjour **hostname** *is* stable, so `people.js` matches
on hostname patterns first (case-insensitive, `*` wildcard), with an optional exact-MAC
fallback for gear that never randomizes (printers, TVs, APs). A person's `slackId` links
their two presence sources into one entry. Matching is a pure function (`src/presence.js`),
unit-tested independently of Slack and KV. Devices that match nobody are returned as an
`unmatched` list to make extending the roster easy.

## Error Handling & Edge Cases

- **Nobody checked in** → `present` empty → screen skips the spin and shows
  "no one's checked in yet."
- **Slack unreachable** → return cached present list if available; otherwise the screen
  shows a gentle error and never crashes.
- **Cron missed / no message for today** → `GET /api/present` lazily posts the check-in
  message and stores its `ts` on the first call of the day, so the day still works.
- **Double-fire on reload** → screen records in `localStorage` which of today's spins have
  already run (keyed by date + spin time), so a page refresh doesn't replay a spin.
- **Backgrounded-tab timer throttling** → screen must run fullscreen/kiosk in the
  foreground; documented as a setup requirement.
- **Cron is UTC (DST drift)** → Cloudflare cron triggers are UTC; the morning post may
  drift ~1h across DST. Acceptable for a "good morning" message; pin to a fixed UTC time.
- **Empty candidate pool after skips** → friendly "everyone's busy 😅"; the round ends
  without an assignee.

## Security & Access

- Screen and `/api/present` are public; `/api/present` only reveals who reacted to a public
  Slack message (low sensitivity).
- The Slack bot token is a Worker secret, never sent to the browser.
- No write endpoints exposed to the public beyond the read-only present list. The cron is
  internal; the lazy-post fallback is the only client-triggerable Slack write and it is
  idempotent per day (guarded by the KV `checkin:<today>` key).

## Testing Strategy

- **Unit:** `pick()` — fairness over candidates, exclusion honored, no immediate activity
  repeat, empty-pool returns no person while keeping the activity.
- **Worker handlers (mocked Slack):** cron stores `{channel, ts}` in KV; `/api/present`
  parses `reactions.get`, filters by emoji, resolves and caches user names; lazy-post
  fallback fires only when today's key is missing.
- **Manual trigger:** a hidden dev affordance (`?test=1` query param or a keypress) fires a
  spin on demand without waiting for the scheduled clock — used for demos and verification.

## Deployment

- `wrangler.jsonc` defines: `assets.directory`, the KV namespace binding, and
  `triggers.crons` for the morning post.
- Slack bot token set via `wrangler secret put SLACK_BOT_TOKEN` (or the dashboard).
- GitHub repo connected to Cloudflare Workers Builds; push to `main` auto-deploys.
- Optional custom domain; otherwise the `*.workers.dev` URL is the public address.

## Open Items / Future Enhancements (not in v1)

- Optional Slack DM/mention to the chosen person when picked (currently screen + sound only).
- Weighted fairness so people picked recently are less likely to be picked again.
- A lightweight history view of past activities and participants.
