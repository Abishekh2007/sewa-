# Video handoff — RAKSHA-PATH X demo (HyperFrames)

Everything a HyperFrames session needs to produce the demo video **without re-running the intent interview**. The answers below count as confirmed.

## How to start

1. Start the app: double-click `RAKSHA-PATH X.exe` (serves `http://localhost:4173`) or run `npm run dev` (`http://localhost:5173`).
2. Create the video project in a **new, empty sibling folder**, e.g. `C:\Users\thena\Desktop\sewa\raksha-path-x-video`. `hyperframes init` refuses a non-empty directory, so never put it inside the app repo.
3. Open Claude Code in that folder and paste:

> Make a demo video for my web app using HyperFrames. Read `C:\Users\thena\Desktop\sewa\raksha-path-x\docs\VIDEO_HANDOFF.md`. Its brief is already confirmed, so ask no interview questions. During Setup, write it to `BRIEF.md` verbatim. Capture the screens by following the shot list against the running app at http://localhost:4173.

## Confirmed brief (write to `BRIEF.md` during the workflow's Setup)

```markdown
---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "Every route needs evidence — RAKSHA-PATH X only routes responders over roads with recent, credible proof of passability."
destination: youtube
aspect: 1920x1080
language: en
audience: "Competition judges (SEVA First Innovation Challenge 2026, Theme 5: Surakshit Bharat) — engineers and emergency-management reviewers"
length: 75s
angle: show — site tour following one flood-day story
---

## Intent

Show the working prototype as-is: a guided tour of the real app following one
simulated flood day. Calm, credible, engineering-grade, the opposite of hype.
It should feel like a control-room tool demonstrated by its builders. Feature the
app's own captured screens as the video's assets (show-it-as-is, not a promo
with invented UI).

## Assets

- Live app at http://localhost:4173 (or :5173). Capture screens per the shot list in docs/VIDEO_HANDOFF.md.
- C:\Users\thena\Desktop\sewa\raksha-path-x\docs\DESIGN.md: the app's visual language; the video's type/colour should match it.

## Customizations

- Oversized cursor on clicks that matter (Start scenario, Why this status?, Verify).
- Callout labels drawn over captured screens to point at the changing road and the route line.
- Count-up only on figures measured in the app (see Notes).
- On-screen captions carry the story; voice-over optional (see VO draft). The video must work muted.

## Notes

- Every scene must keep a visible "Simulated data · fictional test area" disclosure. Never imply live or real emergency data.
- Allowed numbers: only those visible in the app. 34 road segments; 8/8 demo scenarios pass; 27/27 evaluation cases pass; 34/34 automated tests; baseline-vs-proposed figures exactly as shown on the Analytics page. No invented claims ("99% accurate", "50% faster", lives saved).
- Never say a route is "safe". Say "verified passable", "evidence-backed", "adequately verified".
- Show that humans decide: the app is decision support, never automatic dispatch.
- Palette: graphite dark UI; status colours: green = verified passable, amber = potential hazard, red = blocked, grey = unknown, indigo = stale, orange = conflicting. Font: IBM Plex Sans / IBM Plex Mono.
```

## App facts for the storyboard

- **Product:** RAKSHA-PATH X, Proof-of-Passability Emergency Intelligence Network. Tagline: "Every Route Needs Evidence. Every Rescue Needs a Safer Path."
- **Core idea:** navigation apps answer "what is the shortest route?". RAKSHA-PATH X answers "which routes have recent, reliable evidence that they are passable, and what should responders do when they don't?"
- **Road statuses:** Verified passable · Potential hazard · Blocked · Unknown · Stale evidence · Conflicting evidence. Each has a glyph, a label and a colour.
- **Routing modes:** Fastest available · Evidence-prioritized · Conservative emergency. Blocked roads are never used. With no adequately verified route, the app says so and suggests the nearest reachable meeting point instead of inventing a route.
- **Places on the map (fictional):** Emergency Response Station (west), District Hospital (east), river crossed by the Main Bridge (S03), Upper Bridge (S08) and Low Causeway (S15); Eastern Colony; South Gate meeting point.
- The app state persists in browser storage. Use **Reset** (top bar) before capturing to start from the seeded state. The simulated clock starts at 08:30.

## Shot list (capture at 1920×1080, dark theme)

Hash routes deep-link: `http://localhost:4173/#/<page>`. The demo states come from **#/demo → pick scenario → Start scenario**; the scenario sheet then shows the map with the route and the route result.

| # | Beat (≈s) | Where / what to do | What the frame must show |
|---|---|---|---|
| 1 | Hook (0–6) | Title card (no capture) | "Navigation finds a route. Rescue needs proof the road is passable." |
| 2 | Overview (6–14) | `#/dashboard` after Reset | Network-condition bar (34 cells), key figures, map |
| 3 | Map (14–20) | `#/map` | Cartographic map: river, bridges, legend. Slow push-in |
| 4 | Flood (20–32) | `#/demo` → **01 Flood blocks the fastest route** → Start | Main Bridge S03 turns red Blocked; route redraws over another crossing; "Avoids 1 confirmed blocked segment" |
| 5 | Conflict (32–42) | **02 Conflicting reports** → Start; then `#/map?segment=S15` → expand **Why this status?** | Orange Conflicting on the causeway; both reports kept; verification task created |
| 6 | Fail-safe (42–52) | **04 No adequately verified route** → Start | Red-bordered "NO ADEQUATELY VERIFIED ROUTE FOUND", excluded crossings listed, recommend human verification |
| 7 | Last mile (52–58) | **05 Alternative access point** → Start | Meeting point (South Gate) highlighted, remaining distance, "Requires human confirmation" |
| 8 | Reopen (58–66) | **08 Hazard cleared** → Start (optionally show `#/tasks` Verify) | Road back to green Verified passable; route recalculated over the bridge |
| 9 | Proof (66–72) | `#/analytics` → Run evaluation; quick cuts of `#/sensors`, `#/offline` | Pass counts, baseline comparison; sensor alert; offline queue |
| 10 | Close (72–75) | End card | Tagline + "Simulated prototype · fictional data · decision support for trained responders" |

Optional extra beats if length allows: **03 Stale evidence** (clock +6 h, roads turn indigo Stale); **06 Offline synchronization**; **07 Sensor alert**.

## Optional voice-over draft (≈75 s, restructure freely)

> When a flood hits, the shortest route isn't the question. The question is: which roads do we actually have evidence for?
> RAKSHA-PATH X tracks every road in the network as verified, hazardous, blocked, unknown, stale, or conflicting, with the evidence behind each.
> The main bridge floods. It's confirmed blocked, and the route moves to a crossing that's still verified.
> Two reports disagree about the causeway. Neither one is trusted automatically: both are kept, and a field verifier is tasked.
> When every crossing is blocked, the system doesn't invent a route. It says so, and finds the nearest reachable meeting point for responders to confirm.
> Once the bridge is inspected and reopened, routes recalculate immediately.
> Every scenario here is reproducible and tested against a plain shortest-path baseline.
> RAKSHA-PATH X. Every route needs evidence.
