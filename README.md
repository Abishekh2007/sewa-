# RAKSHA-PATH X — Proof-of-Passability Emergency Intelligence Network

*Every Route Needs Evidence. Every Rescue Needs a Safer Path.*
Prototype for SEVA First Innovation Challenge 2026, Theme 5: Surakshit Bharat.

> **All data is simulated.** The road network "Sector R-7" is fictional. No real road conditions are shown, no emergency service is dispatched, and trained human responders remain responsible for every operational decision.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # vitest: engine unit tests + full evaluation suite
npm run build      # typecheck + production build
npm run preview    # serve the build; the service worker enables offline reload
```

No API keys, accounts or paid services are needed. Data persists in the browser's `localStorage`. Use **Reset** in the top bar to restore the seed.

## Architecture

```
src/
  types.ts            data model (RoadSegment, EvidenceRecord, HazardReport, RouteResult, VerificationTask, ...)
  data/seed.ts        fictional network (22 junctions, 34 segments), seed evidence, incidents, sensors, costs
  engine/evidence.ts  Proof-of-Passability assessment (pure)
  engine/routing.ts   Dijkstra routing, 3 modes, alternatives, last-mile reachability (pure)
  engine/actions.ts   state transitions, reconciliation, tasks, audit, offline sync, sensors, permissions
  engine/scenarios.ts 8 live-demo scenarios built from real actions
  engine/testcases.ts 27 deterministic evaluation cases with a baseline comparison
  engine/engine.test.ts vitest suite
  state/store.tsx     React store, localStorage persistence, hash router
  ui/                 design-system primitives, SVG network map, route view, segment detail
  pages/              one file per module (dashboard, map, incidents, hazards, tasks, sensors, ...)
  utils/csv.ts        RFC 4180 CSV export
```

Routing and evidence logic have no UI dependencies and are tested independently.

## Evidence rules (summary)

- **Trust tiers:** verified (3) > authenticated responder/authority/verifier (2) > identified public or sensor (1) > anonymous (0).
- **Freshness:** each observation expires after a configurable limit per hazard type. For example, a flood report expires after 2 h and a fallen tree after 12 h. Passable evidence expires after 12 h, or after 4 h on flood-prone roads. An expired hazard never lets older "passable" evidence come back into use.
- **BLOCKED** requires an authenticated or verified source. A confirmed block is lifted only by a newer *verified* observation.
- **CONFLICTING** applies when recent observations disagree, or when a "passable" report includes water above the test threshold. Both records are kept and a verification task is created.
- **POTENTIAL HAZARD** covers unverified or non-blocking hazard reports, including sensor alerts. A sensor never establishes passability.
- **UNKNOWN** means no evidence. Absence of reports is never treated as passable.
- Duplicates (same source and claim within 30 min) are counted once. Legacy segment IDs are mapped and flagged for verification.
- Confidence is qualitative (High / Medium / Low) and every status has a "Why this status?" explanation.

## Routing modes

| Mode | Behaviour |
|---|---|
| Fastest available | Minimises estimated time. Excludes blocked, stale-blocked and vehicle-incompatible segments. Uncertain segments are counted but not penalised. |
| Evidence-prioritised | Same exclusions, plus configurable cost multipliers for stale, unknown, hazard and conflicting segments. |
| Conservative emergency | Uses only verified-passable segments. Otherwise reports **NO ADEQUATELY VERIFIED ROUTE FOUND**, lists the blocking segments and ranks reachable meeting points. |

Times are estimates from simulated configured speeds. The fastest route is not necessarily the safest.

## Acceptance tests → where demonstrated

| Test | Evidence |
|---|---|
| A normal route | T01, Network & routing page |
| B blocked avoided | T02, Scenario 1 |
| C no verified route | T11, Scenario 4 |
| D conflict → task | T04, Scenario 2 |
| E stale evidence | T05/T06, Scenario 3 |
| F verification changes routing | T15, Scenario 8 |
| G offline queue + sync | T12, Scenario 6, Offline page |
| H sensor alert + task | T13, Scenario 7, Sensors page |
| I persistence after reload | T26 + unit test (localStorage) |
| J analytics from real records | Analytics page (derived from stored state) |
| K CSV export | T25 + Exports page |
| L no paid keys | no external services used |
| M built-in dataset only | all scenarios run from the seed |
| N simulated vs field data | SIMULATION MODE badge, SIMULATED tags, CSV header line |

Run `npm test` for current pass counts. The in-app **Analytics → Run evaluation** shows the same suite.

## Known limitations

- Fictional network and simulated data only. Nothing has been field-validated.
- Freshness limits and penalties are untested assumptions and need calibration with responders.
- Client-side roles are **not** security. A real deployment needs server-side authorisation.
- LocalStorage and the audit log are not tamper-proof.
- Alternative routes use first-order edge removal, not full k-shortest-paths.
- The ESP32 adapter is a software interface only, fed by a simulated sensor.

## Pilot plan

1. Software simulation (this prototype).
2. Controlled routing tests with responders on tabletop exercises.
3. Stakeholder feedback (ward office, ambulance, fire services).
4. Optional ESP32 water-level demonstration at a non-public test site.
5. Limited pilot, subject to permissions, data-protection review and validation.

## One-click start (Windows)

Double-click **`RAKSHA-PATH X.exe`**. It serves the prebuilt app from `dist/` on `http://localhost:4173` and opens your browser (no Node.js needed). Close the console window to stop. If `dist/` is missing it runs `npm install && npm run build` first (needs Node.js 18+). Rebuild the launcher with `launcher\build-launcher.cmd`; after changing source, run `npm run build` so `dist/` is current.
