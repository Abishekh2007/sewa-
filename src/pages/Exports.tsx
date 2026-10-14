import { useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { useStore } from '../state/store';
import { runAllTests } from '../engine/testcases';
import { HAZARD_LABEL, INCIDENT_LABEL, MODE_LABEL, VEHICLE_LABEL, type TestResult } from '../types';
import { Button, Empty, fmtTime, KV, Mono, Notice, PageHeader, Panel, PriorityTag, Select, SimTag } from '../ui/kit';
import { downloadCsv, iso } from '../utils/csv';

export default function Exports() {
  const { state } = useStore();
  const [incId, setIncId] = useState(state.incidents[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const jName = (id: string) => state.junctions.find((j) => j.id === id)?.name ?? id;

  const exports: { label: string; desc: string; run: () => void; count: number }[] = [
    { label: 'Incident reports', desc: 'All simulated incidents with status and last route', count: state.incidents.length,
      run: () => downloadCsv('incidents.csv', state.incidents.map((i) => ({ id: i.id, category: i.category, location: `${i.nodeId} ${jName(i.nodeId)}`, priority: i.priority, people: i.peopleAffected, vehicle: i.vehicle, status: i.status, assignedUnit: i.assignedUnit ?? '', reportedAt: iso(i.reportedAt), resolvedAt: iso(i.resolvedAt), closedAt: iso(i.closedAt), lastRouteFound: i.lastRoute?.found ?? '', lastRouteKm: i.lastRoute?.lengthKm ?? '', notes: i.notes, resolution: i.resolutionNotes ?? '', simulated: true }))) },
    { label: 'Hazard reports', desc: 'Submitted reports and verification state', count: state.reports.length,
      run: () => downloadCsv('hazard-reports.csv', state.reports.map((r) => ({ id: r.id, category: r.category, segmentId: r.segmentId, submittedRef: r.submittedSegmentRef, condition: r.condition, severity: r.severity, sourceType: r.sourceType, status: r.status, observedAt: iso(r.observedAt), submittedAt: iso(r.submittedAt), vehicleAccess: r.vehicleAccess, waterLevelCm: r.waterLevelCm ?? '', image: r.image?.name ?? '', origin: r.origin, description: r.description }))) },
    { label: 'Verification tasks', desc: 'Tasks, assignees, results and closure', count: state.tasks.length,
      run: () => downloadCsv('verification-tasks.csv', state.tasks.map((t) => ({ id: t.id, segmentId: t.segmentId, reason: t.reason, priority: t.priority, status: t.status, assignee: t.assignee ?? '', createdAt: iso(t.createdAt), dueAt: iso(t.dueAt), verifiedAt: iso(t.verifiedAt), closedAt: iso(t.closedAt), result: t.result?.condition ?? '', notes: t.notes.map((n) => n.text).join(' | '), description: t.description }))) },
    { label: 'Road-condition history', desc: 'Every segment status change', count: state.segments.reduce((a, s) => a + s.history.length, 0),
      run: () => downloadCsv('road-condition-history.csv', state.segments.flatMap((s) => s.history.map((h) => ({ segmentId: s.id, name: s.name, at: iso(h.at), from: h.from ?? '', to: h.to, reason: h.reason })))) },
    { label: 'Evidence records', desc: 'All observations with source and trust data', count: state.evidence.length,
      run: () => downloadCsv('evidence.csv', state.evidence.map((e) => ({ ...e, observedAt: iso(e.observedAt), receivedAt: iso(e.receivedAt) }))) },
    { label: 'Route evaluations', desc: 'Route computations and outcomes', count: state.routes.length,
      run: () => downloadCsv('route-evaluations.csv', state.routes.map((r) => ({ id: r.id, at: iso(r.at), from: r.from, to: r.to, vehicle: r.vehicle, mode: r.mode, found: r.found, lengthKm: r.best?.lengthKm ?? '', estMinutes: r.best?.estMinutes ?? '', uncertain: r.best?.uncertainSegments.length ?? '', blockedAvoided: r.blockedAvoided.join(' '), alternatives: r.alternatives.length, segments: r.best?.segments.join(' ') ?? '', computeMs: r.computeMs }))) },
    { label: 'Sensor readings', desc: 'Simulated feed readings with flags', count: state.readings.length,
      run: () => downloadCsv('sensor-readings.csv', state.readings.map((r) => ({ ...r, at: iso(r.at) }))) },
    { label: 'Cost estimates', desc: 'Editable cost assumptions (estimates only)', count: state.costs.length,
      run: () => downloadCsv('cost-estimates.csv', state.costs.map((c) => ({ ...c, totalInr: c.qty * c.unitInr }))) },
    { label: 'Audit trail', desc: 'Full append-only event log', count: state.audit.length,
      run: () => downloadCsv('audit-trail.csv', state.audit.map((a) => ({ ...a, at: iso(a.at), wallAt: iso(a.wallAt) }))) },
    { label: 'Test-case results', desc: 'Runs the deterministic test suite now and exports results', count: NaN,
      run: () => { setBusy(true); try { downloadCsv('test-results.csv', runAllTests().map((t: TestResult) => ({ id: t.id, name: t.name, category: t.category, expected: t.expected, observed: t.observed, passed: t.passed, ms: t.ms, baselineUsesBlocked: t.baseline?.usesBlocked ?? '', proposedUsesBlocked: t.proposed?.usesBlocked ?? '', proposedFound: t.proposed?.found ?? '' }))); } finally { setBusy(false); } } },
  ];

  const inc = state.incidents.find((i) => i.id === incId);
  const relatedReports = inc?.lastRoute ? state.reports.filter((r) => inc.lastRoute!.segments.includes(r.segmentId)) : [];

  return (
    <div className="space-y-4">
      <PageHeader title="Exports & reports" desc="CSV datasets and a printable incident summary for a concept-note appendix." />
      <Notice>Every export is labelled as simulated test data from the fictional Sector R-7 dataset. None of it is field-validated evidence.</Notice>
      <div className="no-print grid gap-px border border-line bg-line sm:grid-cols-2 xl:grid-cols-3">
        {exports.map((e) => (
          <div key={e.label} className="flex items-center justify-between gap-3 bg-surface px-3.5 py-3">
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium">{e.label} {isFinite(e.count) && <Mono className="text-faint">({e.count})</Mono>}</div>
              <div className="truncate text-[12px] text-muted">{e.desc}</div>
            </div>
            <Button size="sm" icon={<Download size={13} />} onClick={e.run} disabled={busy}>CSV</Button>
          </div>
        ))}
      </div>

      <Panel
        title="Incident summary"
        className="print:border-0"
        actions={
          <div className="no-print flex gap-2">
            <Select ariaLabel="Incident" className="h-8 w-64" value={incId} onChange={setIncId} options={state.incidents.map((i) => ({ value: i.id, label: `${i.id} · ${INCIDENT_LABEL[i.category]}` }))} />
            <Button size="sm" icon={<Printer size={13} />} onClick={() => window.print()} disabled={!inc}>Print</Button>
          </div>
        }
      >
        {!inc ? <Empty text="No incidents recorded." /> : (
          <article className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[16px] font-semibold">{inc.id}: {INCIDENT_LABEL[inc.category]}</h3>
              <PriorityTag p={inc.priority} /><SimTag />
            </div>
            <p className="border border-stale/40 px-3 py-1.5 text-[12.5px] text-stale">Simulated test data. Not field-validated evidence. No real emergency service was dispatched.</p>
            <div className="grid gap-6 md:grid-cols-2">
              <KV items={[
                ['Location', `${inc.nodeId} · ${jName(inc.nodeId)} (fictional)`],
                ['Status', inc.status],
                ['People affected', inc.peopleAffected],
                ['Vehicle required', VEHICLE_LABEL[inc.vehicle]],
                ['Assigned unit', inc.assignedUnit ?? '—'],
                ['Reported', fmtTime(inc.reportedAt)],
                ['Resolved', fmtTime(inc.resolvedAt)],
                ['Closed', fmtTime(inc.closedAt)],
              ]} />
              <KV items={[
                ['Last route', inc.lastRoute ? `${MODE_LABEL[inc.lastRoute.mode]} · ${inc.lastRoute.found ? `${inc.lastRoute.lengthKm} km, ~${inc.lastRoute.estMinutes} min (estimate)` : 'NO ADEQUATELY VERIFIED ROUTE FOUND'}` : 'Not computed'],
                ['Route segments', inc.lastRoute?.segments.join(' → ') || '—'],
                ['Uncertain segments', inc.lastRoute ? inc.lastRoute.uncertain : '—'],
                ['Notes', inc.notes || '—'],
                ['Resolution', inc.resolutionNotes ?? '—'],
                ['Closure verified by', inc.closureVerifiedBy ?? '—'],
              ]} />
            </div>
            <div>
              <div className="label-caps mb-1.5">Timeline</div>
              <ol className="space-y-1 border-l border-line pl-3 text-[13px]">
                {inc.timeline.map((t, i) => <li key={i}><span className="font-mono text-[12px] text-faint">{fmtTime(t.at)}</span> {t.text}</li>)}
              </ol>
            </div>
            <div>
              <div className="label-caps mb-1.5">Hazard reports on route segments</div>
              {relatedReports.length ? (
                <ul className="space-y-1 text-[13px]">{relatedReports.map((r) => <li key={r.id}><Mono>{r.id}</Mono> {HAZARD_LABEL[r.category]} on <Mono>{r.segmentId}</Mono>: {r.status}</li>)}</ul>
              ) : <p className="text-[13px] text-muted">None.</p>}
            </div>
          </article>
        )}
      </Panel>
    </div>
  );
}
