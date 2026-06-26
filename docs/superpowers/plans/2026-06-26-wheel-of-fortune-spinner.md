# Wheel of Fortune Spinner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-name text ticker with a classic spinning pie wheel that is choreographed to land on the already-chosen winner.

**Architecture:** Keep the existing split — pure, unit-tested logic vs. a thin DOM layer. A new pure `public/wheel-geometry.js` owns all angle math (unit-tested). `public/app.js` renders the wheel as an SVG and animates a single CSS `transform: rotate()` to land the predetermined winner under a fixed top pointer. The winner is still chosen by the untouched `selection.js` `pick()`/`pickPerson()`.

**Tech Stack:** Vanilla ES modules (no build step for `public/`), SVG + CSS transforms, Vitest (node environment) for the pure module.

## Global Constraints

- **No frontend build step.** Files in `public/` are served as-is; use plain ES modules and browser-native APIs only. No new dependencies.
- **Pure logic stays pure and tested; DOM stays thin.** New angle math goes in `public/wheel-geometry.js` with Vitest coverage; DOM/SVG code lives in `public/app.js` and is verified manually.
- **Do not touch** `selection.js`, presence/scheduler/Slack/worker code, or the network agent. The winner remains predetermined by `pick()`/`pickPerson()`.
- **Test runner:** `npm test` (Vitest, `environment: 'node'`, `include: ['test/**/*.test.js']`). Tests import from `../public/...`.
- **Wedge label cutoff:** show first-name text labels only when `present.length <= 12`; above that, avatar-only.
- **Spin feel defaults:** `5` seconds, `5` full turns, heavy ease-out; overridable via `config.json` (`spinSeconds`, `spinTurns`).
- **Palette:** `['#ffd23f', '#ff6b6b', '#4ecdc4', '#a06bff']` (theme yellow/red + teal + purple), assigned round-robin so neighbours differ; dark label text `#0f1020`.

---

## File Structure

- **Create** `public/wheel-geometry.js` — pure angle math: `wedgeAngles(n)`, `rotationFor(winnerIndex, n, currentRotation, turns)`.
- **Create** `test/wheel-geometry.test.js` — Vitest unit tests for the above.
- **Modify** `public/index.html` — replace the `view-spinning` body (text `#wheel`) with an SVG wheel + fixed pointer.
- **Modify** `public/styles.css` — remove the old `.wheel` text rule; add wheel/pointer/dimmed-wedge styles.
- **Modify** `public/app.js` — import geometry; add `renderWheel`/`spinTo` and supporting helpers; rewire `startSpin` and the skip handler; update the `els` map; read spin config.
- **Modify** `public/config.json` — add `spinSeconds` and `spinTurns`.

---

## Task 1: Pure wheel geometry module

**Files:**
- Create: `public/wheel-geometry.js`
- Test: `test/wheel-geometry.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `wedgeAngles(n)` → `Array<{ start: number, end: number, mid: number }>` of length `n`. Angles in degrees, measured clockwise from the top (12 o'clock). Equal wedges; `start`/`end`/`mid` are the wedge boundaries and midpoint.
  - `rotationFor(winnerIndex, n, currentRotation = 0, turns = 5)` → `number`. Absolute rotation (deg) that brings `winnerIndex`'s wedge midpoint under the top pointer. Always strictly greater than `currentRotation` (forward-only) and travels at least `turns` full revolutions.

- [ ] **Step 1: Write the failing tests**

Create `test/wheel-geometry.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { wedgeAngles, rotationFor } from '../public/wheel-geometry.js';

describe('wedgeAngles', () => {
  it.each([1, 2, 3, 7, 20])('produces %i equal wedges summing to 360°', (n) => {
    const w = wedgeAngles(n);
    expect(w).toHaveLength(n);
    const total = w.reduce((s, x) => s + (x.end - x.start), 0);
    expect(total).toBeCloseTo(360);
    w.forEach((x) => {
      expect(x.end - x.start).toBeCloseTo(360 / n);
      expect(x.mid).toBeCloseTo((x.start + x.end) / 2);
    });
  });
});

describe('rotationFor', () => {
  // distance (deg) of the winner's wedge midpoint from the top pointer (0),
  // normalised to [0, 180] so that 0 and 360 both read as "under the pointer".
  const landed = (mid, R) => {
    const v = (((mid + R) % 360) + 360) % 360;
    return Math.min(v, 360 - v);
  };

  it.each([
    [1, 0], [2, 0], [2, 1], [3, 0], [3, 2], [7, 5], [20, 13],
  ])('lands winner %i of %i under the top pointer', (n, idx) => {
    const seg = 360 / n;
    const mid = idx * seg + seg / 2;
    const R = rotationFor(idx, n, 0, 5);
    expect(landed(mid, R)).toBeCloseTo(0);
  });

  it('always rotates forward across successive spins', () => {
    let current = 0;
    let prev = 0;
    for (const idx of [0, 2, 1, 4]) {
      const R = rotationFor(idx, 5, current, 5);
      expect(R).toBeGreaterThan(prev);
      current = R;
      prev = R;
    }
  });

  it('travels at least `turns` revolutions and less than one more', () => {
    const R = rotationFor(3, 8, 1000, 5);
    expect(R - 1000).toBeGreaterThanOrEqual(5 * 360);
    expect(R - 1000).toBeLessThan(6 * 360);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- wheel-geometry`
Expected: FAIL — `Failed to resolve import "../public/wheel-geometry.js"` (module does not exist yet).

- [ ] **Step 3: Write the implementation**

Create `public/wheel-geometry.js`:

```js
// Pure wheel geometry. No DOM. Angles in degrees, measured clockwise from the
// top (12 o'clock) — that is where the fixed pointer sits. Stubbable/testable
// in isolation, mirroring selection.js.

export function wedgeAngles(n) {
  const seg = 360 / n;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const start = i * seg;
    const end = (i + 1) * seg;
    out.push({ start, end, mid: start + seg / 2 });
  }
  return out;
}

// Absolute rotation (deg) that brings `winnerIndex`'s wedge midpoint under the
// top pointer. Rotating the wheel clockwise by R moves content at wheel-angle a
// to screen-angle a + R; we want the winner's mid to reach 0 (mod 360), i.e.
// R ≡ -mid. We then pick the smallest such R that is at least `turns` full
// revolutions beyond `currentRotation`, so the wheel always spins forward.
export function rotationFor(winnerIndex, n, currentRotation = 0, turns = 5) {
  const seg = 360 / n;
  const mid = winnerIndex * seg + seg / 2;
  const targetMod = (((-mid) % 360) + 360) % 360;
  const minRotation = currentRotation + turns * 360;
  const k = Math.ceil((minRotation - targetMod) / 360);
  return targetMod + k * 360;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- wheel-geometry`
Expected: PASS — all `wedgeAngles` and `rotationFor` cases green.

- [ ] **Step 5: Run the full suite (no regressions)**

Run: `npm test`
Expected: PASS — every existing test plus the new file.

- [ ] **Step 6: Commit**

```sh
git add public/wheel-geometry.js test/wheel-geometry.test.js
git commit -m "Add pure wheel geometry (wedge angles + landing rotation)"
```

---

## Task 2: Render and spin the SVG wheel

**Files:**
- Modify: `public/index.html` (the `view-spinning` `<section>`, lines 25-28)
- Modify: `public/styles.css` (remove `.wheel` rule line 18; add wheel styles)
- Modify: `public/config.json` (add `spinSeconds`, `spinTurns`)
- Modify: `public/app.js` (imports, `els`, render/spin helpers, `startSpin`, skip handler)

**Interfaces:**
- Consumes: `wedgeAngles`, `rotationFor` from `./wheel-geometry.js`; `pick`, `pickPerson` from `./selection.js` (unchanged); each present person `{ id, name, avatar }` from `/api/present`.
- Produces: no exported API (DOM layer). Internal contract: `renderWheel(present)` builds the wheel into `#wheel-rotor`/`#wheel-defs` and resets rotation; `spinTo(winner)` returns a `Promise` that resolves when the wheel finishes landing on `winner`.

- [ ] **Step 1: Replace the spinning view markup**

In `public/index.html`, replace this section:

```html
    <section class="view view-spinning">
      <h1>Spinning…</h1>
      <p class="wheel" id="wheel">—</p>
    </section>
```

with:

```html
    <section class="view view-spinning">
      <h1>Spinning…</h1>
      <div class="wheel-wrap">
        <div class="wheel-pointer"></div>
        <svg class="wheel-svg" id="wheel-svg" viewBox="0 0 100 100" aria-hidden="true">
          <defs id="wheel-defs"></defs>
          <g id="wheel-rotor"></g>
        </svg>
      </div>
    </section>
```

- [ ] **Step 2: Update the styles**

In `public/styles.css`, delete the old wheel rule (line 18):

```css
.wheel { font-size: clamp(3rem, 10vw, 8rem); font-weight: 800; color: var(--accent); margin: 0; }
```

and add these rules at the end of the file:

```css
.wheel-wrap { position: relative; width: min(80vh, 80vw); height: min(80vh, 80vw); }
.wheel-svg { width: 100%; height: 100%; display: block; }
#wheel-rotor { transform-box: fill-box; transform-origin: center; }
.wheel-pointer {
  position: absolute; top: -1%; left: 50%; transform: translateX(-50%);
  width: 0; height: 0;
  border-left: 1.6vh solid transparent;
  border-right: 1.6vh solid transparent;
  border-top: 2.6vh solid var(--fg);
  z-index: 2; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
}
.wedge { transition: opacity 0.3s ease, filter 0.3s ease; }
.wedge.dimmed { opacity: 0.25; filter: grayscale(1); }
.wedge-name, .wedge-initials { fill: #0f1020; font-weight: 800; font-family: system-ui, sans-serif; }
```

- [ ] **Step 3: Add spin config**

Replace the contents of `public/config.json` with:

```json
{
  "spinTimes": ["10:30", "14:30"],
  "timezone": "Europe/Oslo",
  "countdownSeconds": 5,
  "graceMinutes": 15,
  "soundFile": "/assets/announce.mp3",
  "pollSeconds": 20,
  "spinSeconds": 5,
  "spinTurns": 5
}
```

- [ ] **Step 4: Rewrite `public/app.js`**

Replace the entire contents of `public/app.js` with:

```js
import { pick, pickPerson } from './selection.js';
import { dueSpin } from './scheduler.js';
import { wedgeAngles, rotationFor } from './wheel-geometry.js';

const TEST = new URLSearchParams(location.search).has('test');
const DEMO_ROSTER = [
  { id: 'demo1', name: 'Demo Alice' },
  { id: 'demo2', name: 'Demo Bob' },
  { id: 'demo3', name: 'Demo Cleo' },
];

const WHEEL_COLORS = ['#ffd23f', '#ff6b6b', '#4ecdc4', '#a06bff'];
const LABEL_HIDE_THRESHOLD = 12; // above this many people, show avatars only
const SPIN_SECONDS_DEFAULT = 5;
const SPIN_TURNS_DEFAULT = 5;

const els = {
  state: document.getElementById('state'),
  clock: document.getElementById('clock'),
  countdown: document.getElementById('countdown'),
  wheelDefs: document.getElementById('wheel-defs'),
  wheelRotor: document.getElementById('wheel-rotor'),
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
let round = null; // { activity, present, excluded:Set, current, spinKey, rotation }

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
  const id = localStorage.getItem('lastActivity');
  return id ? { id } : null;
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

// ---- wheel rendering ------------------------------------------------------

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '?';
}
function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, (c) => (
    { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
// wheel angle (deg, clockwise from top) -> point on a circle of radius r about (50,50)
function polar(angleDeg, r) {
  const a = (angleDeg * Math.PI) / 180;
  return { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a) };
}

function renderWheel(present) {
  const n = present.length;
  const R = 48;                              // wheel radius in the 100x100 viewBox
  const angles = wedgeAngles(n);
  const avatarR = Math.min(9, 75 / n);       // shrink avatars as the wheel fills
  const rAvatar = 30;                        // avatar centre distance from middle
  const rName = 16;                          // name distance from middle
  const showNames = n <= LABEL_HIDE_THRESHOLD;
  const nameFont = Math.max(2.4, 6 - n * 0.18);

  const defs = [];
  const wedges = [];

  present.forEach((p, i) => {
    const color = WHEEL_COLORS[i % WHEEL_COLORS.length];
    const { start, end, mid } = angles[i];

    let shape;
    if (n === 1) {
      shape = `<circle cx="50" cy="50" r="${R}" fill="${color}" />`;
    } else {
      const a = polar(start, R);
      const b = polar(end, R);
      const largeArc = end - start > 180 ? 1 : 0;
      shape = `<path d="M50 50 L ${a.x.toFixed(3)} ${a.y.toFixed(3)} `
        + `A ${R} ${R} 0 ${largeArc} 1 ${b.x.toFixed(3)} ${b.y.toFixed(3)} Z" fill="${color}" />`;
    }

    const clipId = `wedge-clip-${i}`;
    defs.push(`<clipPath id="${clipId}"><circle cx="50" cy="${50 - rAvatar}" r="${avatarR.toFixed(3)}" /></clipPath>`);

    const avatarImg = p.avatar
      ? `<image class="wedge-avatar" href="${escapeXml(p.avatar)}" `
        + `x="${(50 - avatarR).toFixed(3)}" y="${(50 - rAvatar - avatarR).toFixed(3)}" `
        + `width="${(avatarR * 2).toFixed(3)}" height="${(avatarR * 2).toFixed(3)}" `
        + `clip-path="url(#${clipId})" preserveAspectRatio="xMidYMid slice" />`
      : '';
    const nameText = showNames
      ? `<text class="wedge-name" x="50" y="${50 - rName}" text-anchor="middle" `
        + `dominant-baseline="middle" font-size="${nameFont.toFixed(2)}">${escapeXml(firstName(p.name))}</text>`
      : '';

    wedges.push(
      `<g class="wedge" data-id="${escapeXml(p.id)}">`
        + shape
        + `<g transform="rotate(${mid.toFixed(3)} 50 50)">`
          + `<circle cx="50" cy="${50 - rAvatar}" r="${avatarR.toFixed(3)}" fill="rgba(0,0,0,0.18)" />`
          + `<text class="wedge-initials" x="50" y="${50 - rAvatar}" text-anchor="middle" `
            + `dominant-baseline="middle" font-size="${(avatarR * 0.9).toFixed(2)}">${escapeXml(initialsOf(p.name))}</text>`
          + avatarImg
          + nameText
        + `</g>`
      + `</g>`,
    );
  });

  els.wheelDefs.innerHTML = defs.join('');
  els.wheelRotor.innerHTML = wedges.join('');

  // reset orientation instantly (no animation) at the start of each round
  els.wheelRotor.style.transition = 'none';
  els.wheelRotor.style.transform = 'rotate(0deg)';
  round.rotation = 0;

  // a broken avatar image reveals the initials drawn underneath it
  els.wheelRotor.querySelectorAll('image.wedge-avatar').forEach((img) => {
    img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
  });
}

function spinTo(winner) {
  const n = round.present.length;
  const idx = round.present.findIndex((p) => p.id === winner.id);
  const turns = config.spinTurns || SPIN_TURNS_DEFAULT;
  const secs = config.spinSeconds || SPIN_SECONDS_DEFAULT;
  const target = rotationFor(idx, n, round.rotation, turns);
  round.rotation = target;

  const rotor = els.wheelRotor;
  return new Promise((resolve) => {
    const done = (e) => {
      if (e.target !== rotor) return; // ignore any bubbling child transitions
      rotor.removeEventListener('transitionend', done);
      resolve();
    };
    rotor.addEventListener('transitionend', done);
    rotor.getBoundingClientRect(); // flush the reset transform before transitioning
    rotor.style.transition = `transform ${secs}s cubic-bezier(0.16, 1, 0.16, 1)`;
    rotor.style.transform = `rotate(${target}deg)`;
  });
}

function showResult(person, activity) {
  els.resultActivity.textContent = activity.kategori;
  els.resultDesc.textContent = activity.tekst || '';
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
  round = { activity, present, excluded: new Set(), current: person, spinKey, rotation: 0 };
  setState('spinning');
  renderWheel(present);
  await spinTo(person);
  showResult(person, activity);
}

els.skip.addEventListener('click', async () => {
  if (!round || !round.current) return;
  round.excluded.add(round.current.id);
  const wedge = els.wheelRotor.querySelector(`[data-id="${round.current.id}"]`);
  if (wedge) wedge.classList.add('dimmed');

  const next = pickPerson(round.present, [...round.excluded]);
  if (!next) {
    endRound("Everyone's busy right now 😅 — catch you at the next one!", round.spinKey);
    return;
  }
  round.current = next;
  setState('spinning');
  await spinTo(next);
  showResult(next, round.activity);
});

els.accept.addEventListener('click', () => {
  if (round) {
    localStorage.setItem('lastActivity', round.activity.id);
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
  activities = (await (await fetch('/activities.json')).json()).aktiviteter;
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

- [ ] **Step 5: Run the full test suite (logic must be unaffected)**

Run: `npm test`
Expected: PASS — `wheel-geometry` plus all existing tests. (No automated test covers the DOM layer; it is verified manually next.)

- [ ] **Step 6: Manual verification in the browser**

Run: `npm run dev` (serves at http://localhost:8787).
Open: `http://localhost:8787/?test=1` and press the **s** key (or click **Spin now (test)**).

Verify:
1. The countdown plays, then the **view-spinning** shows a round wheel of 3 colored wedges (demo roster) with a triangle pointer at top.
2. Demo people have no avatars → each wedge shows an **initials circle** (e.g. "DA", "DB", "DC") and the first name ("Demo"). No broken-image icons.
3. The wheel spins several turns and **eases to a stop**, then the result screen shows the full name large.
4. Trigger another spin; click **Skip / can't right now** → the picked wedge **greys out**, the wheel spins **forward again** (never snapping backward) and lands on a different person.
5. Keep skipping until everyone is excluded → the "Everyone's busy right now" message appears.
6. No errors in the browser console.

(Optional larger-roster check: there is no automated way to inject avatars/many people locally without Slack; rely on the geometry unit tests for n up to 20. If a real roster is available, confirm avatars render circular and labels drop above 12 people.)

- [ ] **Step 7: Commit**

```sh
git add public/index.html public/styles.css public/config.json public/app.js
git commit -m "Render spinner as a wheel of fortune (SVG wedges, avatars, eased spin)"
```

---

## Notes for the implementer

- **Why the winner is predetermined:** `pick()`/`pickPerson()` already choose fairly and are unit-tested. `rotationFor` only computes where to *stop*, so fairness logic and its tests are untouched.
- **Forward-only rotation:** `spinTo` threads `round.rotation` through every spin (including skips) and `rotationFor` always returns a larger value, so the wheel accumulates rotation and never visually rewinds. `renderWheel` resets to `rotate(0deg)` with `transition: none` only at the very start of a round.
- **Avatar fallback is layered, not conditional:** the initials circle + text are always drawn; the avatar `<image>` sits on top and is hidden on load error, so a failed image needs no re-layout.
- **`transform-box: fill-box`** makes `#wheel-rotor` rotate about its own bounding-box centre (the wheel centre), independent of the per-wedge `rotate(mid 50 50)` SVG transforms.
```
