# Office Activity Engagement Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an always-on office screen that twice a day randomly picks an activity and a present employee (who checked in via a Slack emoji reaction), announces it with a sound and a spinning wheel, and lets the chosen person accept or skip.

**Architecture:** A single Cloudflare Worker serves the static screen (plain HTML/CSS/JS) plus `activities.json`/`config.json`, exposes `GET /api/present`, and runs a daily cron that posts the Slack check-in message. Small persistent state lives in Cloudflare KV. The Slack bot token is a Worker secret and never reaches the browser. All scheduling and selection happen in the browser using pure, unit-tested functions; the Worker is a thin Slack proxy.

**Tech Stack:** Cloudflare Workers + Static Assets + KV + Cron Triggers, Wrangler v4, Vitest v3 (Node environment) for tests, plain ES-module JavaScript (no framework, no frontend build step), Slack Web API.

## Global Constraints

- Node 20+ (uses global `fetch`, `Request`, `Response.json`).
- `package.json` has `"type": "module"`; everything is native ES modules.
- **No frontend build step / no framework.** Browser code is native ESM under `public/`, loaded via `<script type="module">`.
- Pure logic shared between browser and Worker lives in `public/` so both can import it (Wrangler bundles the Worker; the browser loads it directly).
- Slack bot token (`SLACK_BOT_TOKEN`) is a Worker **secret** — never referenced in any `public/` file.
- Activities and runtime config are JSON files committed to the repo; editing them is a commit + auto-deploy.
- Default timezone **Europe/Oslo**, default spin times **10:30** and **14:30**, default check-in emoji **white_check_mark (✅)** — all configurable.
- The site is publicly accessible with no auth. `GET /api/present` only exposes who reacted to a public Slack message.
- Slack scopes required: `chat:write`, `reactions:read`, `channels:history`. The bot must be a member of the check-in channel.

## File Structure

```
/
  package.json              # scripts + devDeps (Task 1)
  wrangler.jsonc            # Worker config; grows across Tasks 1, 8
  vitest.config.js          # Node test env (Task 1)
  public/                   # static assets, served by the Worker
    index.html              # screen markup (Task 7)
    styles.css              # screen styles (Task 7)
    app.js                  # browser entry: clock, countdown, wheel, skip/accept (Task 7)
    datetime.js             # pure: localDateISO, localTimeHHMM (Task 2)
    selection.js            # pure: pick, pickPerson, pickActivity (Task 3)
    scheduler.js            # pure: dueSpin (Task 4)
    config.json             # spin times, timezone, countdown, sound (Task 6)
    activities.json         # curated activity list (Task 6)
    assets/announce.mp3     # announcement sound (Task 7)
  src/
    worker.js               # Worker entry: fetch (/api/present) + scheduled (Tasks 1, 5)
    slack.js                # postCheckin, getPresent (Task 5)
  test/
    helpers.js              # fakeKV() test double (Task 5)
    smoke.test.js           # toolchain smoke test (Task 1)
    datetime.test.js        # (Task 2)
    selection.test.js       # (Task 3)
    scheduler.test.js       # (Task 4)
    slack.test.js           # (Task 5)
    worker.test.js          # (Task 5)
    data.test.js            # validates config/activities JSON (Task 6)
  docs/
    superpowers/specs/2026-06-26-office-activity-screen-design.md
    superpowers/plans/2026-06-26-office-activity-screen.md
  README.md                 # setup + runbook (Task 8)
```

---

### Task 1: Scaffold project and toolchain

**Files:**
- Create: `package.json`
- Create: `vitest.config.js`
- Create: `wrangler.jsonc`
- Create: `src/worker.js`
- Create: `public/index.html` (placeholder, replaced in Task 7)
- Create: `test/smoke.test.js`
- Modify: delete the old root `index.html` placeholder (moves into `public/`)

**Interfaces:**
- Consumes: nothing.
- Produces: a deployable skeleton. `src/worker.js` default export with a `fetch(request, env)` that delegates to `env.ASSETS.fetch(request)`. `npm test` runs Vitest; `npm run dev` runs `wrangler dev`.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "clave-party",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "^3.0.0",
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 2: Install dev dependencies**

Run: `npm install`
Expected: `node_modules/` created; `vitest` and `wrangler` present. (If registry access is restricted, this is the only network step in the plan.)

- [ ] **Step 3: Create `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
```

- [ ] **Step 4: Create the minimal `wrangler.jsonc`** (KV, cron, and vars are added in Task 8)

```jsonc
{
  "name": "clave-party",
  "main": "src/worker.js",
  "compatibility_date": "2026-06-01",
  "assets": {
    "directory": "public",
    "binding": "ASSETS"
  }
}
```

- [ ] **Step 5: Create the placeholder `src/worker.js`** (full version arrives in Task 5)

```js
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
```

- [ ] **Step 6: Create the placeholder `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><title>Office Activity Wheel</title></head>
<body><h1>Office Activity Wheel — coming soon</h1></body>
</html>
```

- [ ] **Step 7: Remove the old root placeholder**

Run: `git rm index.html`
Expected: the original root `index.html` placeholder is removed (its replacement lives at `public/index.html`).

- [ ] **Step 8: Write the smoke test `test/smoke.test.js`**

```js
import { describe, it, expect } from 'vitest';

describe('toolchain', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 9: Run the smoke test**

Run: `npm test`
Expected: PASS, 1 test.

- [ ] **Step 10: Verify the Worker serves the placeholder page**

Run: `npm run dev` then in another shell `curl http://localhost:8787/`
Expected: HTML containing "Office Activity Wheel — coming soon". Stop `wrangler dev` afterward.

- [ ] **Step 11: Commit**

```bash
git add package.json vitest.config.js wrangler.jsonc src/worker.js public/index.html test/smoke.test.js
git commit -m "Scaffold Cloudflare Worker + Vitest toolchain"
```

---

### Task 2: Date/time helpers (`public/datetime.js`)

Timezone-correct date and time strings are error-prone, so this gets its own tested unit. Used by both the browser scheduler and the Worker's Slack helpers.

**Files:**
- Create: `public/datetime.js`
- Test: `test/datetime.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `localDateISO(now: Date, timeZone: string): string` → `"YYYY-MM-DD"` in that timezone.
  - `localTimeHHMM(now: Date, timeZone: string): string` → `"HH:MM"` (24h) in that timezone.

- [ ] **Step 1: Write the failing test `test/datetime.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { localDateISO, localTimeHHMM } from '../public/datetime.js';

const TZ = 'Europe/Oslo';

describe('localDateISO', () => {
  it('formats the date in the given timezone', () => {
    expect(localDateISO(new Date('2026-06-26T08:30:00Z'), TZ)).toBe('2026-06-26');
  });
  it('rolls to the next local day when UTC is late', () => {
    // 23:30Z in June is 01:30 next day in Oslo (CEST = UTC+2)
    expect(localDateISO(new Date('2026-06-26T23:30:00Z'), TZ)).toBe('2026-06-27');
  });
});

describe('localTimeHHMM', () => {
  it('formats the time in the given timezone (CEST = UTC+2)', () => {
    expect(localTimeHHMM(new Date('2026-06-26T08:30:00Z'), TZ)).toBe('10:30');
  });
  it('renders midnight as 00:00', () => {
    // 22:00Z in June is 00:00 next day in Oslo
    expect(localTimeHHMM(new Date('2026-06-26T22:00:00Z'), TZ)).toBe('00:00');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/datetime.test.js`
Expected: FAIL — cannot resolve `../public/datetime.js`.

- [ ] **Step 3: Implement `public/datetime.js`**

```js
// Pure timezone-aware formatting helpers. Imported by the browser (scheduler.js,
// app.js) and by the Worker (src/slack.js). No DOM, no Node, no Worker APIs.

export function localDateISO(now, timeZone) {
  // en-CA renders dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function localTimeHHMM(now, timeZone) {
  const s = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);
  // Some ICU versions emit "24:00" for midnight; normalize to "00:00".
  return s.replace(/^24:/, '00:');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/datetime.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add public/datetime.js test/datetime.test.js
git commit -m "Add timezone-aware date/time helpers"
```

---

### Task 3: Selection logic (`public/selection.js`)

**Files:**
- Create: `public/selection.js`
- Test: `test/selection.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces (person = `{id, name, avatar?}`, activity = `{title, description?}`):
  - `pickPerson(present: Person[], excluded: string[] = []): Person | null` — uniform random present person whose `id` is not in `excluded`; `null` if none.
  - `pickActivity(activities: Activity[], lastActivity: Activity | null = null): Activity | null` — random activity, avoiding `lastActivity.title` when other options exist; `null` if list empty.
  - `pick(present, activities, lastActivity = null, excluded = []): { person, activity }` — a fresh spin: both chosen.

- [ ] **Step 1: Write the failing test `test/selection.test.js`**

```js
import { describe, it, expect, vi, afterEach } from 'vitest';
import { pick, pickPerson, pickActivity } from '../public/selection.js';

const people = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }];
const acts = [{ title: 'X' }, { title: 'Y' }];

afterEach(() => vi.restoreAllMocks());

describe('pickPerson', () => {
  it('returns null when everyone is excluded', () => {
    expect(pickPerson(people, ['a', 'b', 'c'])).toBeNull();
  });
  it('returns null for an empty present list', () => {
    expect(pickPerson([], [])).toBeNull();
  });
  it('never returns an excluded person', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // first candidate
    expect(pickPerson(people, ['a'])).toEqual({ id: 'b', name: 'B' });
  });
});

describe('pickActivity', () => {
  it('avoids repeating the last activity when alternatives exist', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickActivity(acts, { title: 'X' })).toEqual({ title: 'Y' });
  });
  it('allows a repeat when only one activity exists', () => {
    expect(pickActivity([{ title: 'X' }], { title: 'X' })).toEqual({ title: 'X' });
  });
  it('returns null for an empty activity list', () => {
    expect(pickActivity([], null)).toBeNull();
  });
});

describe('pick', () => {
  it('returns both a person and an activity on a fresh spin', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const r = pick(people, acts, null, []);
    expect(r.person).toEqual({ id: 'a', name: 'A' });
    expect(r.activity).toEqual({ title: 'X' });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/selection.test.js`
Expected: FAIL — cannot resolve `../public/selection.js`.

- [ ] **Step 3: Implement `public/selection.js`**

```js
// Pure selection logic. No DOM. Randomness via Math.random (stubbed in tests).

export function pickPerson(present, excluded = []) {
  const candidates = present.filter((p) => !excluded.includes(p.id));
  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

export function pickActivity(activities, lastActivity = null) {
  if (activities.length === 0) return null;
  if (lastActivity && activities.length > 1) {
    const pool = activities.filter((a) => a.title !== lastActivity.title);
    return pool[Math.floor(Math.random() * pool.length)];
  }
  return activities[Math.floor(Math.random() * activities.length)];
}

export function pick(present, activities, lastActivity = null, excluded = []) {
  return {
    person: pickPerson(present, excluded),
    activity: pickActivity(activities, lastActivity),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/selection.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add public/selection.js test/selection.test.js
git commit -m "Add pure activity/person selection logic"
```

---

### Task 4: Spin scheduler (`public/scheduler.js`)

**Files:**
- Create: `public/scheduler.js`
- Test: `test/scheduler.test.js`

**Interfaces:**
- Consumes: `localDateISO`, `localTimeHHMM` from `./datetime.js`.
- Produces:
  - `dueSpin(now: Date, spinTimes: string[], ranKeys: string[], timeZone: string, graceMinutes = 15): string | null` — returns the spin key `"<YYYY-MM-DD>T<HH:MM>"` that should fire now (current local time is at or up to `graceMinutes` past a scheduled time, and that key is not already in `ranKeys`), else `null`.

- [ ] **Step 1: Write the failing test `test/scheduler.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { dueSpin } from '../public/scheduler.js';

const TZ = 'Europe/Oslo';
const TIMES = ['10:30', '14:30'];

it('fires the 10:30 spin within the grace window', () => {
  // 08:35Z = 10:35 Oslo (CEST), 5 min after 10:30
  expect(dueSpin(new Date('2026-06-26T08:35:00Z'), TIMES, [], TZ)).toBe('2026-06-26T10:30');
});

it('does not fire before the scheduled time', () => {
  // 08:25Z = 10:25 Oslo
  expect(dueSpin(new Date('2026-06-26T08:25:00Z'), TIMES, [], TZ)).toBeNull();
});

it('does not fire a stale spin past the grace window', () => {
  // 09:00Z = 11:00 Oslo, 30 min after 10:30
  expect(dueSpin(new Date('2026-06-26T09:00:00Z'), TIMES, [], TZ)).toBeNull();
});

it('does not re-fire a spin already run today', () => {
  expect(dueSpin(new Date('2026-06-26T08:35:00Z'), TIMES, ['2026-06-26T10:30'], TZ)).toBeNull();
});

it('fires the afternoon spin independently', () => {
  // 12:35Z = 14:35 Oslo
  expect(dueSpin(new Date('2026-06-26T12:35:00Z'), TIMES, ['2026-06-26T10:30'], TZ)).toBe('2026-06-26T14:30');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/scheduler.test.js`
Expected: FAIL — cannot resolve `../public/scheduler.js`.

- [ ] **Step 3: Implement `public/scheduler.js`**

```js
import { localDateISO, localTimeHHMM } from './datetime.js';

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Returns the spin key that should fire now, or null. A spin is "due" when the
// current local time is at or within graceMinutes after a scheduled time, and
// that day's key for it has not already run.
export function dueSpin(now, spinTimes, ranKeys, timeZone, graceMinutes = 15) {
  const date = localDateISO(now, timeZone);
  const nowMin = toMinutes(localTimeHHMM(now, timeZone));
  for (const t of spinTimes) {
    const delta = nowMin - toMinutes(t);
    if (delta >= 0 && delta <= graceMinutes) {
      const key = `${date}T${t}`;
      if (!ranKeys.includes(key)) return key;
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run test/scheduler.test.js`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add public/scheduler.js test/scheduler.test.js
git commit -m "Add browser spin scheduler"
```

---

### Task 5: Slack integration + Worker handlers (`src/slack.js`, `src/worker.js`)

**Files:**
- Create: `src/slack.js`
- Create: `test/helpers.js`
- Modify: `src/worker.js` (replace the Task 1 placeholder)
- Test: `test/slack.test.js`, `test/worker.test.js`

**Interfaces:**
- Consumes: `localDateISO` from `../public/datetime.js`. Reads from `env`: `KV` (KV namespace), `SLACK_BOT_TOKEN`, `SLACK_CHANNEL`, `CHECKIN_EMOJI`, `CHECKIN_MESSAGE`, `TIMEZONE`.
- Produces:
  - `postCheckin(env, now: Date): Promise<{channel, ts}>` — idempotent per local day; posts the Slack message once and stores `{channel, ts}` in KV under `checkin:<localDate>`, or returns the stored record.
  - `getPresent(env, now: Date): Promise<Person[]>` — ensures today's message exists (lazy fallback), reads its reactions, filters by `CHECKIN_EMOJI`, resolves user ids to `{id, name, avatar}` (KV-cached under `user:<id>`).
  - `src/worker.js` default export: `fetch` serving `GET /api/present` (JSON `{present}`) and delegating everything else to `env.ASSETS`; `scheduled` calling `postCheckin`.

- [ ] **Step 1: Create the test double `test/helpers.js`**

```js
import { vi } from 'vitest';

// Minimal in-memory stand-in for a Cloudflare KV namespace.
export function fakeKV() {
  const store = new Map();
  return {
    store,
    get: vi.fn(async (key, type) => {
      const v = store.get(key);
      if (v == null) return null;
      return type === 'json' ? JSON.parse(v) : v;
    }),
    put: vi.fn(async (key, value) => {
      store.set(key, value);
    }),
  };
}

export function baseEnv(overrides = {}) {
  return {
    KV: fakeKV(),
    SLACK_BOT_TOKEN: 'xoxb-test',
    SLACK_CHANNEL: 'C123',
    CHECKIN_EMOJI: 'white_check_mark',
    CHECKIN_MESSAGE: 'React to check in',
    TIMEZONE: 'Europe/Oslo',
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing test `test/slack.test.js`**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { postCheckin, getPresent } from '../src/slack.js';
import { baseEnv } from './helpers.js';

const NOW = new Date('2026-06-26T08:30:00Z'); // 10:30 Oslo -> date key 2026-06-26

beforeEach(() => vi.restoreAllMocks());

describe('postCheckin', () => {
  it('posts a message and stores the ts in KV', async () => {
    const env = baseEnv();
    globalThis.fetch = vi.fn(async () => ({
      json: async () => ({ ok: true, channel: 'C123', ts: '111.222' }),
    }));
    const rec = await postCheckin(env, NOW);
    expect(rec).toEqual({ channel: 'C123', ts: '111.222' });
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(await env.KV.get('checkin:2026-06-26', 'json')).toEqual({ channel: 'C123', ts: '111.222' });
  });

  it('is idempotent: does not post twice on the same day', async () => {
    const env = baseEnv();
    await env.KV.put('checkin:2026-06-26', JSON.stringify({ channel: 'C123', ts: '999.000' }));
    globalThis.fetch = vi.fn();
    const rec = await postCheckin(env, NOW);
    expect(rec).toEqual({ channel: 'C123', ts: '999.000' });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});

describe('getPresent', () => {
  it('returns resolved users who reacted with the check-in emoji', async () => {
    const env = baseEnv();
    await env.KV.put('checkin:2026-06-26', JSON.stringify({ channel: 'C123', ts: '111.222' }));
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('reactions.get')) {
        return { json: async () => ({ ok: true, message: { reactions: [
          { name: 'white_check_mark', users: ['U1', 'U2'] },
          { name: 'tada', users: ['U3'] },
        ] } }) };
      }
      if (u.includes('users.info')) {
        const id = new URL(u).searchParams.get('user');
        return { json: async () => ({ ok: true, user: { profile: { display_name: 'Name' + id, image_72: 'http://img/' + id } } }) };
      }
      throw new Error('unexpected url ' + u);
    });
    const present = await getPresent(env, NOW);
    expect(present).toEqual([
      { id: 'U1', name: 'NameU1', avatar: 'http://img/U1' },
      { id: 'U2', name: 'NameU2', avatar: 'http://img/U2' },
    ]);
  });

  it('returns an empty list when nobody used the check-in emoji', async () => {
    const env = baseEnv();
    await env.KV.put('checkin:2026-06-26', JSON.stringify({ channel: 'C123', ts: '111.222' }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: true, message: { reactions: [] } }) }));
    expect(await getPresent(env, NOW)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run test/slack.test.js`
Expected: FAIL — cannot resolve `../src/slack.js`.

- [ ] **Step 4: Implement `src/slack.js`**

```js
import { localDateISO } from '../public/datetime.js';

const SLACK_API = 'https://slack.com/api';

function checkinKey(now, timeZone) {
  return `checkin:${localDateISO(now, timeZone)}`;
}

// Posts the daily check-in message at most once per local day. Returns {channel, ts}.
export async function postCheckin(env, now) {
  const key = checkinKey(now, env.TIMEZONE);
  const existing = await env.KV.get(key, 'json');
  if (existing) return existing;

  const res = await fetch(`${SLACK_API}/chat.postMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel: env.SLACK_CHANNEL, text: env.CHECKIN_MESSAGE }),
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack chat.postMessage failed: ${data.error}`);

  const record = { channel: data.channel, ts: data.ts };
  // ~36h TTL: long enough for the whole day, auto-cleans old keys.
  await env.KV.put(key, JSON.stringify(record), { expirationTtl: 60 * 60 * 36 });
  return record;
}

async function resolveUser(env, id) {
  const cacheKey = `user:${id}`;
  const cached = await env.KV.get(cacheKey, 'json');
  if (cached) return cached;

  const res = await fetch(`${SLACK_API}/users.info?user=${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` },
  });
  const data = await res.json();
  if (!data.ok) return { id, name: id, avatar: null };

  const p = data.user.profile || {};
  const user = { id, name: p.display_name || p.real_name || id, avatar: p.image_72 || null };
  await env.KV.put(cacheKey, JSON.stringify(user), { expirationTtl: 60 * 60 * 24 * 7 });
  return user;
}

// Returns the list of present people (those who reacted with the check-in emoji).
export async function getPresent(env, now) {
  const record = await postCheckin(env, now); // also the lazy fallback if cron missed
  const url = `${SLACK_API}/reactions.get?channel=${record.channel}&timestamp=${record.ts}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${env.SLACK_BOT_TOKEN}` } });
  const data = await res.json();
  if (!data.ok) throw new Error(`Slack reactions.get failed: ${data.error}`);

  const reactions = (data.message && data.message.reactions) || [];
  const match = reactions.find((r) => r.name === env.CHECKIN_EMOJI);
  const ids = match ? match.users : [];

  const users = [];
  for (const id of ids) users.push(await resolveUser(env, id));
  return users;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/slack.test.js`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing test `test/worker.test.js`**

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/worker.js';
import { baseEnv } from './helpers.js';
import { localDateISO } from '../public/datetime.js';

beforeEach(() => vi.restoreAllMocks());

describe('worker.fetch', () => {
  it('serves /api/present as JSON', async () => {
    const env = baseEnv();
    const key = `checkin:${localDateISO(new Date(), 'Europe/Oslo')}`;
    await env.KV.put(key, JSON.stringify({ channel: 'C123', ts: '1.2' }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: true, message: { reactions: [] } }) }));

    const res = await worker.fetch(new Request('https://x/api/present'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ present: [] });
  });

  it('returns 502 with an empty present list when Slack fails', async () => {
    const env = baseEnv();
    const key = `checkin:${localDateISO(new Date(), 'Europe/Oslo')}`;
    await env.KV.put(key, JSON.stringify({ channel: 'C123', ts: '1.2' }));
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: false, error: 'channel_not_found' }) }));

    const res = await worker.fetch(new Request('https://x/api/present'), env);
    expect(res.status).toBe(502);
    expect((await res.json()).present).toEqual([]);
  });

  it('delegates non-api paths to static assets', async () => {
    const env = { ASSETS: { fetch: vi.fn(async () => new Response('<html>', { status: 200 })) } };
    const res = await worker.fetch(new Request('https://x/'), env);
    expect(env.ASSETS.fetch).toHaveBeenCalled();
    expect(res.status).toBe(200);
  });
});

describe('worker.scheduled', () => {
  it('posts the check-in message', async () => {
    const env = baseEnv();
    globalThis.fetch = vi.fn(async () => ({ json: async () => ({ ok: true, channel: 'C123', ts: '1.2' }) }));
    let pending;
    const ctx = { waitUntil: (p) => { pending = p; } };
    await worker.scheduled({}, env, ctx);
    await pending;
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 7: Run the test to verify it fails**

Run: `npx vitest run test/worker.test.js`
Expected: FAIL — current `src/worker.js` has no `/api/present` route or `scheduled` handler.

- [ ] **Step 8: Replace `src/worker.js` with the full implementation**

```js
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
```

- [ ] **Step 9: Run all tests**

Run: `npm test`
Expected: PASS — all suites (smoke, datetime, selection, scheduler, slack, worker).

- [ ] **Step 10: Commit**

```bash
git add src/slack.js src/worker.js test/helpers.js test/slack.test.js test/worker.test.js
git commit -m "Add Slack integration and Worker fetch/scheduled handlers"
```

---

### Task 6: Activity list and runtime config (`public/activities.json`, `public/config.json`)

Implementation note: per the Global Constraints, `SLACK_CHANNEL` and `CHECKIN_EMOJI` live as Worker `vars` (Task 8), not in `config.json`, since only the Worker needs them. `config.json` holds only what the browser needs.

**Files:**
- Create: `public/activities.json`
- Create: `public/config.json`
- Test: `test/data.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `activities.json` → `{ activities: [{title, description?}] }`; `config.json` → `{ spinTimes: string[], timezone, countdownSeconds, graceMinutes, soundFile, pollSeconds }`. Consumed by `app.js` (Task 7).

- [ ] **Step 1: Write the failing test `test/data.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));

describe('activities.json', () => {
  const data = read('../public/activities.json');
  it('has a non-empty activities array', () => {
    expect(Array.isArray(data.activities)).toBe(true);
    expect(data.activities.length).toBeGreaterThan(0);
  });
  it('gives every activity a string title', () => {
    for (const a of data.activities) expect(typeof a.title).toBe('string');
  });
});

describe('config.json', () => {
  const cfg = read('../public/config.json');
  it('has the fields app.js depends on', () => {
    expect(Array.isArray(cfg.spinTimes)).toBe(true);
    expect(cfg.spinTimes.length).toBeGreaterThan(0);
    expect(typeof cfg.timezone).toBe('string');
    expect(typeof cfg.countdownSeconds).toBe('number');
    expect(typeof cfg.graceMinutes).toBe('number');
    expect(typeof cfg.soundFile).toBe('string');
    expect(typeof cfg.pollSeconds).toBe('number');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run test/data.test.js`
Expected: FAIL — cannot read `../public/activities.json`.

- [ ] **Step 3: Create `public/activities.json`**

```json
{
  "activities": [
    { "title": "Coffee run ☕", "description": "Take everyone's orders and brew a fresh pot." },
    { "title": "2-minute stretch 🧘", "description": "Lead a quick desk-stretch for the team." },
    { "title": "Show & tell 🎤", "description": "Share something you're working on for 5 minutes." },
    { "title": "Snack restock 🍎", "description": "Refill the snack shelf or fruit bowl." },
    { "title": "Plant check 🪴", "description": "Water the office plants." }
  ]
}
```

- [ ] **Step 4: Create `public/config.json`**

```json
{
  "spinTimes": ["10:30", "14:30"],
  "timezone": "Europe/Oslo",
  "countdownSeconds": 30,
  "graceMinutes": 15,
  "soundFile": "/assets/announce.mp3",
  "pollSeconds": 20
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run test/data.test.js`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add public/activities.json public/config.json test/data.test.js
git commit -m "Add curated activities and runtime config"
```

---

### Task 7: Screen app (`public/index.html`, `public/styles.css`, `public/app.js`, `public/assets/announce.mp3`)

The UI orchestrates the tested pure functions. DOM/animation/audio are verified manually via `wrangler dev` and the `?test=1` trigger (which uses a built-in demo roster so it works without Slack).

**Files:**
- Modify: `public/index.html` (replace the Task 1 placeholder)
- Create: `public/styles.css`
- Create: `public/app.js`
- Create: `public/assets/announce.mp3`

**Interfaces:**
- Consumes: `pick`, `pickPerson` from `./selection.js`; `dueSpin` from `./scheduler.js`; `/config.json`, `/activities.json`, `/api/present`.
- Produces: the running screen. No exports.

- [ ] **Step 1: Replace `public/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Office Activity Wheel</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <main id="state" data-state="idle">
    <audio id="sound" preload="auto"></audio>
    <button id="test-btn" hidden>Spin now (test)</button>

    <section class="view view-idle">
      <h1>🎉 Today's Activity</h1>
      <p class="clock" id="clock">--:--</p>
      <p class="hint">Next spin coming up. Check in on Slack with ✅ to join!</p>
    </section>

    <section class="view view-announcing">
      <h1>Get ready…</h1>
      <p class="countdown" id="countdown">30</p>
    </section>

    <section class="view view-spinning">
      <h1>Spinning…</h1>
      <p class="wheel" id="wheel">—</p>
    </section>

    <section class="view view-result">
      <p class="result-activity" id="result-activity"></p>
      <p class="result-desc" id="result-desc"></p>
      <p class="result-label">is up to…</p>
      <p class="result-name" id="result-name"></p>
      <div class="actions">
        <button id="accept" class="btn-accept">I'm on it! ✅</button>
        <button id="skip" class="btn-skip">Skip / can't right now ↻</button>
      </div>
    </section>

    <section class="view view-nobody">
      <p class="message" id="message"></p>
    </section>
  </main>

  <script type="module" src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `public/styles.css`**

```css
:root { --bg: #0f1020; --fg: #fff; --accent: #ffd23f; --accent2: #ff6b6b; }
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body { background: var(--bg); color: var(--fg); font-family: system-ui, sans-serif; }

#state { height: 100vh; display: flex; align-items: center; justify-content: center; text-align: center; }
.view { display: none; flex-direction: column; align-items: center; gap: 0.4em; padding: 2rem; }
[data-state="idle"] .view-idle,
[data-state="announcing"] .view-announcing,
[data-state="spinning"] .view-spinning,
[data-state="result"] .view-result,
[data-state="nobody"] .view-nobody { display: flex; }

h1 { font-size: clamp(2rem, 6vw, 5rem); margin: 0; }
.clock { font-size: clamp(3rem, 12vw, 9rem); font-weight: 700; margin: 0; }
.hint { opacity: 0.7; font-size: clamp(1rem, 2.5vw, 1.5rem); }
.countdown { font-size: clamp(6rem, 30vw, 22rem); font-weight: 800; color: var(--accent); margin: 0; }
.wheel { font-size: clamp(3rem, 10vw, 8rem); font-weight: 800; color: var(--accent); margin: 0; }
.result-activity { font-size: clamp(2.5rem, 8vw, 6rem); font-weight: 800; color: var(--accent); margin: 0; }
.result-desc { font-size: clamp(1rem, 3vw, 2rem); opacity: 0.85; max-width: 22ch; margin: 0; }
.result-label { font-size: clamp(1rem, 3vw, 2rem); opacity: 0.7; margin: 0; }
.result-name { font-size: clamp(3rem, 12vw, 9rem); font-weight: 800; margin: 0; }
.actions { display: flex; gap: 1rem; margin-top: 1rem; flex-wrap: wrap; justify-content: center; }
button { font-size: clamp(1rem, 3vw, 1.8rem); padding: 0.6em 1.2em; border: none; border-radius: 0.6em; cursor: pointer; font-weight: 700; }
.btn-accept { background: var(--accent); color: #000; }
.btn-skip { background: var(--accent2); color: #fff; }
.message { font-size: clamp(1.5rem, 5vw, 3.5rem); max-width: 18ch; }
#test-btn { position: fixed; top: 1rem; right: 1rem; background: #333; color: #fff; }
```

- [ ] **Step 3: Create `public/app.js`**

```js
import { pick, pickPerson } from './selection.js';
import { dueSpin } from './scheduler.js';

const TEST = new URLSearchParams(location.search).has('test');
const DEMO_ROSTER = [
  { id: 'demo1', name: 'Demo Alice' },
  { id: 'demo2', name: 'Demo Bob' },
  { id: 'demo3', name: 'Demo Cleo' },
];

const els = {
  state: document.getElementById('state'),
  clock: document.getElementById('clock'),
  countdown: document.getElementById('countdown'),
  wheel: document.getElementById('wheel'),
  resultActivity: document.getElementById('result-activity'),
  resultDesc: document.getElementById('result-desc'),
  resultName: document.getElementById('result-name'),
  accept: document.getElementById('accept'),
  skip: document.getElementById('skip'),
  message: document.getElementById('message'),
  sound: document.getElementById('sound'),
  testBtn: document.getElementById('test-btn'),
};

let config;
let activities;
let round = null; // { activity, present, excluded:Set, current, spinKey }

const setState = (name) => { els.state.dataset.state = name; };

function ranKeys() {
  try { return JSON.parse(localStorage.getItem('ranKeys') || '[]'); }
  catch { return []; }
}
function markRan(key) {
  if (!key) return;
  const keys = ranKeys();
  if (!keys.includes(key)) { keys.push(key); localStorage.setItem('ranKeys', JSON.stringify(keys)); }
}
function getLastActivity() {
  const t = localStorage.getItem('lastActivity');
  return t ? { title: t } : null;
}

async function fetchPresent() {
  try {
    const res = await fetch('/api/present');
    const data = await res.json();
    const present = data.present || [];
    if (present.length === 0 && TEST) return DEMO_ROSTER;
    return present;
  } catch {
    return TEST ? DEMO_ROSTER : [];
  }
}

function updateClock() {
  els.clock.textContent = new Intl.DateTimeFormat('en-GB', {
    timeZone: config.timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

function animateWheel(present, winner) {
  setState('spinning');
  return new Promise((resolve) => {
    const names = present.map((p) => p.name);
    let i = 0;
    let ticks = 0;
    const total = 24 + Math.max(0, present.indexOf(winner));
    const iv = setInterval(() => {
      els.wheel.textContent = names[i % names.length];
      i += 1; ticks += 1;
      if (ticks >= total) {
        clearInterval(iv);
        els.wheel.textContent = winner.name;
        resolve();
      }
    }, 90);
  });
}

function showResult(person, activity) {
  els.resultActivity.textContent = activity.title;
  els.resultDesc.textContent = activity.description || '';
  els.resultName.textContent = person.name;
  setState('result');
}

function endRound(messageText, spinKey) {
  els.message.textContent = messageText;
  setState('nobody');
  markRan(spinKey);
  round = null;
}

async function startSpin(spinKey) {
  setState('announcing');
  els.sound.currentTime = 0;
  els.sound.play().catch(() => {}); // autoplay may be blocked; ignore
  let remaining = config.countdownSeconds;
  els.countdown.textContent = remaining;
  await new Promise((resolve) => {
    const iv = setInterval(() => {
      remaining -= 1;
      els.countdown.textContent = remaining;
      if (remaining <= 0) { clearInterval(iv); resolve(); }
    }, 1000);
  });

  const present = await fetchPresent();
  if (present.length === 0) {
    endRound("No one's checked in yet — see you next time!", spinKey);
    return;
  }

  const { person, activity } = pick(present, activities, getLastActivity(), []);
  round = { activity, present, excluded: new Set(), current: person, spinKey };
  await animateWheel(present, person);
  showResult(person, activity);
}

els.skip.addEventListener('click', async () => {
  if (!round || !round.current) return;
  round.excluded.add(round.current.id);
  const next = pickPerson(round.present, [...round.excluded]);
  if (!next) {
    endRound("Everyone's busy right now 😅 — catch you at the next one!", round.spinKey);
    return;
  }
  round.current = next;
  await animateWheel(round.present, next);
  showResult(next, round.activity);
});

els.accept.addEventListener('click', () => {
  if (round) {
    localStorage.setItem('lastActivity', round.activity.title);
    markRan(round.spinKey);
    round = null;
  }
  setState('idle');
});

function tick() {
  updateClock();
  if (els.state.dataset.state !== 'idle') return; // a spin is in progress
  const key = dueSpin(new Date(), config.spinTimes, ranKeys(), config.timezone, config.graceMinutes);
  if (key) startSpin(key);
}

async function main() {
  config = await (await fetch('/config.json')).json();
  activities = (await (await fetch('/activities.json')).json()).activities;
  els.sound.src = config.soundFile;
  setState('idle');
  updateClock();
  setInterval(tick, (config.pollSeconds || 20) * 1000);

  if (TEST) {
    els.testBtn.hidden = false;
    els.testBtn.addEventListener('click', () => { if (els.state.dataset.state === 'idle') startSpin(null); });
    window.addEventListener('keydown', (e) => { if (e.key === 's' && els.state.dataset.state === 'idle') startSpin(null); });
  }
}

main();
```

- [ ] **Step 4: Add an announcement sound `public/assets/announce.mp3`**

Drop any short MP3 (a fanfare/chime) at `public/assets/announce.mp3`. Until you do, the screen still works — `sound.play()` failures are caught and ignored. (Any royalty-free chime is fine; keep it a couple of seconds.)

- [ ] **Step 5: Manually verify the full flow**

Run: `npm run dev`, then open `http://localhost:8787/?test=1`.
Do:
1. Click **Spin now (test)** (or press **S**). Expected: countdown counts down from 30 → wheel cycles names → lands on a Demo person with an activity.
2. Click **Skip / can't right now**. Expected: wheel re-spins to a *different* Demo person, **same activity**.
3. Skip until the roster is exhausted. Expected: "Everyone's busy right now 😅" message.
4. Spin again, click **I'm on it!**. Expected: returns to the idle clock screen.
Confirm the countdown is 30s (or temporarily lower `countdownSeconds` in `config.json` to speed up verification, then restore it).

- [ ] **Step 6: Commit**

```bash
git add public/index.html public/styles.css public/app.js public/assets/announce.mp3
git commit -m "Add office screen UI: countdown, wheel, skip/accept"
```

---

### Task 8: Deployment configuration, Slack app, and runbook

**Files:**
- Modify: `wrangler.jsonc` (add KV binding, cron trigger, vars)
- Create: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: a deployed, publicly reachable Worker with a daily cron and live Slack integration; documented setup.

- [ ] **Step 1: Create the Slack app and bot token**

Do (no code):
1. Create a Slack app at api.slack.com/apps → "From scratch", pick the workspace.
2. OAuth & Permissions → Bot Token Scopes: add `chat:write`, `reactions:read`, `channels:history`.
3. Install to workspace; copy the **Bot User OAuth Token** (`xoxb-…`).
4. Invite the bot to the check-in channel: in Slack, `/invite @YourBot`.
5. Get the channel id: right-click the channel → View channel details → bottom shows the ID (`C0…`).

- [ ] **Step 2: Create the KV namespace**

Run: `npx wrangler kv namespace create KV`
Expected: prints an `id`. Copy it for the next step.

- [ ] **Step 3: Update `wrangler.jsonc`** (replace `<YOUR_KV_NAMESPACE_ID>` and `C0XXXXXXX`)

```jsonc
{
  "name": "clave-party",
  "main": "src/worker.js",
  "compatibility_date": "2026-06-01",
  "assets": {
    "directory": "public",
    "binding": "ASSETS"
  },
  "kv_namespaces": [
    { "binding": "KV", "id": "<YOUR_KV_NAMESPACE_ID>" }
  ],
  "triggers": {
    "crons": ["0 7 * * 1-5"]
  },
  "vars": {
    "SLACK_CHANNEL": "C0XXXXXXX",
    "CHECKIN_EMOJI": "white_check_mark",
    "CHECKIN_MESSAGE": "☀️ Good morning! React with ✅ if you're in the office today.",
    "TIMEZONE": "Europe/Oslo"
  }
}
```

Note: cron is UTC. `0 7 * * 1-5` = 07:00 UTC weekdays ≈ 09:00 Oslo summer / 08:00 winter. Adjust if you want a different morning post time.

- [ ] **Step 4: Set the Slack token as a secret**

Run: `npx wrangler secret put SLACK_BOT_TOKEN`
Paste the `xoxb-…` token when prompted.
Expected: "Success! Uploaded secret SLACK_BOT_TOKEN".

- [ ] **Step 5: Run the full test suite before deploying**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 6: Deploy**

Run: `npx wrangler deploy`
Expected: prints the public `https://clave-party.<subdomain>.workers.dev` URL.

- [ ] **Step 7: Verify the deployed endpoints**

Run: `curl https://clave-party.<subdomain>.workers.dev/api/present`
Expected: JSON `{"present":[...]}`. On the first call of the day this also triggers the lazy check-in post; confirm the message appears in the Slack channel, react ✅, and call again — your name should appear in `present`.
Then open the site root in a browser; confirm the idle clock screen loads. Open `/?test=1` to exercise a spin against the live roster.

- [ ] **Step 8: Connect the repo for auto-deploy (optional but recommended)**

Do (no code): Cloudflare dashboard → Workers & Pages → your Worker → Settings → Builds → Connect to the GitHub repo, production branch `main`. Pushes to `main` now auto-deploy. (Secrets set via `wrangler secret put` persist; re-add `vars`/secret in the dashboard only if you create the Worker fresh there.)

- [ ] **Step 9: Write `README.md`**

```markdown
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
```

- [ ] **Step 10: Commit**

```bash
git add wrangler.jsonc README.md
git commit -m "Add deployment config, Slack setup, and runbook"
```

---

## Self-Review

**1. Spec coverage:**
- Slack emoji check-in → Tasks 5 (`postCheckin`/reactions), 8 (Slack app setup). ✓
- Twice-daily randomized selection → Tasks 3 (`pick`), 4 (`dueSpin`), 7 (orchestration). ✓
- Announcement sound + 30s countdown + wheel → Task 7. ✓
- Accept / skip (re-pick person, keep activity, exclude skipper for the round) → Task 7 skip handler + Task 3 `pickPerson`. ✓
- Activities as editable JSON in the repo → Task 6. ✓
- Single Cloudflare Worker (assets + API + cron + KV) → Tasks 1, 5, 8. ✓
- Slack token server-side only → Global Constraints + Task 8 secret. ✓
- Error handling: nobody present (Task 7 `endRound`), Slack unreachable (Task 5/7 502 + empty), cron missed/lazy post (Task 5 `getPresent`→`postCheckin`), double-fire guard (Task 7 `ranKeys`), backgrounded tab + autoplay (Task 8 README), cron UTC/DST note (Task 8). ✓
- Public access, no auth → default Worker URL. ✓
- Testing: pure `pick`/`dueSpin`, mocked-Slack handlers, manual `?test=1` trigger → Tasks 3, 4, 5, 7. ✓

**2. Placeholder scan:** Config placeholders (`<YOUR_KV_NAMESPACE_ID>`, `C0XXXXXXX`, `<subdomain>`) are deliberate fill-ins with adjacent instructions, not unfinished plan steps. No "TBD"/"add error handling"/"write tests for the above" left. ✓

**3. Type consistency:** `pick`/`pickPerson`/`pickActivity` signatures match across Tasks 3 and 7. `dueSpin(now, spinTimes, ranKeys, timeZone, graceMinutes)` matches Tasks 4 and 7. `postCheckin(env, now)`/`getPresent(env, now)` and the `{channel, ts}` KV record shape match across Tasks 5 and 8. Person shape `{id, name, avatar?}` consistent. `env` var names (`SLACK_BOT_TOKEN`, `SLACK_CHANNEL`, `CHECKIN_EMOJI`, `CHECKIN_MESSAGE`, `TIMEZONE`) match across Tasks 5, 6 (note), 8. `config.json` keys match Task 6 schema and Task 7 usage. ✓
