import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { useRoute, useStore } from '../state/store';
import { isOpenTask } from '../engine/actions';
import { STATUS_LABEL } from '../engine/evidence';
import type { IncidentCategory, IncidentStatus, Priority, SegmentStatus } from '../types';
import { INCIDENT_LABEL, INCIDENT_STATUSES } from '../types';
import { NetworkMap } from '../ui/NetworkMap';
import { Button, fmtTime, Mono, PageHeader, PriorityTag, Select, STATUS_STYLE, StatusChip, Table, Tag } from '../ui/kit';

const DAY = 86_400_000;
const ORDER: SegmentStatus[] = ['BLOCKED', 'CONFLICTING_EVIDENCE', 'POTENTIAL_HAZARD', 'STALE_EVIDENCE', 'UNKNOWN', 'VERIFIED_PASSABLE'];
const rank = (s: SegmentStatus) => ORDER.indexOf(s);

function Section({ title, sub, actions, children, className }: { title: string; sub?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2">
        <div className="flex items-baseline gap-2">
          <h2 className="text-[13.5px] font-semibold text-ink">{title}</h2>
          {sub && <span className="text-[12px] text-faint">{sub}</span>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, hint, onClick }: { label: string; value: ReactNode; hint: ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} className="min-h-[64px] px-4 py-2.5 text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
      <div className="text-[12px] text-muted">{label}</div>
      <div className="num text-[20px] font-semibold leading-tight text-ink">{value}</div>
      <div className="text-[12px] text-faint">{hint}</div>
    </button>
  );
}

export default function Dashboard() {
  const { state, assessments } = useStore();
  const [, , go] = useRoute();
  const [pf, setPf] = useState<Priority | 'ALL'>('ALL');
  const [cf, setCf] = useState<IncidentCategory | 'ALL'>('ALL');
  const [sf, setSf] = useState<IncidentStatus | 'ALL'>('ALL');

  const counts = useMemo(() => {
    const c: Record<SegmentStatus, number> = { VERIFIED_PASSABLE: 0, POTENTIAL_HAZARD: 0, BLOCKED: 0, UNKNOWN: 0, STALE_EVIDENCE: 0, CONFLICTING_EVIDENCE: 0 };
    for (const a of assessments.values()) c[a.status]++;
    return c;
  }, [assessments]);
  const sorted = useMemo(
    () => state.segments.map((s) => ({ seg: s, a: assessments.get(s.id) })).filter((x) => x.a).sort((x, y) => rank(x.a!.status) - rank(y.a!.status) || x.seg.id.localeCompare(y.seg.id)),
    [state.segments, assessments],
  );
  const attention = sorted.filter((x) => x.a!.status !== 'VERIFIED_PASSABLE');
  const openTasks = state.tasks.filter(isOpenTask);
  const taskBySeg = useMemo(() => {
    const m = new Map<string, (typeof state.tasks)[number]>();
    for (const t of state.tasks.filter(isOpenTask).sort((a, b) => b.priority.localeCompare(a.priority))) m.set(t.segmentId, t);
    return m;
  }, [state.tasks]);
  const overdue = openTasks.filter((t) => t.dueAt < state.now).length;
  const active = state.incidents.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed');
  const missions = state.incidents.filter((i) => i.status === 'Responder assigned' || i.status === 'In progress');
  const dayStart = Math.floor(state.now / DAY) * DAY;
  const today = state.reports.filter((r) => r.submittedAt >= dayStart).length;
  const verified = state.tasks.filter((t) => t.verifiedAt);
  const avgVer = verified.length ? Math.round(verified.reduce((s, t) => s + (t.verifiedAt! - t.createdAt), 0) / verified.length / 60000) : null;
  const routesFound = state.routes.filter((r) => r.found).length;
  const incidents = state.incidents
    .filter((i) => (pf === 'ALL' || i.priority === pf) && (cf === 'ALL' || i.category === cf) && (sf === 'ALL' || i.status === sf))
    .sort((a, b) => b.reportedAt - a.reportedAt);
  const feed = [...state.audit].reverse().slice(0, 12);
  const jn = (id: string) => state.junctions.find((j) => j.id === id)?.name ?? id;
  const observer = state.role === 'observer';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations overview"
        desc="Figures are derived from simulated records for fictional Sector R-7."
        actions={<>
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => go('incidents', { new: '1' })}>New incident</Button>
          <Button icon={<AlertTriangle size={14} />} onClick={() => go('hazards')}>Report hazard</Button>
        </>}
      />

      <Section title="Network condition" sub={`${sorted.length} road segments`}>
        <div className="flex h-7 gap-px" role="list" aria-label="Road segments by severity">
          {sorted.map(({ seg, a }) => (
            <button
              key={seg.id}
              role="listitem"
              aria-label={`${seg.id} ${seg.name}: ${STATUS_LABEL[a!.status]}`}
              title={`${seg.id} · ${seg.name} · ${STATUS_LABEL[a!.status]}`}
              onClick={() => go('map', { segment: seg.id })}
              className="h-full min-w-0 flex-1 rounded-[1px] opacity-90 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
              style={{ background: STATUS_STYLE[a!.status].color }}
            />
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
          {ORDER.map((s) => (
            <button key={s} onClick={() => go('map', { status: s })} className="inline-flex min-h-8 items-center gap-1.5 text-[12.5px] text-muted hover:text-ink">
              <span aria-hidden className="text-[9px]" style={{ color: STATUS_STYLE[s].color }}>{STATUS_STYLE[s].glyph}</span>
              {STATUS_LABEL[s]} <span className="num text-ink">{counts[s]}</span>
            </button>
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-2 divide-x divide-y divide-line border-y border-line md:grid-cols-5 md:divide-y-0">
        <Metric label="Active incidents" value={active.length} hint={`${missions.length} active missions`} onClick={() => go('incidents', { filter: 'active' })} />
        <Metric label="Open verification tasks" value={openTasks.length} hint={`${overdue} overdue`} onClick={() => go('tasks')} />
        <Metric label="Reports today" value={today} hint="Simulated clock day" onClick={() => go('hazards')} />
        <Metric label="Avg verification time" value={avgVer === null ? '—' : `${avgVer} min`} hint={`${verified.length} tasks verified`} onClick={() => go('tasks')} />
        <Metric label="Routes computed" value={state.routes.length} hint={`${state.routes.length - routesFound} with no route`} onClick={() => go('map')} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Section title="Map">
          <NetworkMap height={460} onSelectSegment={(id) => go('map', { segment: id })} />
        </Section>
        <Section title="Needs attention" sub={`${attention.length} segments`}>
          {attention.length === 0 ? (
            <p className="border-t border-line py-8 text-[13px] text-muted">All road segments are verified passable. Nothing needs attention right now.</p>
          ) : (
            <ul className="max-h-[460px] divide-y divide-line overflow-y-auto border-y border-line">
              {attention.map(({ seg, a }) => {
                const t = taskBySeg.get(seg.id);
                return (
                  <li key={seg.id}>
                    <button onClick={() => go('map', { segment: seg.id })} className="block w-full px-1 py-2 text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusChip status={a!.status} compact />
                        <Mono>{seg.id}</Mono>
                        <span className="min-w-0 truncate text-[13px] text-ink">{seg.name}</span>
                      </div>
                      {a!.reasons[0] && <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">{a!.reasons[0]}</p>}
                      {t && (
                        <p className="mt-0.5 flex items-center gap-2 text-[12px] text-faint">
                          <PriorityTag p={t.priority} /> Verification due <span className={t.dueAt < state.now ? 'font-mono text-crit' : 'font-mono'}>{fmtTime(t.dueAt)}</span>
                        </p>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Section
          title="Incidents"
          sub="Simulated"
          actions={<div className="flex flex-wrap gap-1.5">
            <Select<Priority | 'ALL'> className="h-8 w-28" ariaLabel="Priority filter" value={pf} onChange={setPf} options={[{ value: 'ALL', label: 'Priority' }, ...(['P1', 'P2', 'P3', 'P4'] as Priority[]).map((p) => ({ value: p, label: p }))]} />
            <Select<IncidentCategory | 'ALL'> className="h-8 w-36" ariaLabel="Type filter" value={cf} onChange={setCf} options={[{ value: 'ALL', label: 'All types' }, ...(Object.keys(INCIDENT_LABEL) as IncidentCategory[]).map((c) => ({ value: c, label: INCIDENT_LABEL[c] }))]} />
            <Select<IncidentStatus | 'ALL'> className="h-8 w-36" ariaLabel="Status filter" value={sf} onChange={setSf} options={[{ value: 'ALL', label: 'All statuses' }, ...INCIDENT_STATUSES.map((s) => ({ value: s, label: s }))]} />
          </div>}
        >
          <div className="overflow-x-auto border-y border-line">
            <Table
              rows={incidents}
              rowKey={(i) => i.id}
              onRow={(i) => go('incidents', { id: i.id })}
              cols={[
                { key: 'id', header: 'ID', cell: (i) => <Mono>{i.id}</Mono> },
                { key: 'p', header: 'Priority', cell: (i) => <PriorityTag p={i.priority} /> },
                { key: 'c', header: 'Type', cell: (i) => INCIDENT_LABEL[i.category] },
                { key: 'l', header: 'Location', cell: (i) => (observer ? <span className="text-muted">Restricted</span> : jn(i.nodeId)) },
                { key: 's', header: 'Status', cell: (i) => <Tag tone={i.status === 'Resolved' || i.status === 'Closed' ? 'ok' : 'accent'}>{i.status}</Tag> },
                { key: 't', header: 'Reported', cell: (i) => <span className="font-mono text-muted">{fmtTime(i.reportedAt)}</span> },
              ]}
            />
          </div>
        </Section>

        <Section title="Activity" actions={<Button size="sm" variant="ghost" onClick={() => go('audit')}>Audit trail</Button>}>
          <ul className="divide-y divide-line border-y border-line">
            {feed.length === 0 && <li className="py-6 text-[13px] text-muted">No activity recorded yet.</li>}
            {feed.map((e) => (
              <li key={e.id} className="py-2 text-[12.5px]">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-mono text-[11.5px] text-faint">{fmtTime(e.at)}</span>
                  <span className="text-ink">{e.type.replace(/_/g, ' ').toLowerCase()}</span>
                  <span className="text-faint">{e.actor}</span>
                </div>
                <div className="mt-0.5 text-muted">{e.details}</div>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
