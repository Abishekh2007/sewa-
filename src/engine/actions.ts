// State transitions. Every action is a pure function (state, ...args) => new state.
// Status changes, audit events and verification tasks are derived in `reconcile`.
import type {
  AppState, AuditEvent, AuditType, EmergencyIncident, EvidenceRecord, HazardReport, IncidentStatus, ObservedCondition,
  HazardCategory, Priority, RouteMode, SensorReading, TaskStatus, Vehicle, VerificationTask, EvidenceConfig, UserRole,
} from '../types';
import { ROLE_LABEL } from '../types';
import { assessAll, STATUS_LABEL } from './evidence';
import { computeRoute as engineRoute } from './routing';

const MIN = 60_000;
const OPEN: TaskStatus[] = ['Pending', 'Assigned', 'In progress', 'Escalated'];
export const isOpenTask = (t: VerificationTask) => OPEN.includes(t.status);

export function nextId(s: AppState, prefix: string, pad = 4) {
  s.counters[prefix] = (s.counters[prefix] ?? 0) + 1;
  return `${prefix}-${String(s.counters[prefix]).padStart(pad, '0')}`;
}

export function audit(s: AppState, type: AuditType, recordId: string, details: string, source: AuditEvent['source'] = 'demo-user', actor?: string) {
  s.audit.push({ id: nextId(s, 'EVT', 5), type, at: s.now, wallAt: Date.now(), recordId, source, actor: actor ?? ROLE_LABEL[s.role], details });
  if (s.audit.length > 3000) s.audit.splice(0, s.audit.length - 3000);
}

const clone = (s: AppState): AppState => structuredClone(s);

/** Recompute segment statuses; log changes; open verification tasks where evidence needs a human. */
export function reconcile(s: AppState, cause = 'evidence update'): AppState {
  const as = assessAll(s);
  for (const seg of s.segments) {
    const a = as.get(seg.id)!;
    const prev = seg.history.at(-1)?.to ?? null;
    if (prev !== a.status) {
      seg.history.push({ at: s.now, from: prev, to: a.status, reason: `${cause}: ${a.reasons[0] ?? ''}` });
      if (prev !== null) audit(s, 'status_change', seg.id, `${seg.id} ${seg.name}: ${STATUS_LABEL[prev]} → ${STATUS_LABEL[a.status]} (${cause})`, 'system', 'Evidence engine');
    }
    const hasOpen = s.tasks.some((t) => t.segmentId === seg.id && isOpenTask(t));
    if (hasOpen) continue;
    let reason: VerificationTask['reason'] | null = null;
    let priority: Priority = 'P2';
    const major = ['arterial', 'bridge', 'causeway'].includes(seg.roadType);
    if (a.status === 'CONFLICTING_EVIDENCE' || (a.status === 'BLOCKED' && a.conflicting.length)) {
      reason = a.considered.some((e) => e.origin === 'offline-sync') ? 'offline_conflict' : 'conflict';
      priority = major ? 'P1' : 'P2';
    } else if (a.status === 'POTENTIAL_HAZARD') {
      reason = a.considered.some((e) => e.kind === 'sensor' && e.condition !== 'passable') ? 'sensor_alert' : 'unverified_hazard';
      priority = major ? 'P1' : 'P2';
    } else if (a.status === 'STALE_EVIDENCE') {
      reason = 'stale';
      priority = 'P3';
    }
    if (!reason) continue;
    const due = { P1: 30, P2: 60, P3: 240, P4: 480 }[priority];
    const t: VerificationTask = {
      id: nextId(s, 'TSK'),
      segmentId: seg.id,
      reason,
      description: `${STATUS_LABEL[a.status]} on ${seg.id} ${seg.name}. ${a.reasons[0] ?? ''}`,
      relatedEvidence: (a.conflicting.length ? a.conflicting : a.considered.length ? a.considered : a.latest ? [a.latest] : []).map((e) => e.id),
      priority,
      createdAt: s.now,
      dueAt: s.now + due * MIN,
      status: 'Pending',
      notes: [],
    };
    s.tasks.push(t);
    audit(s, 'task_created', t.id, `Verification task for ${seg.id} (${reason}, ${priority})`, 'system', 'Evidence engine');
  }
  return s;
}

// ---------- Reports ----------
export interface ReportInput {
  category: HazardCategory;
  segmentRef: string; // segment id OR legacy id
  description: string;
  observedAt: number;
  severity: HazardReport['severity'];
  condition: ObservedCondition;
  sourceType: HazardReport['sourceType'];
  sourceName: string;
  vehicleAccess: HazardReport['vehicleAccess'];
  waterLevelCm?: number;
  image?: HazardReport['image'];
  contact?: HazardReport['contact'];
  origin?: HazardReport['origin'];
}

export function resolveSegmentRef(s: AppState, ref: string): { segmentId: string | null; legacy: boolean } {
  const r = ref.trim().toUpperCase();
  if (s.segments.some((x) => x.id === r)) return { segmentId: r, legacy: false };
  const m = s.segments.find((x) => x.formerIds?.includes(r));
  return m ? { segmentId: m.id, legacy: true } : { segmentId: null, legacy: false };
}

export function validateReport(s: AppState, r: ReportInput): string[] {
  const errs: string[] = [];
  if (!resolveSegmentRef(s, r.segmentRef).segmentId) errs.push(`Road segment "${r.segmentRef}" does not match any current or legacy segment ID.`);
  if (r.description.trim().length < 10) errs.push('Description must be at least 10 characters.');
  if (!r.sourceName.trim()) errs.push('Reporting source name is required (use "Anonymous" for anonymous reports).');
  if (!isFinite(r.observedAt)) errs.push('Observation time is required.');
  if (r.observedAt > s.now + 5 * MIN) errs.push('Observation time cannot be in the future of the simulated clock.');
  if (r.waterLevelCm !== undefined && (r.waterLevelCm < 0 || r.waterLevelCm > 500)) errs.push('Water level must be 0–500 cm.');
  if (r.contact?.value && !r.contact.consent) errs.push('Contact details require explicit consent; remove them or tick consent.');
  return errs;
}

const fingerprint = (r: ReportInput, segId: string) => `${segId}|${r.category}|${r.condition}|${r.sourceName.trim().toLowerCase()}`;

const accessToVehicles = (v: HazardReport['vehicleAccess']): Vehicle[] | undefined =>
  v === 'high_clearance_only' ? ['rescue_4x4'] : v === 'two_wheeler_only' ? ['motorcycle'] : undefined;

/** Returns [state, reportId | null, errors]. */
export function submitReport(state: AppState, input: ReportInput): [AppState, string | null, string[]] {
  const errs = validateReport(state, input);
  if (errs.length) return [state, null, errs];
  const s = clone(state);
  const { segmentId, legacy } = resolveSegmentRef(s, input.segmentRef);
  const fp = fingerprint(input, segmentId!);
  const dup = [...s.reports, ...s.offline.queue].find((r) => r.fingerprint === fp && Math.abs(r.submittedAt - s.now) < s.config.duplicateWindowMin * MIN);
  if (dup) return [state, null, [`Possible duplicate of ${dup.id} submitted within the last ${s.config.duplicateWindowMin} min by the same source. Not saved.`]];
  const id = nextId(s, 'RPT');
  const report: HazardReport = {
    id,
    category: input.category,
    segmentId: segmentId!,
    submittedSegmentRef: input.segmentRef,
    description: input.description.trim(),
    observedAt: input.observedAt,
    submittedAt: s.now,
    severity: input.severity,
    condition: input.condition,
    sourceType: input.sourceType,
    sourceName: input.sourceName.trim(),
    vehicleAccess: input.vehicleAccess,
    waterLevelCm: input.waterLevelCm,
    image: input.image,
    contact: input.contact?.value ? input.contact : undefined,
    status: 'unverified',
    origin: input.origin ?? 'demo-user',
    fingerprint: fp,
  };
  if (!s.offline.online) {
    report.status = 'queued_offline';
    s.offline.queue.push(report);
    audit(s, 'report_queued', id, `Queued offline: ${input.category} on ${segmentId} (not yet applied to road status)`);
    return [s, id, []];
  }
  applyReport(s, report, legacy);
  return [reconcile(s, `report ${id}`), id, []];
}

function applyReport(s: AppState, report: HazardReport, legacy: boolean) {
  const evId = nextId(s, 'EV');
  const ev: EvidenceRecord = {
    id: evId,
    segmentId: report.segmentId,
    kind: 'report',
    condition: report.condition,
    category: report.condition === 'passable' ? undefined : report.category,
    observedAt: report.observedAt,
    receivedAt: s.now,
    sourceType: report.sourceType,
    sourceName: report.sourceName,
    verification: 'unverified',
    restrictsTo: report.condition !== 'blocked' ? accessToVehicles(report.vehicleAccess) : undefined,
    waterLevelCm: report.waterLevelCm,
    reportId: report.id,
    legacyIdMatch: legacy ? report.submittedSegmentRef : undefined,
    origin: report.origin,
    note: report.image ? `Image attached (${report.image.name}); location/time NOT validated from image.` : undefined,
  };
  report.evidenceId = evId;
  report.status = 'unverified';
  s.evidence.push(ev);
  s.reports.push(report);
  audit(s, 'report_created', report.id, `${report.category} (${report.condition}) on ${report.segmentId} by ${report.sourceType}${legacy ? ` — legacy ID ${report.submittedSegmentRef} mapped` : ''}`, report.origin === 'demo-user' ? 'demo-user' : 'simulated');
  if (legacy) {
    const t: VerificationTask = {
      id: nextId(s, 'TSK'), segmentId: report.segmentId, reason: 'legacy_id',
      description: `Report ${report.id} referenced legacy ID ${report.submittedSegmentRef}; confirm it refers to ${report.segmentId}.`,
      relatedEvidence: [evId], priority: 'P2', createdAt: s.now, dueAt: s.now + 60 * MIN, status: 'Pending', notes: [],
    };
    s.tasks.push(t);
    audit(s, 'task_created', t.id, `Legacy segment reference ${report.submittedSegmentRef} → ${report.segmentId}`, 'system', 'Evidence engine');
  }
}

// ---------- Verification tasks ----------
export function updateTask(state: AppState, taskId: string, patch: Partial<Pick<VerificationTask, 'assignee' | 'status' | 'priority'>>): AppState {
  const s = clone(state);
  const t = s.tasks.find((x) => x.id === taskId);
  if (!t) return state;
  if (patch.assignee !== undefined && patch.assignee !== t.assignee) {
    t.assignee = patch.assignee;
    if (t.status === 'Pending') t.status = 'Assigned';
    audit(s, 'assignment', t.id, `Assigned to ${patch.assignee}`);
  }
  if (patch.priority && patch.priority !== t.priority) { audit(s, 'task_updated', t.id, `Priority ${t.priority} → ${patch.priority}`); t.priority = patch.priority; }
  if (patch.status && patch.status !== t.status) {
    audit(s, 'task_updated', t.id, `Status ${t.status} → ${patch.status}`);
    t.status = patch.status;
    if (patch.status === 'Closed') t.closedAt = s.now;
  }
  return s;
}

export function addTaskNote(state: AppState, taskId: string, text: string): AppState {
  const s = clone(state);
  const t = s.tasks.find((x) => x.id === taskId);
  if (!t || !text.trim()) return state;
  t.notes.push({ at: s.now, by: ROLE_LABEL[s.role], text: text.trim() });
  audit(s, 'task_updated', t.id, `Inspection note added`);
  return s;
}

/** Field verification: records an independently verified inspection and re-evaluates routes. */
export function verifyTask(state: AppState, taskId: string, result: { condition: ObservedCondition; category?: HazardCategory; restrictsTo?: Vehicle[]; note?: string }, inspector?: string): AppState {
  const s = clone(state);
  const t = s.tasks.find((x) => x.id === taskId);
  if (!t) return state;
  const who = inspector ?? t.assignee ?? ROLE_LABEL[s.role];
  for (const id of t.relatedEvidence) {
    const e = s.evidence.find((x) => x.id === id);
    if (e && e.verification === 'unverified' && e.condition === result.condition && (e.condition === 'passable' || e.category === result.category || !result.category)) {
      e.verification = 'verified';
      if (e.reportId) { const r = s.reports.find((x) => x.id === e.reportId); if (r) r.status = 'verified'; }
    }
  }
  const evId = nextId(s, 'EV');
  s.evidence.push({
    id: evId, segmentId: t.segmentId, kind: 'inspection', condition: result.condition,
    category: result.condition === 'passable' ? undefined : result.category ?? 'other',
    observedAt: s.now, receivedAt: s.now, sourceType: 'field_verifier', sourceName: who,
    verification: 'verified', restrictsTo: result.restrictsTo?.length ? result.restrictsTo : undefined,
    origin: 'demo-user', note: result.note,
  });
  t.status = 'Verified';
  t.verifiedAt = s.now;
  t.result = { condition: result.condition, category: result.category, restrictsTo: result.restrictsTo };
  if (result.note) t.notes.push({ at: s.now, by: who, text: result.note });
  audit(s, 'verification', t.id, `${t.segmentId} verified as ${result.condition}${result.category ? ` (${result.category})` : ''} by ${who} → evidence ${evId}`);
  return reconcile(s, `verification ${t.id}`);
}

export function rejectTask(state: AppState, taskId: string, note: string): AppState {
  const s = clone(state);
  const t = s.tasks.find((x) => x.id === taskId);
  if (!t) return state;
  for (const id of t.relatedEvidence) {
    const e = s.evidence.find((x) => x.id === id);
    if (e && e.verification === 'unverified') {
      e.verification = 'rejected';
      if (e.reportId) { const r = s.reports.find((x) => x.id === e.reportId); if (r) r.status = 'rejected'; }
    }
  }
  t.status = 'Rejected';
  t.closedAt = s.now;
  t.notes.push({ at: s.now, by: ROLE_LABEL[s.role], text: note || 'Report not supported by inspection.' });
  audit(s, 'verification', t.id, `Unverified evidence on ${t.segmentId} rejected: ${note || 'not supported'}`);
  return reconcile(s, `rejection ${t.id}`);
}

// ---------- Incidents ----------
export type IncidentInput = Pick<EmergencyIncident, 'category' | 'nodeId' | 'priority' | 'peopleAffected' | 'vehicle' | 'accessibility' | 'notes'>;
export function createIncident(state: AppState, input: IncidentInput): [AppState, string] {
  const s = clone(state);
  const id = nextId(s, 'INC');
  s.incidents.push({ ...input, id, reportedAt: s.now, status: 'Received', timeline: [{ at: s.now, text: 'Incident created (simulated — no real dispatch)' }], simulated: true });
  audit(s, 'incident_created', id, `${input.category} at ${input.nodeId}, ${input.priority}`);
  return [s, id];
}

export function updateIncident(state: AppState, id: string, patch: Partial<EmergencyIncident>, text?: string): AppState {
  const s = clone(state);
  const inc = s.incidents.find((x) => x.id === id);
  if (!inc) return state;
  const changes: string[] = [];
  for (const k of Object.keys(patch) as (keyof EmergencyIncident)[]) {
    if (k === 'timeline') continue;
    if (JSON.stringify(inc[k]) !== JSON.stringify(patch[k])) changes.push(`${k}: ${String(inc[k] ?? '—')} → ${String(patch[k])}`);
  }
  Object.assign(inc, patch);
  if (patch.status === 'Resolved' && !inc.resolvedAt) inc.resolvedAt = s.now;
  if (patch.status === 'Closed') inc.closedAt = s.now;
  const msg = text ?? changes.join('; ');
  if (msg) {
    inc.timeline.push({ at: s.now, text: msg });
    audit(s, patch.status === 'Resolved' || patch.status === 'Closed' ? 'resolution' : patch.assignedUnit ? 'assignment' : 'incident_updated', id, msg);
  }
  return s;
}

export function setIncidentStatus(state: AppState, id: string, status: IncidentStatus, note?: string): AppState {
  return updateIncident(state, id, { status }, `Status → ${status}${note ? ` — ${note}` : ''}`);
}

// ---------- Routing ----------
export function runRoute(state: AppState, from: string, to: string, vehicle: Vehicle, mode: RouteMode, incidentId?: string): [AppState, ReturnType<typeof engineRoute>] {
  const r = engineRoute(state, from, to, vehicle, mode);
  const s = clone(state);
  s.routes.push(r);
  if (s.routes.length > 300) s.routes.splice(0, s.routes.length - 300);
  audit(s, 'route_calculated', incidentId ?? r.id, `${mode} ${from}→${to} (${vehicle}): ${r.found ? `${r.best!.lengthKm} km, ~${r.best!.estMinutes} min est., ${r.best!.uncertainSegments.length} uncertain` : 'NO ADEQUATELY VERIFIED ROUTE FOUND'}`, 'system', 'Route engine');
  if (incidentId) {
    const inc = s.incidents.find((x) => x.id === incidentId);
    if (inc) inc.lastRoute = { id: r.id, at: r.at, mode, found: r.found, from, to, vehicle, segments: r.best?.segments ?? [], lengthKm: r.best?.lengthKm, estMinutes: r.best?.estMinutes, uncertain: r.best?.uncertainSegments.length ?? 0 };
  }
  return [s, r];
}

// ---------- Sensors ----------
export function addSensorReading(state: AppState, sensorId: string, valueCm: number, origin: SensorReading['origin'] = 'sensor-sim'): AppState {
  const s = clone(state);
  const sensor = s.sensors.find((x) => x.id === sensorId);
  if (!sensor) return state;
  const flag: SensorReading['flag'] = valueCm < 0 || valueCm > sensor.maxPlausibleCm ? 'out_of_range' : valueCm >= sensor.criticalCm ? 'critical' : valueCm >= sensor.warnCm ? 'warn' : 'ok';
  const rd: SensorReading = { id: nextId(s, 'RD', 5), sensorId, at: s.now, valueCm, flag, origin };
  s.readings.push(rd);
  audit(s, 'sensor_reading', sensorId, `${sensorId} = ${valueCm} cm (${flag})`, 'sensor-sim', `${sensorId} (simulated feed)`);
  if (flag === 'out_of_range') { audit(s, 'sensor_alert', sensorId, `Out-of-range reading ${valueCm} cm ignored; check sensor`, 'sensor-sim', 'Sensor adapter'); return s; }
  if (flag === 'warn' || flag === 'critical') {
    s.evidence.push({
      id: nextId(s, 'EV'), segmentId: sensor.segmentId, kind: 'sensor', condition: 'hazard', category: 'flooded_road',
      observedAt: s.now, receivedAt: s.now, sourceType: 'sensor', sourceName: `${sensor.id} ${sensor.name} (simulated)`,
      verification: 'unverified', waterLevelCm: valueCm, origin: 'sensor-sim',
      note: `Water level ${valueCm} cm ≥ ${flag === 'critical' ? 'critical' : 'warning'} threshold. A sensor reading alone does not establish passability.`,
    });
    audit(s, 'sensor_alert', sensorId, `${flag.toUpperCase()}: ${valueCm} cm on ${sensor.segmentId}; verification required`, 'sensor-sim', 'Sensor adapter');
    return reconcile(s, `sensor ${sensorId}`);
  }
  return s;
}

export const SIM_SERIES = [12, 22, 34, 47, 58];
export function simulateSensorStep(state: AppState, sensorId: string): AppState {
  const k = `SIM_${sensorId}`;
  const i = state.counters[k] ?? 0;
  const s = addSensorReading(state, sensorId, SIM_SERIES[i % SIM_SERIES.length]);
  return { ...s, counters: { ...s.counters, [k]: i + 1 } };
}

export function setSensorConnected(state: AppState, sensorId: string, connected: boolean): AppState {
  const s = clone(state);
  const x = s.sensors.find((y) => y.id === sensorId);
  if (!x) return state;
  x.connected = connected;
  audit(s, 'sensor_alert', sensorId, connected ? 'Sensor reconnected' : 'Sensor disconnected — readings unavailable', 'sensor-sim', 'Sensor adapter');
  return s;
}

export function sensorHealth(s: AppState, sensorId: string): { state: 'ok' | 'disconnected' | 'missing'; lastAt: number | null } {
  const sen = s.sensors.find((x) => x.id === sensorId)!;
  const last = s.readings.filter((r) => r.sensorId === sensorId).at(-1);
  if (!sen.connected) return { state: 'disconnected', lastAt: last?.at ?? null };
  if (!last || s.now - last.at > sen.expectedIntervalMin * 3 * MIN) return { state: 'missing', lastAt: last?.at ?? null };
  return { state: 'ok', lastAt: last.at };
}

// ---------- Offline ----------
export function setOnline(state: AppState, online: boolean): AppState {
  const s = clone(state);
  s.offline.online = online;
  audit(s, 'offline_sync', 'network', online ? 'Connectivity restored (simulated)' : 'Went offline (simulated) — reports will be queued; displayed data is cached', 'system', 'Sync manager');
  return online ? syncOffline(s) : s;
}

/** Simulates a record that another device sent to the shared server while this device was offline. */
export function injectRemoteRecord(state: AppState, rec: Omit<EvidenceRecord, 'id' | 'origin' | 'receivedAt'>): AppState {
  const s = clone(state);
  s.offline.remoteInbox.push({ ...rec, id: nextId(s, 'EV'), receivedAt: s.now, origin: 'offline-sync' });
  return s;
}

export function syncOffline(state: AppState): AppState {
  const s = state.offline.online ? clone(state) : state;
  if (!s.offline.online) return state;
  const queue = s.offline.queue;
  const inbox = s.offline.remoteInbox;
  s.offline.queue = [];
  s.offline.remoteInbox = [];
  let unmatched = 0;
  for (const ev of inbox) s.evidence.push(ev);
  for (const r of queue) {
    const { segmentId, legacy } = resolveSegmentRef(s, r.submittedSegmentRef);
    if (!segmentId) { unmatched++; continue; }
    applyReport(s, { ...r, segmentId, origin: 'offline-sync' }, legacy);
  }
  const before = s.tasks.length;
  reconcile(s, 'offline sync');
  const touched = new Set([...queue.map((q) => q.segmentId), ...inbox.map((e) => e.segmentId)]);
  const as = assessAll(s);
  const conflicts = [...touched].filter((id) => as.get(id)?.status === 'CONFLICTING_EVIDENCE' || (as.get(id)?.conflicting.length ?? 0) > 0).length;
  const details = `${queue.length} queued report(s), ${inbox.length} remote record(s); ${conflicts} conflict(s); ${s.tasks.length - before} task(s) created; ${unmatched} unmatched`;
  s.offline.syncLog.push({ at: s.now, applied: queue.length - unmatched + inbox.length, conflicts, unmatched, details });
  s.offline.lastSyncAt = s.now;
  audit(s, 'offline_sync', 'sync', details, 'system', 'Sync manager');
  return s;
}

// ---------- Clock, config, roles ----------
export function advanceClock(state: AppState, minutes: number): AppState {
  const s = clone(state);
  s.now += minutes * MIN;
  audit(s, 'system', 'clock', `Simulated clock advanced ${minutes} min`, 'system', 'Simulation');
  if (s.offline.online) s.offline.lastSyncAt = s.now;
  return reconcile(s, `clock +${minutes} min`);
}

export function updateConfig(state: AppState, cfg: EvidenceConfig): AppState {
  const s = clone(state);
  s.config = structuredClone(cfg);
  audit(s, 'config_change', 'config', 'Evidence freshness / penalty configuration updated');
  return reconcile(s, 'configuration change');
}

export function setRole(state: AppState, role: UserRole): AppState {
  const s = clone(state);
  s.role = role;
  audit(s, 'system', 'role', `Demo role switched to ${ROLE_LABEL[role]} (client-side only, not real security)`);
  return s;
}

/** Initial reconciliation of the seed so history/tasks exist. */
export function initialize(s: AppState): AppState {
  const out = reconcile(clone(s), 'initial assessment');
  out.audit.unshift({ id: 'EVT-00000', type: 'system', at: out.now, wallAt: Date.now(), recordId: 'seed', source: 'simulated', actor: 'System', details: 'Simulated dataset "Sector R-7" loaded. All data is fictional.' });
  return out;
}

// ---------- Permissions (client-side demo only — NOT security) ----------
export type Permission = 'report' | 'incident' | 'verify' | 'assign' | 'config' | 'sensor' | 'scenario' | 'route' | 'cost';
const PERMS: Record<UserRole, Permission[]> = {
  coordinator: ['report', 'incident', 'verify', 'assign', 'config', 'sensor', 'scenario', 'route', 'cost'],
  field_verifier: ['report', 'verify', 'route'],
  local_authority: ['report', 'verify', 'assign', 'config', 'sensor', 'route', 'cost'],
  observer: [],
};
export const can = (role: UserRole, p: Permission) => PERMS[role].includes(p);
