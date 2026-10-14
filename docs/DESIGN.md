# RAKSHA-PATH X — UI design brief

Product: emergency-operations decision-support console (React 18 + TS + Vite + Tailwind v4). Must look like a professional control-room tool designed by a senior product designer — not an AI-generated dashboard.

## Tokens (src/index.css `@theme`, use as Tailwind classes e.g. `bg-surface text-muted border-line`)
bg, surface, surface-2, raised, line, line-strong, ink, muted, faint, accent, ok (verified), warn (potential hazard), crit (blocked), unk (unknown), stale, conf (conflicting), land, water. Dark default, light via `[data-theme=light]`. Never hardcode hex colours in components.

## Principles
- Calm, precise, information-dense (Linear / Vercel / Bloomberg-terminal restraint). Hierarchy from type size, weight, spacing and alignment — not from boxes.
- NO: gradients, glows, emoji, drop shadows on cards, rounded-xl/2xl cards, ALL-CAPS labels, grids of identical coloured stat boxes, coloured big numbers, decorative icons everywhere, centered hero text.
- Sentence-case labels. Section titles 13–14px semibold. Page titles 18–20px semibold. Body 13–14px.
- Numbers: tabular (`num` class), ink colour; colour only signals meaning (status/severity), shown as small marks/dots/bars.
- Mono font (`font-mono`) only for IDs, timestamps, coordinates.
- Prefer full-bleed sections separated by 1px `border-line` dividers over nested cards. Max 1 level of panel nesting.
- Status always = glyph + text + colour (use `StatusChip`, `STATUS_STYLE` from `src/ui/kit.tsx`).
- Tables: sentence-case muted headers, 36–40px rows, hover row tint, right-align numbers.
- Buttons: primary = inverted (ink bg / bg text); secondary = hairline border; ghost for toolbars. Heights 28/32/36px. Radius ≤4px.
- Empty / loading / error states written in plain language.
- Accessible: keyboard focus visible, aria-labels, ≥32px touch targets, responsive to 360px wide (no horizontal page scroll).
- Keep every "simulated / fictional data" disclosure, but make it quiet (muted small text), not shouty badges.

## Rules for implementers
- Keep all functionality, exported names, props, URL params and store actions working. Do not edit `src/engine/*`, `src/types.ts`, `src/state/*`, `src/data/*`.
- Only edit the files you own. Need a new primitive? Define it locally in your file.
- Finish with `npx tsc --noEmit` clean for your files. Do not run the dev server, do not commit.
