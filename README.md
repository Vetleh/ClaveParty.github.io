# Clave Party — Office Activity Wheel

An always-on office screen that twice a day picks a random activity and a present
employee to do it. Presence = reacting with ✅ to the daily Slack check-in message.

## How it works
- A Cloudflare Worker serves the screen and runs a daily cron that posts the Slack
  check-in message.
- The screen (a browser in kiosk/fullscreen on the office TV) watches the clock and,
  at each configured spin time, plays a sound, counts down 30s, then spins a wheel to
  pick a present person + activity.
- The chosen person taps **I'm on it!** or **Skip / can't right now** (re-picks a
  different person, same activity).

## Edit the activities
Edit `public/activities.json` and push to `main`. Auto-deploys in seconds.

## Configure timing / behavior
Edit `public/config.json`: `spinTimes`, `timezone`, `countdownSeconds`, `graceMinutes`,
`pollSeconds`, `soundFile`.

## Worker settings (Cloudflare)
- `wrangler.jsonc` → `vars`: `SLACK_CHANNEL`, `CHECKIN_EMOJI`, `CHECKIN_MESSAGE`, `TIMEZONE`.
- `triggers.crons`: the morning check-in post time (UTC).
- Secret: `SLACK_BOT_TOKEN` (`npx wrangler secret put SLACK_BOT_TOKEN`).

## Develop
- `npm install`
- `npm test` — run unit tests
- `npm run dev` — local server at http://localhost:8787 (use `/?test=1` to force a spin
  with a demo roster, no Slack needed)
- `npm run deploy` — deploy to Cloudflare

## Office screen setup
Open the deployed URL in fullscreen/kiosk mode, kept in the foreground (background tabs
throttle timers). Allow autoplay/sound for the site so the announcement plays.

## Slack app
Scopes: `chat:write`, `reactions:read`, `channels:history`. Invite the bot to the
check-in channel.
