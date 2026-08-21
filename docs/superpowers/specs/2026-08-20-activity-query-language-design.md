# Activity Query Language — Design Spec

**Date:** 2026-08-20
**Status:** Implemented
**Repo:** `ClaveParty.github.io`
**Supersedes:** the *Selection Logic* and *`activities.json`* sections of
`2026-06-26-office-activity-screen-design.md`

## Summary

Whether an activity can be picked for a spin is now decided by a **condition
written on the activity itself**, in a small query language:

```json
{
  "id": "sommer-01",
  "kategori": "Sommerspesial",
  "tekst": "Ta med gjengen ut i sola i ti minutter.",
  "betingelse": "month gte 6 and month lte 7 and raining eq false"
}
```

Conditions are evaluated **in the Worker**, against a *context* — a flat bag of
facts (`month`, `raining`, `temperature`, …) assembled from pluggable **data
providers**. The screen asks `GET /api/activities` for the already-filtered pool
and just picks from it.

Before this, eligibility was three special-cased fields (`kategori ===
"Sommerspesial"`, `sesong`, `ute`) plus hardcoded month arrays in
`public/selection.js`. The only facts a rule could consult were the month and a
`raining` boolean, and adding a rule meant editing code rather than data.

## Goals

- Express eligibility as **data**, not code — a new rule is a JSON edit.
- Compose conditions freely (ranges, `and`/`or`, parentheses).
- Let the vocabulary **grow with the data sources**: adding a provider makes its
  properties queryable with no change to the engine or the activity data.
- Never send people outside on a maybe-wet day, even when data is missing.
- Never leave a spin with nothing to show.

## Non-Goals

- Not a general-purpose expression language: no arithmetic, no function calls,
  no user-defined variables.
- No per-activity weighting or scheduling — eligibility is boolean; the pick
  stays uniform-random.
- No authoring UI. Conditions are hand-written in `activities.json` and
  validated by the test suite.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Where are conditions evaluated? | Server-side; `/api/activities` returns the filtered pool. | Keeps provider data (and future credentials) off the wire; one place to reason about eligibility. |
| What happens when a property is unknown? | The comparison is **false**, so the activity is excluded. | Preserves the original fail-closed promise: unknown weather must not send people out. |
| How is the schema shaped? | One optional `betingelse` string replaces `sesong` + `ute`. | A single place expresses eligibility. `kategori` stays — it is shown on screen. `vanskelighet` was never read and was dropped. |
| Parser: library or hand-written? | Hand-written, no dependency. | The repo has zero runtime dependencies, and `eval`/`new Function` are unavailable under a strict CSP / undesirable in a Worker. |
| Is `sunny` available? | Yes — the weather provider also calls met.no `locationforecast` for cloud cover. | `nowcast` carries precipitation but no cloud cover. |

## Architecture

```
Browser (kiosk)                    Worker
───────────────                    ──────
~1 min before a spin               GET /api/activities
  GET /api/activities  ─────────▶    context = buildContext(env, now)   ← providers
  stash the pool                     pool    = filterActivities(acts, context)
at spin time                       ◀──────  { activities: pool, context }
  pick person + activity
  from the stashed pool
```

### Components

| File | Responsibility |
|---|---|
| `src/query.js` | The language: `tokenize` → `parse` → `evaluate`, plus `compile(query, allowedProps?)` returning a `(context) => boolean` predicate. Pure, no I/O, no `eval`. |
| `src/providers.js` | Provider **registry** only. `buildContext(env, now)` runs every provider best-effort and merges their properties; `declaredProperties()` is the query vocabulary. |
| `src/clock.js` | The clock provider (`month`, `hour`, `weekday`, `dateISO`). |
| `src/weather.js` | The weather provider (and `isRaining`, still used by the legacy `/api/weather`). |
| `src/activities.js` | Bundles `public/activities.json` and exposes `filterActivities(list, context)`. |
| `src/worker.js` | The `/api/activities` route. |
| `public/selection.js` | Reduced to picking (`pickPerson`, `pickActivity`, `pick`). No filtering. |

## The language

```
expr       := or
or         := and ('or' and)*
and        := not ('and' not)*
not        := 'not' not | comparison
comparison := '(' or ')' | operand cmpOp operand
operand    := number | boolean | string | property
cmpOp      := eq | neq | gt | gte | lt | lte
```

Precedence, loosest first: `or` < `and` < `not` < comparison.

- **Operands:** property names, numbers (`15`, `-3`, `20.5`), booleans
  (`true`/`false`), double-quoted strings (`"Sommerspesial"` — needed because
  values contain spaces, `&`, and `å`).
- **Comparison:** `eq`/`neq` work on any type; `gt`/`gte`/`lt`/`lte` require
  **numbers on both sides** and are false otherwise.

### Properties (v1)

| Provider | Property | Type | Notes |
|---|---|---|---|
| clock | `month` | number | 1–12, in `TIMEZONE` |
| clock | `hour` | number | 0–23 — see *Known limitations* |
| clock | `weekday` | number | 1 = Monday … 7 = Sunday |
| clock | `dateISO` | string | `YYYY-MM-DD`; `eq`/`neq` only |
| weather | `raining` | boolean | `precipitationRate > 0`; `true` when unknown |
| weather | `precipitationRate` | number | mm/h, met.no `nowcast` |
| weather | `temperature` | number | °C, met.no `locationforecast` |
| weather | `cloudCover` | number | %, met.no `locationforecast` |
| weather | `sunny` | boolean | `cloudCover < WEATHER_SUNNY_MAX_CLOUD` (default 20) |

## Fail-closed semantics

The rule: **a comparison naming a property that is absent from the context is
false.** A provider that fails contributes nothing, so its properties are absent,
so conditions depending on them exclude their activities.

Two consequences worth knowing:

1. **Write positive requirements.** `raining eq false` excludes an outdoor
   activity when rain is unknown — correct. The equivalent-looking
   `not (raining eq true)` *includes* it (unknown → inner false → `not` → true).
   `not` is legal but should be avoided in `activities.json`.
2. **Property lookup is own-properties-only** (`Object.hasOwn`). Plain
   `context[name]` would reach `Object.prototype`, letting `constructor neq 0`
   resolve to a function and evaluate **true** — a fail-open hole on a property
   no provider declares. A missing context resolves to unknown for the same
   reason.

Conditions are also validated against `declaredProperties()` at **runtime**, so a
misspelled property raises a named error (logged, activity excluded) instead of a
condition that silently never matches.

### Never an empty pool

`filterActivities` degrades in three tiers:

1. the activities whose conditions hold;
2. else the **unconditional** activities (no `betingelse`) — all indoor and
   year-round, so this is safe in any weather;
3. else the whole list, as a last resort.

Tier 3 can return activities whose conditions were false; it is unreachable while
any unconditional activity exists (39 of 52 today).

## Data shapes

### `activities.json`

```jsonc
{
  "beskrivelse": "…",
  "felt": { /* field documentation, including the property/operator vocabulary */ },
  "aktiviteter": [
    { "id": "mat-02", "kategori": "Mat & drikke", "tekst": "…" },              // always eligible
    { "id": "beveg-01", "kategori": "Bevegelse & frisk luft", "tekst": "…",
      "betingelse": "raining eq false" }
  ]
}
```

`id`, `kategori`, `tekst` required; `betingelse` optional (absent = always
eligible). The file is still served as a static asset *and* bundled into the
Worker, which imports it directly.

### `GET /api/activities`

```json
{
  "activities": [ { "id": "…", "kategori": "…", "tekst": "…", "betingelse": "…" } ],
  "context":    { "month": 8, "hour": 14, "weekday": 4, "dateISO": "2026-08-20",
                  "raining": false, "precipitationRate": 0,
                  "temperature": 20.8, "cloudCover": 39.2, "sunny": false }
}
```

`context` is returned for debugging — it shows exactly what the conditions were
evaluated against.

### A provider

```js
{
  name: 'weather',
  properties: [{ name: 'raining', type: 'boolean' }, /* … */],
  async load(env, now) { /* → { raining: false, … }; omit a property to leave it unknown */ },
}
```

## Migration from the old fields

Behaviour-preserving. Verified by exhaustively comparing old and new eligibility
across **52 activities × 12 months × raining ∈ {true, false}** — 1248
combinations, zero differences.

| Old | New `betingelse` |
|---|---|
| `kategori: Sommerspesial`, `ute: true` | `month gte 6 and month lte 7 and raining eq false` |
| `kategori: Sommerspesial`, indoor | `month gte 6 and month lte 7` |
| `sesong: sommer`, `ute: true` | `month gte 5 and month lte 8 and raining eq false` |
| `sesong: sommer`, indoor | `month gte 5 and month lte 8` |
| `ute: true`, year-round | `raining eq false` |
| indoor, `hele_aret` | *(no `betingelse`)* |

## Adding a data source

**One provider per file** under `src/`, listed in `PROVIDERS` (`src/providers.js`)
— which stays a registry and holds no provider of its own. The new properties
become queryable immediately. Reusing the existing presence pipeline, for
example, as `src/office.js`:

```js
{
  name: 'office',
  properties: [{ name: 'peopleCount', type: 'number' }],
  async load(env, now) {
    const devices = await getNetworkDevices(env, now);
    return { peopleCount: matchDevices(devices, people).present.length };
  },
}
```

`peopleCount gte 5` then works with no change to the engine or the data.

## Error handling

| Failure | Behaviour |
|---|---|
| One met.no product fails | Its properties are unknown; the other still reports. `raining` defaults to `true`. |
| Both fail | `raining: true`; temperature/cloud unknown → outdoor and warm/sunny conditions all exclude. |
| A provider throws | Logged; contributes nothing. Its properties are unknown (fail-closed). |
| Invalid `TIMEZONE` | The clock provider throws → `month`/`hour`/… unknown → seasonal activities drop out; the unconditional tier still yields ~39 activities. |
| Malformed or misspelled `betingelse` | Logged with the activity id; that activity is excluded. |
| Worker unreachable from the screen | The screen returns to idle **without** marking the spin as run, so a later tick retries inside the grace window. The pool is settled before the countdown, so an outage costs no announcement. |

The two met.no products are fetched **concurrently** (`Promise.allSettled`) so a
brownout doesn't serialise two retry budgets ahead of a spin.

## Testing

- `test/query.test.js` — operators, precedence, parentheses, unknown → false for
  every operator, the `Object.prototype` hole, and the `not` fail-open pitfall
  (asserted so the trap is documented in executable form).
- `test/providers.test.js` — timezone-aware clock values, best-effort merge, a
  failing provider leaving properties unknown, duplicate-property rejection.
- `test/activities.test.js` — the three fallback tiers, malformed conditions,
  undeclared-property rejection.
- `test/data.test.js` — **every `betingelse` in the repo parses and references
  only declared properties**, so a typo fails `npm test` rather than reaching the
  screen.
- `test/weather.test.js` — both products, partial failure, and concurrency.

## Known limitations / future work

- **`temperature`, `sunny`, `cloudCover`, `precipitationRate`, `hour`, `weekday`
  and `dateISO` are not used by any activity yet.** The migration was
  deliberately behaviour-preserving. Until something uses them, the
  `locationforecast` call fetches data nothing reads.
- **`hour` is evaluated at prefetch time**, ~1 minute plus the countdown before
  the pick. On a 14:00 spin `hour eq 14` sees `13` and can never fire. Treat
  `hour` as approximate, or build the context at spin time.
- **Nothing ties "goes outside" to "has a rain guard".** The old schema forced a
  boolean `ute` on every activity; now an outdoor activity added without a
  `betingelse` is silently eligible in the rain.
- **String ordering is silently false** — `dateISO gt "2026-01-01"` never
  matches. Numeric `month`/`weekday` cover the real cases.
- **`/api/weather` has no remaining consumer.** Kept for compatibility.
- **No caching on `/api/activities`.** It is public and each call reaches met.no;
  fine at a couple of spins a day, worth revisiting if polling increases.
