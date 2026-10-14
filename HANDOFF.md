# Handoff — RAKSHA-PATH X

Prototype for **SEVA First Innovation Challenge 2026, Theme 5: Surakshit Bharat**.
"Every route needs evidence. Every rescue needs a safer path."

An emergency-routing decision-support web app that only treats a road as passable when there is recent, credible evidence for it. Everything runs locally on a built-in **fictional** test area ("Sector R-7"); no APIs, keys, or real data.

## Status (as of 14 Oct 2026)

| Area | State |
|---|---|
| Evidence engine, routing, actions | Done, unit-tested |
| All 13 pages | Built and redesigned (see `docs/DESIGN.md`) |
| Tests | 34/34 pass (`npm test`): 27 deterministic evaluation cases + 7 unit tests |
| Demo scenarios | 8/8 pass, deterministic |
| Build | `npm run build` clean (one >500 kB chunk warning, harmless) |
| One-click launcher | `RAKSHA-PATH X.exe` serves `dist/`, no Node needed |
| Git | `main`, 2 commits, clean. No remote configured yet |
| Browser-verified | Dashboard and Network & routing pages only. Other pages typecheck but have not been visually reviewed |

## Run it

- **One click (Windows):** double-click `RAKSHA-PATH X.exe` → opens `http://localhost:4173`. Close the console window to stop.
- **Dev:** `npm install`, then `npm run dev` → `http://localhost:5173`
- **Checks:** `npm test`, `npm run typecheck`, `npm run build`
- **After any source change:** run `npm run build` before committing so `dist/` (served by the exe) stays current. `dist/` is committed on purpose.
- **Rebuild the exe:** `launcher\build-launcher.cmd` (uses the C# compiler built into Windows).

## Architecture

```
src/
  types.ts            all data model interfaces
  data/seed.ts        fictional network (22 junctions, 34 segments), seed evidence, incidents, sensors, costs
  engine/
    evidence.ts       Proof-of-Passability: assessSegment() → status, confidence, reasons
    routing.ts        Dijkstra, 3 modes, alternatives, last-mile, length-only baseline
    actions.ts        every state change as a pure (state) => state function; reconcile() logs status changes and opens verification tasks
    scenarios.ts      8 demo scenarios built from real actions
    testcases.ts      27 evaluation cases vs baseline
    engine.test.ts    vitest suite
  state/store.tsx     React context, localStorage persistence, hash router (#/page?param=…)
  ui/kit.tsx          design-system primitives (StatusChip, Panel, Table, Button…)
  ui/NetworkMap.tsx   SVG cartographic map (pan/zoom, layers, route overlay)
  pages/*.tsx         one file per nav entry
launcher/             C# source for the one-click exe
docs/DESIGN.md        UI rules every page follows
docs/VIDEO_HANDOFF.md brief + shot list for the HyperFrames demo video
```

The engine has no UI dependencies and can be tested on its own. The UI only calls `update(s => action(s, …))`.

## Key rules (do not regress)

- No reports ≠ passable. A road with no evidence is `UNKNOWN`.
- A confirmed `BLOCKED` road is never routed through. A block is lifted only by a verified inspection.
- A road whose last known state was blocked stays excluded even after the evidence goes stale.
- Contradicting reports are both kept. The road is marked `CONFLICTING_EVIDENCE` and a verification task opens.
- Anonymous reports stay unverified until a field verifier confirms them.
- Freshness limits vary by hazard type (configurable in Settings). Flood-prone roads expire faster.
- No numeric "AI confidence". Confidence is qualitative (High/Medium/Low) based on trust tier and evidence age.
- Every screen discloses simulated data. Never present results as field-validated.

## Known gaps / next steps

1. Visually review the pages not yet checked in a browser: Incidents, Hazards, Tasks, Sensors, Offline, Audit, Settings, Implementation, Exports, Demo, Analytics.
2. Partly restyled: Offline tables, Implementation cost/risk tables, Settings trust panels, Hazards report detail and preview window, Tasks action grouping.
3. "Compute route" on the map page calculates twice, so the displayed route ID differs from the audit-log ID. The route itself is identical.
4. Code-split the bundle (Recharts) to clear the build warning.
5. Roles are client-side only and not real security. The audit log lives in localStorage and is not tamper-proof. A real deployment needs a backend with server-side authorization.
6. Push: `git remote add origin <url>` then `git push -u origin main`.
7. Demo video: see `docs/VIDEO_HANDOFF.md`.
