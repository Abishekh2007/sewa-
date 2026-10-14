// Graph routing (Dijkstra) with evidence-aware modes. Pure functions.
import type { AppState, Junction, LastMileOption, RoadSegment, RouteMode, RoutePath, RouteResult, SegmentAssessment, Vehicle } from '../types';
import { VEHICLE_LABEL } from '../types';
import { assessAll, fmtAge, STATUS_LABEL } from './evidence';

type Ctx = Pick<AppState, 'segments' | 'junctions' | 'evidence' | 'config' | 'now'>;
interface EdgeEval { allowed: boolean; cost: number; reason?: string }

export function evalSegment(seg: RoadSegment, a: SegmentAssessment, mode: RouteMode | 'BASELINE', vehicle: Vehicle, cfg: Ctx['config']): EdgeEval {
  const time = (seg.lengthKm / seg.speedKmh) * 60;
  if (mode === 'BASELINE') return { allowed: true, cost: seg.lengthKm };
  if (!seg.allowedVehicles.includes(vehicle)) return { allowed: false, cost: Infinity, reason: `Static restriction: ${seg.restrictionNote ?? 'vehicle not permitted'}` };
  if (a.vehicleLimits && !a.vehicleLimits.includes(vehicle)) return { allowed: false, cost: Infinity, reason: `Evidence limits access to ${a.vehicleLimits.map((v) => VEHICLE_LABEL[v]).join(', ')}` };
  if (a.status === 'BLOCKED') return { allowed: false, cost: Infinity, reason: 'Confirmed blocked' };
  if (a.status === 'STALE_EVIDENCE' && a.latest?.condition === 'blocked') return { allowed: false, cost: Infinity, reason: 'Last known blocked; evidence stale' };
  if (mode === 'CONSERVATIVE' && a.status !== 'VERIFIED_PASSABLE') return { allowed: false, cost: Infinity, reason: `${STATUS_LABEL[a.status]} — conservative mode requires verified passability` };
  if (mode === 'EVIDENCE' && a.status !== 'VERIFIED_PASSABLE') return { allowed: true, cost: time * cfg.penalties[a.status as keyof typeof cfg.penalties] };
  return { allowed: true, cost: time };
}

interface Graph { adj: Map<string, { to: string; seg: RoadSegment }[]> }
function buildGraph(segments: RoadSegment[]): Graph {
  const adj = new Map<string, { to: string; seg: RoadSegment }[]>();
  for (const s of segments) {
    if (!adj.has(s.from)) adj.set(s.from, []);
    if (!adj.has(s.to)) adj.set(s.to, []);
    adj.get(s.from)!.push({ to: s.to, seg: s });
    adj.get(s.to)!.push({ to: s.from, seg: s });
  }
  return { adj };
}

/** Dijkstra from `from`; returns distances and predecessor edges for every reachable node. */
function dijkstra(g: Graph, from: string, weight: (seg: RoadSegment) => number, banned: Set<string>) {
  const dist = new Map<string, number>([[from, 0]]);
  const prev = new Map<string, { node: string; seg: string }>();
  const done = new Set<string>();
  while (true) {
    let u: string | null = null;
    let best = Infinity;
    for (const [n, d] of dist) if (!done.has(n) && d < best) { best = d; u = n; }
    if (u === null) break;
    done.add(u);
    for (const { to, seg } of g.adj.get(u) ?? []) {
      if (banned.has(seg.id)) continue;
      const w = weight(seg);
      if (!isFinite(w)) continue;
      const nd = best + w;
      if (nd < (dist.get(to) ?? Infinity)) { dist.set(to, nd); prev.set(to, { node: u, seg: seg.id }); }
    }
  }
  return { dist, prev };
}

function extract(prev: Map<string, { node: string; seg: string }>, from: string, to: string) {
  const nodes = [to];
  const segs: string[] = [];
  let cur = to;
  while (cur !== from) {
    const p = prev.get(cur);
    if (!p) return null;
    segs.unshift(p.seg);
    nodes.unshift(p.node);
    cur = p.node;
  }
  return { nodes, segs };
}

function summarize(nodes: string[], segIds: string[], cost: number, segMap: Map<string, RoadSegment>, as: Map<string, SegmentAssessment>, vehicle: Vehicle): RoutePath {
  let lengthKm = 0, est = 0;
  const statusCounts: RoutePath['statusCounts'] = {};
  const uncertain: string[] = [];
  const ages: number[] = [];
  const restrictions = new Set<string>();
  for (const id of segIds) {
    const s = segMap.get(id)!;
    const a = as.get(id)!;
    lengthKm += s.lengthKm;
    est += (s.lengthKm / s.speedKmh) * 60;
    statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
    if (a.status !== 'VERIFIED_PASSABLE') uncertain.push(id);
    if (a.latestAgeMin !== null) ages.push(a.latestAgeMin);
    if (s.restrictionNote) restrictions.add(`${s.id} ${s.name}: ${s.restrictionNote}`);
    if (a.vehicleLimits) restrictions.add(`${s.id}: evidence limits access to ${a.vehicleLimits.join(', ')} (${VEHICLE_LABEL[vehicle]} permitted)`);
  }
  return {
    nodes,
    segments: segIds,
    lengthKm: Math.round(lengthKm * 100) / 100,
    estMinutes: Math.round(est * 10) / 10,
    cost: Math.round(cost * 100) / 100,
    uncertainSegments: uncertain,
    statusCounts,
    oldestEvidenceMin: ages.length ? Math.max(...ages) : null,
    newestEvidenceMin: ages.length ? Math.min(...ages) : null,
    restrictions: [...restrictions],
  };
}

export function km(a: Junction, b: Junction) { return Math.hypot(a.x - b.x, a.y - b.y) / 100; }

let routeSeq = 0;
export function computeRoute(ctx: Ctx, from: string, to: string, vehicle: Vehicle, mode: RouteMode, assessments?: Map<string, SegmentAssessment>): RouteResult {
  const t0 = performance.now();
  const as = assessments ?? assessAll(ctx);
  const segMap = new Map(ctx.segments.map((s) => [s.id, s]));
  const jMap = new Map(ctx.junctions.map((j) => [j.id, j]));
  const g = buildGraph(ctx.segments);
  const evals = new Map(ctx.segments.map((s) => [s.id, evalSegment(s, as.get(s.id)!, mode, vehicle, ctx.config)]));
  const w = (s: RoadSegment) => evals.get(s.id)!.cost;

  // Naive baseline: geometric shortest path ignoring all evidence.
  const base = dijkstra(g, from, (s) => s.lengthKm, new Set());
  const basePath = extract(base.prev, from, to);
  const blockedAvoided = (basePath?.segs ?? []).filter((id) => {
    const a = as.get(id)!;
    return a.status === 'BLOCKED' || (a.status === 'STALE_EVIDENCE' && a.latest?.condition === 'blocked');
  });

  const main = dijkstra(g, from, w, new Set());
  const p = extract(main.prev, from, to);
  const explanation: string[] = [`Mode: ${mode === 'FASTEST' ? 'Fastest available' : mode === 'EVIDENCE' ? 'Evidence-prioritized' : 'Conservative emergency'} for ${VEHICLE_LABEL[vehicle]}. Times are estimates from simulated configured road speeds.`];
  const result: RouteResult = {
    id: `RTE-${Date.now().toString(36)}-${++routeSeq}`,
    at: ctx.now, from, to, vehicle, mode,
    found: !!p && from !== to,
    alternatives: [],
    blockedAvoided,
    excluded: [],
    explanation,
    lastMile: [],
    computeMs: 0,
  };
  if (from === to) { explanation.push('Origin and destination are the same node.'); result.found = false; }

  if (p && from !== to) {
    result.best = summarize(p.nodes, p.segs, main.dist.get(to)!, segMap, as, vehicle);
    // Alternatives: ban each segment of the best path in turn (first-order Yen), keep distinct paths.
    const seen = new Set([p.segs.join('>')]);
    const alts: RoutePath[] = [];
    for (const sid of p.segs) {
      const r = dijkstra(g, from, w, new Set([sid]));
      const ap = extract(r.prev, from, to);
      if (!ap) continue;
      const key = ap.segs.join('>');
      if (seen.has(key)) continue;
      seen.add(key);
      alts.push(summarize(ap.nodes, ap.segs, r.dist.get(to)!, segMap, as, vehicle));
    }
    result.alternatives = alts.sort((a, b) => a.cost - b.cost).slice(0, 2);
    if (blockedAvoided.length) explanation.push(`Avoids ${blockedAvoided.length} confirmed/last-known blocked segment(s) on the geometric shortest path: ${blockedAvoided.join(', ')}.`);
    for (const id of basePath?.segs ?? []) if (!evals.get(id)!.allowed) result.excluded.push({ segmentId: id, reason: evals.get(id)!.reason! });
    const u = result.best.uncertainSegments;
    explanation.push(u.length ? `Route includes ${u.length} segment(s) without verified passability (${u.join(', ')}); field confirmation recommended before relying on them.` : 'Every segment on this route has current authenticated or verified passability evidence.');
    if (mode === 'FASTEST') explanation.push('Fastest is not necessarily safest: uncertain segments are counted but not penalised in this mode.');
    if (mode === 'EVIDENCE') explanation.push('Uncertain segments carry configurable cost penalties, so better-evidenced roads are preferred.');
    if (!result.alternatives.length) explanation.push('No distinct alternative route exists under the current constraints.');
  } else if (from !== to) {
    explanation.unshift('NO ADEQUATELY VERIFIED ROUTE FOUND');
    // Frontier: excluded segments touching the reachable region.
    const reach = new Set(main.dist.keys());
    for (const s of ctx.segments) {
      const e = evals.get(s.id)!;
      if (!e.allowed && (reach.has(s.from) !== reach.has(s.to))) result.excluded.push({ segmentId: s.id, reason: e.reason! });
    }
    explanation.push(`Destination cannot be reached under ${mode} rules. Segments preventing access: ${result.excluded.map((x) => `${x.segmentId} (${x.reason})`).join('; ') || 'none adjacent'}.`);
    explanation.push('Recommended: dispatch field verification for the listed segments and coordinate with the emergency control room. Do not attempt to cross floodwater or blocked roads. Human responders make the final decision.');
    // Last-mile: reachable nodes closest to the destination.
    const dest = jMap.get(to)!;
    const opts: LastMileOption[] = [];
    for (const n of reach) {
      if (n === from) continue;
      const j = jMap.get(n)!;
      const rem = km(j, dest);
      const lp = extract(main.prev, from, n)!;
      const path = summarize(lp.nodes, lp.segs, main.dist.get(n)!, segMap, as, vehicle);
      const blocking = result.excluded.filter((x) => { const s = segMap.get(x.segmentId)!; return s.from === n || s.to === n; });
      const verified = path.segments.length - path.uncertainSegments.length;
      opts.push({
        nodeId: n,
        remainingKm: Math.round(rem * 100) / 100,
        path,
        blockingSegments: blocking,
        evidenceSummary: `${verified}/${path.segments.length} access segments verified passable; oldest evidence ${fmtAge(path.oldestEvidenceMin)}.${j.meetingPoint ? ' Designated candidate meeting point.' : ''}`,
      });
    }
    result.lastMile = opts
      .sort((a, b) => (a.remainingKm - b.remainingKm) || (a.path.uncertainSegments.length - b.path.uncertainSegments.length))
      .slice(0, 3);
    if (result.lastMile.length) explanation.push(`Nearest reachable access point: ${jMap.get(result.lastMile[0].nodeId)!.name} (${result.lastMile[0].remainingKm} km straight-line from destination). Requires human confirmation before operational use.`);
  }
  result.computeMs = Math.round((performance.now() - t0) * 1000) / 1000;
  return result;
}

/** Plain shortest path by length, ignoring evidence — used as the evaluation baseline. */
export function baselineRoute(ctx: Ctx, from: string, to: string) {
  const g = buildGraph(ctx.segments);
  const r = dijkstra(g, from, (s) => s.lengthKm, new Set());
  const p = extract(r.prev, from, to);
  return p ? { segments: p.segs, nodes: p.nodes, lengthKm: Math.round(r.dist.get(to)! * 100) / 100 } : null;
}
