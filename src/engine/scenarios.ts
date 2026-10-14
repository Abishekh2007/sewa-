// Live-demo scenarios. Each run builds real application state from the seed using real actions.
import type { AppState, DemoScenario, HazardCategory, ObservedCondition, RouteMode, RouteResult, SourceType, Vehicle } from '../types';
import { createSeedState } from '../data/seed';
import { advanceClock, initialize, injectRemoteRecord, isOpenTask, runRoute, setOnline, simulateSensorStep, submitReport, verifyTask } from './actions';
import { assessAll, STATUS_LABEL } from './evidence';

export interface ScenarioRun { state: AppState; route?: RouteResult; observed: string[]; pass: boolean; log: string[] }
export type Scenario = DemoScenario & { run: () => ScenarioRun };

function report(s: AppState, seg: string, condition: ObservedCondition, category: HazardCategory, sourceType: SourceType, sourceName: string, extra: { waterLevelCm?: number } = {}): AppState {
  const [ns, , errs] = submitReport(s, {
    category, segmentRef: seg, condition, sourceType, sourceName,
    description: `Scenario observation: ${category.replace('_', ' ')} on ${seg} (simulated).`,
    observedAt: s.now, severity: condition === 'blocked' ? 'critical' : 'moderate',
    vehicleAccess: condition === 'blocked' ? 'none' : 'unknown', origin: 'scenario', ...extra,
  });
  if (errs.length) throw new Error(errs.join('; '));
  return ns;
}
const status = (s: AppState, seg: string) => assessAll(s).get(seg)!.status;
const openTask = (s: AppState, seg: string, reason?: string) => s.tasks.find((t) => t.segmentId === seg && isOpenTask(t) && (!reason || t.reason === reason));
function route(s: AppState, from: string, to: string, vehicle: Vehicle, mode: RouteMode): [AppState, RouteResult] {
  return runRoute(s, from, to, vehicle, mode);
}
const pathTxt = (r: RouteResult) => (r.found ? `${r.best!.segments.join('→')} (${r.best!.lengthKm} km, ~${r.best!.estMinutes} min est.)` : 'NO ADEQUATELY VERIFIED ROUTE FOUND');
const fresh = () => initialize(createSeedState());

export const SCENARIOS: Scenario[] = [
  {
    id: 'SC1', title: 'Flood blocks the fastest route',
    summary: 'The Main Bridge (S03) on the direct station→hospital route is reported flooded and blocked by the local authority.',
    steps: ['Compute ambulance route J01→J12 (fastest).', 'Local authority submits a BLOCKED flooded-road report for S03.', 'Recompute the route.'],
    expected: 'S03 becomes BLOCKED; the new route excludes S03 and uses a supported alternative crossing.',
    run() {
      const log: string[] = [];
      let s = fresh();
      let r0: RouteResult; [s, r0] = route(s, 'J01', 'J12', 'ambulance', 'FASTEST');
      log.push(`Before: ${pathTxt(r0)}`);
      s = report(s, 'S03', 'blocked', 'flooded_road', 'local_authority', 'Ward Office R-7');
      log.push(`S03 status: ${STATUS_LABEL[status(s, 'S03')]}`);
      let r: RouteResult; [s, r] = route(s, 'J01', 'J12', 'ambulance', 'FASTEST');
      log.push(`After: ${pathTxt(r)}`);
      const pass = r0.best!.segments.includes('S03') && status(s, 'S03') === 'BLOCKED' && r.found && !r.best!.segments.includes('S03') && r.blockedAvoided.includes('S03');
      return { state: { ...s, activeScenario: 'SC1' }, route: r, log, pass, observed: [`S03 → ${STATUS_LABEL[status(s, 'S03')]}`, `New route: ${pathTxt(r)}`, `Blocked segments avoided vs. geometric shortest path: ${r.blockedAvoided.join(', ') || 'none'}`] };
    },
  },
  {
    id: 'SC2', title: 'Conflicting reports',
    summary: 'A responder says the Low Causeway (S15) is passable; an anonymous caller says it is blocked.',
    steps: ['Responder submits PASSABLE for S15.', 'Anonymous public report submits BLOCKED for S15.', 'Evidence engine re-assesses S15.'],
    expected: 'S15 becomes CONFLICTING EVIDENCE, both reports are preserved, and a verification task is created.',
    run() {
      const log: string[] = [];
      let s = fresh();
      s = report(s, 'S15', 'passable', 'other', 'responder', 'Unit RES-1 crew');
      log.push('Responder passable report saved.');
      s = report(s, 'S15', 'blocked', 'flooded_road', 'public_anonymous', 'Anonymous caller');
      log.push('Anonymous blocked report saved.');
      const st = status(s, 'S15');
      const t = openTask(s, 'S15', 'conflict');
      const preserved = s.evidence.filter((e) => e.segmentId === 'S15' && e.origin === 'scenario').length;
      let r: RouteResult; [s, r] = route(s, 'J01', 'J12', 'ambulance', 'CONSERVATIVE');
      log.push(`Conservative route: ${pathTxt(r)}`);
      return { state: { ...s, activeScenario: 'SC2' }, route: r, log, pass: st === 'CONFLICTING_EVIDENCE' && !!t && preserved === 2, observed: [`S15 → ${STATUS_LABEL[st]}`, `Reports preserved: ${preserved}`, t ? `Verification task ${t.id} (${t.priority}) created` : 'No task created'] };
    },
  },
  {
    id: 'SC3', title: 'Stale evidence',
    summary: 'Six simulated hours pass with no new inspections. Flood-prone roads have a 4 h evidence limit.',
    steps: ['Compute conservative ambulance route J01→J12.', 'Advance the simulated clock by 6 hours.', 'Recompute the route.'],
    expected: 'S03, S15, S24, S25, S32 become STALE; re-inspection tasks are created; the conservative route stops using S03.',
    run() {
      const log: string[] = [];
      let s = fresh();
      let r0: RouteResult; [s, r0] = route(s, 'J01', 'J12', 'ambulance', 'CONSERVATIVE');
      log.push(`Before: ${pathTxt(r0)}`);
      s = advanceClock(s, 360);
      const as = assessAll(s);
      const stale = s.segments.filter((x) => as.get(x.id)!.status === 'STALE_EVIDENCE').map((x) => x.id);
      log.push(`Stale segments: ${stale.join(', ')}`);
      let r: RouteResult; [s, r] = route(s, 'J01', 'J12', 'ambulance', 'CONSERVATIVE');
      log.push(`After: ${pathTxt(r)}`);
      const tasks = s.tasks.filter((t) => t.reason === 'stale' && isOpenTask(t)).length;
      const pass = ['S03', 'S15'].every((x) => stale.includes(x)) && tasks >= 2 && r0.best!.segments.includes('S03') && (!r.found || !r.best!.segments.includes('S03'));
      return { state: { ...s, activeScenario: 'SC3' }, route: r, log, pass, observed: [`Stale: ${stale.join(', ')}`, `Re-inspection tasks open: ${tasks}`, `Conservative route now: ${pathTxt(r)}`] };
    },
  },
  {
    id: 'SC4', title: 'No adequately verified route',
    summary: 'All three river crossings (S03, S08, S15) are confirmed blocked.',
    steps: ['Local authority confirms S03, S08, S15 blocked.', 'Compute fastest ambulance route J01→J12.'],
    expected: 'The engine reports NO ADEQUATELY VERIFIED ROUTE FOUND, lists blocking segments, recommends verification/coordination and offers west-bank access points.',
    run() {
      const log: string[] = [];
      let s = fresh();
      s = report(s, 'S03', 'blocked', 'flooded_road', 'local_authority', 'Ward Office R-7');
      s = report(s, 'S08', 'blocked', 'damaged_bridge', 'local_authority', 'Ward Office R-7');
      s = report(s, 'S15', 'blocked', 'flooded_road', 'local_authority', 'Ward Office R-7');
      log.push('Three crossings reported blocked.');
      let r: RouteResult; [s, r] = route(s, 'J01', 'J12', 'ambulance', 'FASTEST');
      log.push(r.explanation.join(' | '));
      const ex = r.excluded.map((x) => x.segmentId);
      const pass = !r.found && r.explanation[0] === 'NO ADEQUATELY VERIFIED ROUTE FOUND' && ['S03', 'S08', 'S15'].every((x) => ex.includes(x));
      return { state: { ...s, activeScenario: 'SC4' }, route: r, log, pass, observed: [r.explanation[0], `Blocking segments: ${ex.join(', ')}`, `Nearest reachable points: ${r.lastMile.map((l) => `${l.nodeId} (${l.remainingKm} km)`).join(', ') || 'none'}`] };
    },
  },
  {
    id: 'SC5', title: 'Alternative access point',
    summary: 'A fallen tree blocks Colony Access Road (S27), the closest road to a patient in Eastern Colony (J20).',
    steps: ['Local authority confirms S27 blocked (fallen tree).', 'Compute conservative ambulance route from the hospital (J12) to J20.', 'Rank reachable meeting points.'],
    expected: 'No verified route to J20; South Gate (J21) is proposed as a meeting point via verified S28, with remaining distance and the blocking segment shown. Human confirmation required.',
    run() {
      const log: string[] = [];
      let s = fresh();
      s = report(s, 'S27', 'blocked', 'fallen_tree', 'local_authority', 'Ward Office R-7');
      let r: RouteResult; [s, r] = route(s, 'J12', 'J20', 'ambulance', 'CONSERVATIVE');
      log.push(r.explanation.join(' | '));
      const top = r.lastMile[0];
      const pass = !r.found && top?.nodeId === 'J21';
      return { state: { ...s, activeScenario: 'SC5' }, route: r, log, pass, observed: [r.found ? 'Route found (unexpected)' : r.explanation[0], top ? `Top meeting point ${top.nodeId}: ${top.remainingKm} km remaining; ${top.evidenceSummary}` : 'No meeting point', top ? `Blocking: ${top.blockingSegments.map((b) => `${b.segmentId} (${b.reason})`).join('; ')}` : ''] };
    },
  },
  {
    id: 'SC6', title: 'Offline synchronization',
    summary: 'A responder files a debris report while offline; meanwhile the authority marks the same road passable on the server.',
    steps: ['Go offline (simulated).', 'Responder reports debris on S24 — queued.', '20 min later, a remote authority "passable" record for S24 reaches the server.', 'Reconnect and synchronise.'],
    expected: 'Report is queued (not applied) while offline; on sync both records are preserved, S24 shows CONFLICTING EVIDENCE and an offline-conflict task is created.',
    run() {
      const log: string[] = [];
      let s = fresh();
      s = setOnline(s, false);
      s = report(s, 'S24', 'hazard', 'debris', 'responder', 'Unit AMB-1 crew');
      const queued = s.offline.queue.length;
      log.push(`Queued while offline: ${queued}`);
      s = advanceClock(s, 20);
      s = injectRemoteRecord(s, { segmentId: 'S24', kind: 'report', condition: 'passable', observedAt: s.now, sourceType: 'local_authority', sourceName: 'Ward Office R-7', verification: 'unverified' });
      s = setOnline(s, true);
      const sync = s.offline.syncLog.at(-1)!;
      log.push(`Sync: ${sync.details}`);
      const st = status(s, 'S24');
      const t = openTask(s, 'S24', 'offline_conflict');
      const pass = queued === 1 && s.offline.queue.length === 0 && st === 'CONFLICTING_EVIDENCE' && !!t && sync.conflicts >= 1;
      return { state: { ...s, activeScenario: 'SC6' }, log, pass, observed: [`Queued offline: ${queued}`, `Sync result: ${sync.details}`, `S24 → ${STATUS_LABEL[st]}`, t ? `Task ${t.id} (offline conflict)` : 'No task'] };
    },
  },
  {
    id: 'SC7', title: 'Sensor alert',
    summary: 'Simulated gauge WL-01 on the Low Causeway (S15) reports a rising water level.',
    steps: ['Feed four deterministic simulated readings: 12, 22, 34, 47 cm (warning threshold 30 cm).'],
    expected: 'Readings ≥ 30 cm raise a sensor alert; S15 becomes POTENTIAL HAZARD (not BLOCKED — a sensor alone does not establish passability) and a sensor-alert verification task is created.',
    run() {
      const log: string[] = [];
      let s = fresh();
      for (let i = 0; i < 4; i++) {
        s = simulateSensorStep(s, 'WL-01');
        const rd = s.readings.at(-1)!;
        log.push(`Reading ${rd.valueCm} cm → ${rd.flag}`);
      }
      const st = status(s, 'S15');
      const t = openTask(s, 'S15', 'sensor_alert');
      const alerts = s.audit.filter((a) => a.type === 'sensor_alert').length;
      return { state: { ...s, activeScenario: 'SC7' }, log, pass: st === 'POTENTIAL_HAZARD' && !!t && alerts >= 1, observed: [`S15 → ${STATUS_LABEL[st]}`, `Sensor alerts logged: ${alerts}`, t ? `Task ${t.id} (${t.priority}) pending verification` : 'No task'] };
    },
  },
  {
    id: 'SC8', title: 'Hazard cleared',
    summary: 'Main Bridge (S03) was blocked; a crew reports it clear and a field verifier confirms the reopening.',
    steps: ['Authority reports S03 blocked; route avoids S03.', '30 min later a responder reports S03 passable (conflict task created).', 'Field verifier inspects and verifies S03 passable.', 'Recompute route.'],
    expected: 'S03 stays BLOCKED until verification; after verification it becomes VERIFIED PASSABLE and the route uses S03 again.',
    run() {
      const log: string[] = [];
      let s = fresh();
      s = report(s, 'S03', 'blocked', 'flooded_road', 'local_authority', 'Ward Office R-7');
      let r1: RouteResult; [s, r1] = route(s, 'J01', 'J12', 'ambulance', 'FASTEST');
      log.push(`Blocked: ${pathTxt(r1)}`);
      s = advanceClock(s, 30);
      s = report(s, 'S03', 'passable', 'other', 'responder', 'Unit AMB-1 crew');
      const mid = status(s, 'S03');
      log.push(`After unverified "passable" claim: ${STATUS_LABEL[mid]}`);
      const t = openTask(s, 'S03');
      s = advanceClock(s, 15);
      if (t) s = verifyTask(s, t.id, { condition: 'passable', note: 'Water receded; deck inspected (simulated).' }, 'Verifier Team A');
      const st = status(s, 'S03');
      let r: RouteResult; [s, r] = route(s, 'J01', 'J12', 'ambulance', 'FASTEST');
      log.push(`After verification: ${pathTxt(r)}`);
      const pass = !r1.best?.segments.includes('S03') && mid === 'BLOCKED' && !!t && st === 'VERIFIED_PASSABLE' && r.found && r.best!.segments.includes('S03');
      return { state: { ...s, activeScenario: 'SC8' }, route: r, log, pass, observed: [`Before verification: ${STATUS_LABEL[mid]}`, `After verification (${t?.id ?? 'no task'}): ${STATUS_LABEL[st]}`, `Route: ${pathTxt(r)}`] };
    },
  },
];
