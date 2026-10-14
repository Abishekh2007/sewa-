// Deterministic evaluation suite. Every case runs against a fresh copy of the seeded simulated dataset.
import type { AppState, RouteMode, TestResult, Vehicle } from '../types';
import { createSeedState } from '../data/seed';
import { addSensorReading, initialize, isOpenTask, rejectTask, setOnline, submitReport, verifyTask, advanceClock, type ReportInput } from './actions';
import { assessAll } from './evidence';
import { baselineRoute, computeRoute } from './routing';
import { SCENARIOS } from './scenarios';
import { toCsv } from '../utils/csv';

const fresh = () => initialize(createSeedState());
const st = (s: AppState, id: string) => assessAll(s).get(id)!.status;
function rep(s: AppState, p: Partial<ReportInput> & Pick<ReportInput, 'segmentRef' | 'condition'>): AppState {
  const [ns, , e] = submitReport(s, { category: 'other', description: 'Deterministic evaluation report.', observedAt: s.now, severity: 'moderate', sourceType: 'local_authority', sourceName: 'Ward Office R-7', vehicleAccess: 'unknown', origin: 'scenario', ...p });
  if (e.length) throw new Error(e.join('; '));
  return ns;
}
const block = (s: AppState, seg: string, category: ReportInput['category'] = 'flooded_road') => rep(s, { segmentRef: seg, condition: 'blocked', category });

/** Compare the proposed engine with a naive length-only shortest path. */
function compare(s: AppState, from: string, to: string, vehicle: Vehicle, mode: RouteMode) {
  const as = assessAll(s);
  const bad = (id: string) => { const a = as.get(id)!; return a.status === 'BLOCKED' || (a.status === 'STALE_EVIDENCE' && a.latest?.condition === 'blocked'); };
  const b = baselineRoute(s, from, to);
  const r = computeRoute(s, from, to, vehicle, mode, as);
  return {
    r,
    baseline: { usesBlocked: b ? b.segments.filter(bad).length : 0, uncertain: b ? b.segments.filter((x) => as.get(x)!.status !== 'VERIFIED_PASSABLE').length : 0, lengthKm: b?.lengthKm ?? null },
    proposed: { usesBlocked: r.best ? r.best.segments.filter(bad).length : 0, uncertain: r.best?.uncertainSegments.length ?? 0, lengthKm: r.best?.lengthKm ?? null, found: r.found },
  };
}

type Case = { id: string; name: string; category: string; expected: string; run: () => { passed: boolean; observed: string; baseline?: TestResult['baseline']; proposed?: TestResult['proposed'] } };
const path = (segs?: string[]) => segs?.join('→') ?? 'none';

const CASES: Case[] = [
  { id: 'T01', name: 'Normal route', category: 'Routing', expected: 'Route J01→J12 found via Main Bridge S03', run() {
    const c = compare(fresh(), 'J01', 'J12', 'ambulance', 'FASTEST');
    return { passed: c.r.found && c.r.best!.segments.includes('S03'), observed: path(c.r.best?.segments), ...c };
  } },
  { id: 'T02', name: 'Confirmed blockage excluded', category: 'Routing', expected: 'Route avoids blocked S03; baseline would use it', run() {
    const c = compare(block(fresh(), 'S03'), 'J01', 'J12', 'ambulance', 'FASTEST');
    return { passed: c.r.found && !c.r.best!.segments.includes('S03') && c.baseline.usesBlocked === 1, observed: `${path(c.r.best?.segments)}; baseline blocked=${c.baseline.usesBlocked}`, ...c };
  } },
  { id: 'T03', name: 'Two alternative routes', category: 'Routing', expected: '≥2 distinct alternatives for J01→J12', run() {
    const c = compare(fresh(), 'J01', 'J12', 'ambulance', 'FASTEST');
    return { passed: c.r.alternatives.length >= 2, observed: `${c.r.alternatives.length} alternatives: ${c.r.alternatives.map((a) => a.segments.join('→')).join(' | ')}`, ...c };
  } },
  { id: 'T04', name: 'Conflicting reports', category: 'Evidence', expected: 'S15 CONFLICTING + conflict task', run() {
    let s = rep(fresh(), { segmentRef: 'S15', condition: 'passable', sourceType: 'responder', sourceName: 'Unit RES-1 crew' });
    s = rep(s, { segmentRef: 'S15', condition: 'blocked', category: 'flooded_road', sourceType: 'public_anonymous', sourceName: 'Anonymous' });
    const t = s.tasks.find((x) => x.segmentId === 'S15' && x.reason === 'conflict');
    return { passed: st(s, 'S15') === 'CONFLICTING_EVIDENCE' && !!t, observed: `${st(s, 'S15')}, task ${t?.id ?? 'none'}` };
  } },
  { id: 'T05', name: 'Stale evidence (flood-prone, 4 h)', category: 'Evidence', expected: 'After +6 h, S03 STALE and stale task', run() {
    const s = advanceClock(fresh(), 360);
    return { passed: st(s, 'S03') === 'STALE_EVIDENCE' && s.tasks.some((t) => t.segmentId === 'S03' && t.reason === 'stale'), observed: st(s, 'S03') };
  } },
  { id: 'T06', name: 'Hazard-specific expiry', category: 'Evidence', expected: 'After 3 h, flood block stale (2 h) but fallen-tree block active (12 h)', run() {
    let s = block(fresh(), 'S04', 'flooded_road');
    s = block(s, 'S05', 'fallen_tree');
    s = advanceClock(s, 180);
    return { passed: st(s, 'S04') === 'STALE_EVIDENCE' && st(s, 'S05') === 'BLOCKED', observed: `S04 ${st(s, 'S04')}, S05 ${st(s, 'S05')}` };
  } },
  { id: 'T07', name: 'Unknown road', category: 'Evidence', expected: 'S29 (no observations) is UNKNOWN', run() {
    const s = fresh();
    return { passed: st(s, 'S29') === 'UNKNOWN', observed: st(s, 'S29') };
  } },
  { id: 'T08', name: 'No reports ≠ passable', category: 'Evidence', expected: 'S34 UNKNOWN and never used by conservative routing', run() {
    const s = fresh();
    const c = compare(s, 'J18', 'J09', 'ambulance', 'CONSERVATIVE');
    return { passed: st(s, 'S34') === 'UNKNOWN' && !(c.r.best?.segments ?? []).includes('S34'), observed: `${st(s, 'S34')}; route ${path(c.r.best?.segments)}`, ...c };
  } },
  { id: 'T09', name: 'Vehicle restriction (fire tender)', category: 'Routing', expected: 'Fire tender to J08 avoids 10 t bridge S08', run() {
    const c = compare(fresh(), 'J01', 'J08', 'fire_truck', 'FASTEST');
    return { passed: c.r.found && !c.r.best!.segments.includes('S08'), observed: path(c.r.best?.segments), ...c };
  } },
  { id: 'T10', name: 'Evidence-based vehicle limit', category: 'Routing', expected: 'Verified "4x4 only" on S03: ambulance avoids, 4x4 may use', run() {
    let s = rep(fresh(), { segmentRef: 'S03', condition: 'hazard', category: 'flooded_road', sourceType: 'responder', sourceName: 'Unit RES-1 crew' });
    const t = s.tasks.find((x) => x.segmentId === 'S03' && isOpenTask(x))!;
    s = verifyTask(s, t.id, { condition: 'hazard', category: 'flooded_road', restrictsTo: ['rescue_4x4'] }, 'Verifier Team A');
    const amb = computeRoute(s, 'J01', 'J12', 'ambulance', 'FASTEST');
    const x4 = computeRoute(s, 'J01', 'J12', 'rescue_4x4', 'FASTEST');
    return { passed: !amb.best!.segments.includes('S03') && x4.best!.segments.includes('S03'), observed: `ambulance ${path(amb.best?.segments)}; 4x4 ${path(x4.best?.segments)}` };
  } },
  { id: 'T11', name: 'No adequately verified route', category: 'Routing', expected: 'All crossings blocked → explicit no-route result', run() {
    let s = block(fresh(), 'S03'); s = block(s, 'S08', 'damaged_bridge'); s = block(s, 'S15');
    const c = compare(s, 'J01', 'J12', 'ambulance', 'FASTEST');
    return { passed: !c.r.found && c.r.explanation[0] === 'NO ADEQUATELY VERIFIED ROUTE FOUND', observed: c.r.explanation[0], ...c };
  } },
  { id: 'T12', name: 'Offline queue and sync', category: 'Offline', expected: 'Report queued offline, applied on reconnect, sync logged', run() {
    let s = setOnline(fresh(), false);
    const ev0 = s.evidence.length;
    s = rep(s, { segmentRef: 'S24', condition: 'hazard', category: 'debris', sourceType: 'responder', sourceName: 'Unit AMB-1 crew' });
    const queued = s.offline.queue.length, unchanged = s.evidence.length === ev0;
    s = setOnline(s, true);
    return { passed: queued === 1 && unchanged && s.offline.queue.length === 0 && s.evidence.length === ev0 + 1 && s.offline.syncLog.length === 1, observed: `queued=${queued}, after sync queue=${s.offline.queue.length}, log=${s.offline.syncLog.length}` };
  } },
  { id: 'T13', name: 'Sensor threshold event', category: 'Sensor', expected: '40 cm on WL-01 → alert + sensor_alert task', run() {
    const s = addSensorReading(fresh(), 'WL-01', 40);
    const t = s.tasks.find((x) => x.segmentId === 'S15' && x.reason === 'sensor_alert');
    return { passed: !!t && s.audit.some((a) => a.type === 'sensor_alert') && st(s, 'S15') === 'POTENTIAL_HAZARD', observed: `${st(s, 'S15')}, task ${t?.id ?? 'none'}` };
  } },
  { id: 'T14', name: 'Out-of-range sensor reading', category: 'Sensor', expected: '999 cm flagged out_of_range; no road status change', run() {
    const s0 = fresh();
    const s = addSensorReading(s0, 'WL-01', 999);
    return { passed: s.readings.at(-1)!.flag === 'out_of_range' && s.evidence.length === s0.evidence.length && st(s, 'S15') === 'VERIFIED_PASSABLE', observed: `${s.readings.at(-1)!.flag}, S15 ${st(s, 'S15')}` };
  } },
  { id: 'T15', name: 'Verified road reopening', category: 'Verification', expected: 'Blocked S03 verified passable → route uses S03 again', run() {
    let s = block(fresh(), 'S03');
    s = advanceClock(s, 30);
    s = rep(s, { segmentRef: 'S03', condition: 'passable', sourceType: 'responder', sourceName: 'Unit AMB-1 crew' });
    const mid = st(s, 'S03');
    const t = s.tasks.find((x) => x.segmentId === 'S03' && isOpenTask(x))!;
    s = verifyTask(advanceClock(s, 15), t.id, { condition: 'passable' }, 'Verifier Team A');
    const c = compare(s, 'J01', 'J12', 'ambulance', 'FASTEST');
    return { passed: mid === 'BLOCKED' && st(s, 'S03') === 'VERIFIED_PASSABLE' && c.r.best!.segments.includes('S03'), observed: `${mid} → ${st(s, 'S03')}; ${path(c.r.best?.segments)}`, ...c };
  } },
  { id: 'T16', name: 'Duplicate submission rejected', category: 'Reporting', expected: 'Second identical report within window is not saved', run() {
    const s = rep(fresh(), { segmentRef: 'S04', condition: 'hazard', category: 'debris' });
    const [s2, id, errs] = submitReport(s, { category: 'debris', segmentRef: 'S04', condition: 'hazard', description: 'Deterministic evaluation report.', observedAt: s.now, severity: 'moderate', sourceType: 'local_authority', sourceName: 'Ward Office R-7', vehicleAccess: 'unknown' });
    return { passed: id === null && errs.length === 1 && s2.reports.length === s.reports.length, observed: errs[0] ?? 'saved' };
  } },
  { id: 'T17', name: 'Legacy segment ID', category: 'Reporting', expected: 'R7-OLD-15 maps to S15 and creates legacy_id task', run() {
    const s = rep(fresh(), { segmentRef: 'R7-OLD-15', condition: 'hazard', category: 'debris' });
    const ev = s.evidence.at(-1)!;
    return { passed: ev.segmentId === 'S15' && ev.legacyIdMatch === 'R7-OLD-15' && s.tasks.some((t) => t.reason === 'legacy_id'), observed: `${ev.segmentId}, legacy=${ev.legacyIdMatch}` };
  } },
  { id: 'T18', name: 'Anonymous report stays unverified', category: 'Evidence', expected: 'Anonymous "blocked" on S04 → POTENTIAL HAZARD, not BLOCKED', run() {
    const s = rep(fresh(), { segmentRef: 'S04', condition: 'blocked', category: 'fallen_tree', sourceType: 'public_anonymous', sourceName: 'Anonymous' });
    return { passed: st(s, 'S04') === 'POTENTIAL_HAZARD' && s.reports.at(-1)!.status === 'unverified', observed: st(s, 'S04') };
  } },
  { id: 'T19', name: 'Conservative excludes uncertain', category: 'Routing', expected: 'J01→J18: fastest uses stale S22, conservative avoids it', run() {
    const s = fresh();
    const f = computeRoute(s, 'J01', 'J18', 'ambulance', 'FASTEST');
    const c = compare(s, 'J01', 'J18', 'ambulance', 'CONSERVATIVE');
    return { passed: f.best!.segments.includes('S22') && !c.r.best!.segments.includes('S22') && c.r.best!.uncertainSegments.length === 0, observed: `fastest ${path(f.best?.segments)}; conservative ${path(c.r.best?.segments)}`, ...c };
  } },
  { id: 'T20', name: 'Evidence mode prefers verified roads', category: 'Routing', expected: 'J01→J17: fastest uses hazard-flagged S20, evidence mode avoids it', run() {
    const s = fresh();
    const f = computeRoute(s, 'J01', 'J17', 'ambulance', 'FASTEST');
    const c = compare(s, 'J01', 'J17', 'ambulance', 'EVIDENCE');
    return { passed: f.best!.segments.includes('S20') && !c.r.best!.segments.includes('S20'), observed: `fastest ${path(f.best?.segments)}; evidence ${path(c.r.best?.segments)}`, ...c };
  } },
  { id: 'T21', name: 'Stale blockage still excluded', category: 'Routing', expected: 'Expired flood block on S03 → STALE, routing still avoids S03', run() {
    const s = advanceClock(block(fresh(), 'S03'), 150);
    const c = compare(s, 'J01', 'J12', 'ambulance', 'FASTEST');
    return { passed: st(s, 'S03') === 'STALE_EVIDENCE' && !c.r.best!.segments.includes('S03'), observed: `${st(s, 'S03')}; ${path(c.r.best?.segments)}`, ...c };
  } },
  { id: 'T22', name: 'Water level above threshold', category: 'Evidence', expected: '"Passable" with 45 cm water → CONFLICTING', run() {
    const s = rep(fresh(), { segmentRef: 'S04', condition: 'passable', sourceType: 'responder', sourceName: 'Unit AMB-1 crew', waterLevelCm: 45 });
    return { passed: st(s, 'S04') === 'CONFLICTING_EVIDENCE', observed: st(s, 'S04') };
  } },
  { id: 'T23', name: 'Rejected report restores status', category: 'Verification', expected: 'Rejecting anonymous debris on S20 → VERIFIED PASSABLE', run() {
    let s = fresh();
    const before = st(s, 'S20');
    const t = s.tasks.find((x) => x.segmentId === 'S20' && isOpenTask(x))!;
    s = rejectTask(s, t.id, 'No debris found on inspection.');
    return { passed: before !== 'VERIFIED_PASSABLE' && st(s, 'S20') === 'VERIFIED_PASSABLE', observed: `${before} → ${st(s, 'S20')}` };
  } },
  { id: 'T24', name: 'Last-mile meeting point', category: 'Last mile', expected: 'S27 blocked → J21 proposed for J20', run() {
    const s = block(fresh(), 'S27', 'fallen_tree');
    const c = compare(s, 'J12', 'J20', 'ambulance', 'CONSERVATIVE');
    return { passed: !c.r.found && c.r.lastMile[0]?.nodeId === 'J21', observed: c.r.lastMile.map((l) => `${l.nodeId}:${l.remainingKm}km`).join(', '), ...c };
  } },
  { id: 'T25', name: 'CSV export quoting', category: 'Export', expected: 'Commas, quotes and newlines escaped per RFC 4180', run() {
    const csv = toCsv([{ a: 'x,y', b: 'say "hi"', c: 'l1\nl2', d: 3 }]);
    const ok = csv === 'a,b,c,d\r\n"x,y","say ""hi""","l1\nl2",3';
    return { passed: ok, observed: JSON.stringify(csv) };
  } },
  { id: 'T26', name: 'Persistence round-trip', category: 'Persistence', expected: 'Serialised state reloads with identical statuses and routes', run() {
    const s = block(fresh(), 'S03');
    const back = JSON.parse(JSON.stringify(s)) as AppState;
    const a = assessAll(s), b = assessAll(back);
    const same = s.segments.every((x) => a.get(x.id)!.status === b.get(x.id)!.status);
    const r1 = computeRoute(s, 'J01', 'J12', 'ambulance', 'FASTEST'), r2 = computeRoute(back, 'J01', 'J12', 'ambulance', 'FASTEST');
    return { passed: same && path(r1.best?.segments) === path(r2.best?.segments) && back.reports.length === s.reports.length, observed: `statuses equal=${same}` };
  } },
  { id: 'T27', name: 'Scenario reset determinism', category: 'Demo', expected: 'All 8 scenarios pass and repeat identically', run() {
    const bad = SCENARIOS.filter((sc) => { const a = sc.run(), b = sc.run(); return !a.pass || JSON.stringify(a.observed) !== JSON.stringify(b.observed); });
    return { passed: bad.length === 0, observed: bad.length ? `Failing: ${bad.map((b) => b.id).join(', ')}` : '8/8 deterministic and passing' };
  } },
];

export const TEST_CASES = CASES.map(({ run: _r, ...meta }) => meta);

export function runAllTests(): TestResult[] {
  return CASES.map(({ run, ...meta }) => {
    const t0 = performance.now();
    try {
      const o = run();
      return { ...meta, ...o, ms: Math.round((performance.now() - t0) * 100) / 100 };
    } catch (e) {
      return { ...meta, passed: false, observed: `Error: ${e instanceof Error ? e.message : String(e)}`, ms: Math.round((performance.now() - t0) * 100) / 100 };
    }
  });
}
