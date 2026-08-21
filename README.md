# Clave Party — Office Activity Wheel

An always-on office screen that twice a day picks a random activity and a present
employee to do it. Presence comes from two sources, merged:
1. **Slack** — reacting with ✅ to the daily check-in message.
2. **Network** — being on the office Wi-Fi (your laptop/phone is seen on the LAN).

## How it works
- A Cloudflare Worker serves the screen and runs a daily cron that posts the Slack
  check-in message.
- The screen (a browser in kiosk/fullscreen on the office TV) watches the clock and,
  at each configured spin time, plays a sound, counts down 30s, then spins a wheel to
  pick a present person + activity.
- The chosen person taps **I'm on it!** or **Skip / can't right now** (re-picks a
  different person, same activity).
- About a minute before each spin the screen asks the Worker which activities are
  eligible (`/api/activities`). The Worker gathers the current conditions — date/time
  plus weather from met.no — and keeps only the activities whose `betingelse`
  condition holds. Anything unknown (met.no unreachable, say) makes a condition
  false, so a rain-dependent activity drops out rather than sending people out on a
  maybe-wet day.

## Edit the activities
Edit `public/activities.json` and push to `main`. Auto-deploys in seconds.

Each activity has an `id`, a `kategori` (shown on screen), the `tekst` itself, an
optional `betingelse` — a condition that must hold for the activity to be eligible —
and an optional `vekting`. Leave `betingelse` out and the activity always applies.

```jsonc
{ "id": "sommer-01", "kategori": "Sommerspesial", "tekst": "Ta med gjengen ut i sola…",
  "betingelse": "month gte 6 and month lte 7 and raining eq false", "vekting": 5 }
```

`vekting` is the relative likelihood of being drawn among the activities eligible right
now — a positive number, 1 when the field is left out. The conditional activities ship
at `vekting: 5`, so a summer special is five times as likely as an everyday activity
during the short window it is eligible. Everything else is left at the default.

Properties you can use: `month` (1-12), `hour` (0-23), `weekday` (1=Mon…7=Sun),
`dateISO`, `raining`, `precipitationRate`, `temperature` (°C), `cloudCover` (%),
`sunny`. Operators: `eq neq gt gte lt lte`, combined with `and` / `or` / `not` and
parentheses.

Two rules worth knowing:
- **Write positive requirements.** An unknown value makes a comparison false, so
  `raining eq false` correctly drops an outdoor activity when the weather is unknown.
  The equivalent-looking `not (raining eq true)` would *include* it instead.
- **Ordering needs numbers.** `gt`/`lt` on a string (e.g. `dateISO`) is always false;
  use `eq`/`neq` there.

`npm test` validates every `betingelse` — it fails on a syntax error or a misspelled
property, so a typo can't reach the screen.

New data source? Write a provider module under `src/` (see `src/clock.js` for the
smallest example) and list it in `src/providers.js`; its properties become
available to every condition with no change to the query engine.

## Configure timing / behavior
Edit `public/config.json`: `spinTimes`, `timezone`, `countdownSeconds`, `graceMinutes`,
`pollSeconds`, `soundFile`.

## Worker settings (Cloudflare)
- `wrangler.jsonc` → `vars`: `SLACK_CHANNEL`, `CHECKIN_EMOJI`, `CHECKIN_MESSAGE`, `TIMEZONE`,
  `WEATHER_LAT`/`WEATHER_LON` (location for the weather lookup; defaults to Oslo),
  `WEATHER_SUNNY_MAX_CLOUD` (cloud cover % below which `sunny` is true; defaults to 20).
- `triggers.crons`: the morning check-in post time (UTC).
- Secret: `SLACK_BOT_TOKEN` (`npx wrangler secret put SLACK_BOT_TOKEN`).

## Develop
- `npm install`
- `npm test` — run unit tests
- `npm run dev` — local server at http://localhost:8787 (use `/?test=1` to force a spin
  with a demo roster, no Slack needed)
- `npm run deploy` — deploy to Cloudflare manually
- Pushes to `main` auto-deploy via GitHub Actions (`.github/workflows/deploy.yml`),
  using the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` repo secrets.

## Office screen setup
Open the deployed URL in fullscreen/kiosk mode, kept in the foreground (background tabs
throttle timers). Allow autoplay/sound for the site so the announcement plays.

## Slack app
Scopes: `chat:write`, `reactions:read`, `channels:history`, `users:read` (needed to
resolve reactor ids to names/avatars for `/api/present`). Invite the bot to the
check-in channel.

## Network presence (who's on the office Wi-Fi)
`/api/present` also includes people detected on the office network, merged with the
Slack reactions (a person known to both — linked via `slackId` in `people.js` — shows
once, tagged with both sources).

**Why a separate agent:** the Worker runs in Cloudflare's cloud and can't reach the
office LAN. A small script on an always-on on-site machine (the office screen is ideal)
scans the network and POSTs the device list to the Worker, which maps devices → people.

**Map who you know — edit `people.js`** (imported by the Worker, never served to the
browser). Match on the device's **mDNS/Bonjour hostname**, which is *stable even though
Wi-Fi MAC addresses randomize* (`Karine-sin-MBP`, `Vetles-MacBook`, …). `match.macs` is
an optional fallback for gear that never randomizes (printers, TVs, APs). Set `slackId`
to dedupe a person across both presence sources. To discover hostnames, run
`./lanscan.sh` or `DRY_RUN=1 ./agent/scan-and-report.sh` — the Worker also returns an
`unmatched` list of named-but-unclaimed devices.

> Caveat: iPhones often advertise the generic hostname `iPhone` (collides across people)
> — don't map that. Android/Samsung phones embed the owner's name and are reliable.

**Run the agent** on the on-site machine:
```sh
# set the Worker secret once:
npx wrangler secret put NETWORK_AGENT_TOKEN

# then run the agent (every 5 min):
LOOP_SECONDS=300 \
WORKER_URL=https://clave-party.<account>.workers.dev \
NETWORK_AGENT_TOKEN=<same value as the secret> \
  ./agent/scan-and-report.sh
```
Wire it to start on boot via `launchd` (macOS) / `cron` / a systemd timer. Scans older
than `NETWORK_PRESENCE_TTL_MINUTES` (default 20) are ignored, so if the agent stops the
screen falls back to Slack-only presence.
