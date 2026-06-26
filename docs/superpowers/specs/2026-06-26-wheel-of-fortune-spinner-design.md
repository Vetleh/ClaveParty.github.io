# Wheel of Fortune spinner — design

**Date:** 2026-06-26
**Status:** Approved (pending spec review)

## Problem

Today the "spinning" view flips a single text element (`#wheel`) through the
present people's names every 90ms and stops on the pre-selected winner
(`animateWheel`, `public/app.js:64`). It reads as a name ticker, not a wheel.

We want a classic **wheel of fortune**: a round wheel split into colored wedges
(one per present person), a fixed pointer at the top, that spins fast then eases
to a stop with the winner under the pointer.

## Key principle: the winner is predetermined

The winner is already chosen by the pure, unit-tested selection logic in
`public/selection.js` (`pick()` / `pickPerson()`). That does **not** change. The
wheel is purely a *presentation* layer: it is choreographed to land on the
already-decided winner. This keeps fairness logic testable and untouched, and
keeps the skip re-pick behaviour identical underneath.

## Architecture

Preserve the codebase's existing split — **pure logic stays pure and unit-tested;
the DOM layer stays thin and is exercised manually.**

- **New pure module `public/wheel-geometry.js`** (unit-tested, no DOM):
  - `wedgeAngles(n)` → for `n` wedges, the angular layout (start/end/mid degrees)
    of each wedge. Wedges are equal-sized and sum to 360°.
  - `rotationFor(winnerIndex, n, currentRotation, turns)` → the absolute target
    rotation (degrees) that brings `winnerIndex`'s wedge midpoint under the top
    (12 o'clock) pointer. Always resolves to a value **greater than
    `currentRotation`** (rotates forward, never rewinds) and includes `turns`
    full revolutions for drama.

- **Rendering: SVG.** One `<path>` arc per wedge, an `<image>` avatar clipped to
  a circle per wedge, and a `<text>` first-name label per wedge. The whole wedge
  group is rotated by a single CSS `transform: rotate(...)` with an ease-out
  transition. SVG is chosen over canvas / CSS `conic-gradient` because it gives
  crisp scalable wedges on a TV, trivial avatar circle-clipping (`<clipPath>`),
  and a clean deterministic landing angle.

## Components

### `public/wheel-geometry.js` (pure)
As above. The only place angle math lives, so it can be tested in isolation.

### `renderWheel(present, excludedIds)` — in `app.js`
Builds the SVG for the current roster.
- **Colors:** alternating fills from a small palette derived from the theme
  (`--accent` yellow, `--accent2` red, plus ~2 more) so neighbouring wedges
  always differ. Label text color chosen for contrast against its wedge.
- **Avatar:** drawn near the rim of each wedge, clipped to a circle. When
  `person.avatar` is `null` (network-only people, the demo roster) **or** the
  image fails to load (`onerror`), fall back to an **initials circle** (the
  person's initials on their wedge color).
- **First-name label:** font **auto-shrinks** as wedge count grows. Past a
  crowding threshold (many people / very thin wedges) the text label is dropped
  and the avatar alone identifies the wedge. The full name always appears large
  on the result screen regardless.
- **Dimming:** wedges whose person id is in `excludedIds` are rendered
  dimmed/greyed (reduced opacity + desaturated) to show they're out of the running.

### `spinTo(winner)` — in `app.js`
Computes the target rotation via `rotationFor(...)`, applies the CSS transition +
transform, and resolves a Promise on `transitionend`. Replaces the body of the
old `animateWheel`.

### Result / idle / nobody views
Unchanged. The result screen already shows the full name large
(`#result-name`).

## Data flow (control flow is unchanged)

- **Spin:** `startSpin` → `fetchPresent` → `pick(present, ...)` → winner →
  `renderWheel(present, [])` → `spinTo(winner)` → `showResult(winner, activity)`.
- **Skip:** add `round.current.id` to `round.excluded` → re-mark that wedge as
  dimmed in place (no rebuild) → `pickPerson(round.present, [...excluded])` →
  if none left, `endRound(...)` (unchanged message) → else `spinTo(next)`
  continuing forward → `showResult(next, activity)`.

The wheel is rendered once per round (at spin start); skips update wedge dimming
and spin further forward — the wheel never visually rebuilds or rewinds.

## Spin feel (tweakable)

- Duration ~5s, ~5 full turns plus the landing offset, heavy ease-out
  (decelerating) curve.
- Fixed pointer is a triangle pinned at 12 o'clock above the wheel.
- **No new sound asset** — the existing announcement sound already plays at the
  start of the countdown (`startSpin`, `app.js:99`).

## Edge cases

- **1 person present:** a single full-circle wedge; still spins and lands.
- **2 people:** half / half.
- **Avatar null or load failure:** initials circle fallback.
- **15–20 people:** thin wedges; avatar near rim, label auto-shrunk or dropped
  past the threshold; full name on result screen.
- **Test/demo mode** (`/?test=1`, `DEMO_ROSTER`): people have no avatars → all
  wedges use the initials fallback. Spin works the same.

## Testing

- **New unit tests** for `wheel-geometry.js`:
  - `wedgeAngles(n)` produces `n` equal wedges summing to 360° for several `n`
    (1, 2, 3, 7, 20).
  - `rotationFor(...)` lands the chosen winner's wedge midpoint under the top
    pointer (within tolerance) for various `n` and indices.
  - Successive `rotationFor` calls are **monotonically increasing** (forward-only
    rotation across repeated spins / skips).
- `selection.js` and all existing tests remain untouched and passing.
- **Manual verification:** `npm run dev`, open `/?test=1`, press **s** (or the
  test button) to trigger a spin; verify the wheel renders, spins, eases to the
  winner, and that Skip dims the skipped wedge and re-spins forward.

## Out of scope (YAGNI)

- Confetti / extra celebration effects.
- New spin/tick sound assets.
- Wiring new avatar sources beyond what `/api/present` already returns.
- Any change to presence, scheduling, Slack, or network-agent code.
