import { useMemo, useState } from 'react';
import { AlertTriangle, Plus } from 'lucide-react';
import { useRoute, useStore } from '../state/store';
import { isOpenTask } from '../engine/actions';
import { STATUS_LABEL } from '../engine/evidence';
import type { IncidentCategory, IncidentStatus, Priority, SegmentStatus } from '../types';
import { INCIDENT_LABEL, INCIDENT_STATUSES } from '../types';
import { NetworkMap } from '../ui/NetworkMap';
import { Button, fmtTime, Mono, PageHeader, Panel, PriorityTag, Select, Stat, StatusChip, Table, Tag } from '../ui/kit';

const DAY = 86_400_000;

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
  const active = state.incidents.filter((i) => i.status !== 'Resolved' && i.status !== 'Closed');
  const missions = state.incidents.filter((i) => i.status === 'Responder assigned' || i.status === 'In progress');
  const dayStart = Math.floor(state.now / DAY) * DAY;
  const today = state.reports.filter((r) => r.submittedAt >= dayStart).length;
  const verified = state.tasks.filter((t) => t.verifiedAt);
  const avgVer = verified.length ? Math.round(verified.reduce((s, t) => s + (t.verifiedAt! - t.createdAt), 0) / verified.length / 60000) : null;
  const routesFound = state.routes.filter((r) => r.found).length;
  const resolved = state.incidents.filter((i) => i.resolvedAt);
  const avgRes = resolved.length ? Math.round(resolved.reduce((s, i) => s + (i.resolvedAt! - i.reportedAt), 0) / resolved.length / 60000) : null;
  const queue = state.tasks.filter(isOpenTask).sort((a, b) => a.priority.localeCompare(b.priority) || a.dueAt - b.dueAt).slice(0, 8);
  const incidents = state.incidents
    .filter((i) => (pf === 'ALL' || i.priority === pf) && (cf === 'ALL' || i.category === cf) && (sf === 'ALL' || i.status === sf))
    .sort((a, b) => b.reportedAt - a.reportedAt);
  const updates = state.segments.flatMap((s) => s.history.map((h) => ({ ...h, seg: s }))).filter((h) => h.from !== null).sort((a, b) => b.at - a.at).slice(0, 8);
  const feed = [...state.audit].reverse().slice(0, 12);
  const jn = (id: string) => state.junctions.find((j) => j.id === id)?.name ?? id;
  const observer = state.role === 'observer';

  return (
    <div className="space-y-4">
      <PageHeader
        title="Operations overview"
        desc="All figures are derived from the stored simulated records for fictional Sector R-7."
        actions={<>
          <Button variant="primary" icon={<Plus size={14} />} onClick={() => go('incidents', { new: '1' })}>New incident</Button>
          <Button icon={<AlertTriangle size={14} />} onClick={() => go('hazards')}>Report hazard</Button>
        </>}
      />
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Active incidents" value={active.length} hint={`${missions.length} active missions`} onClick={() => go('incidents', { filter: 'active' })} />
        <Stat label="Blocked segments" value={counts.BLOCKED} tone="crit" hint="Confirmed, excluded from routing" onClick={() => go('map', { status: 'BLOCKED' })} />
        <Stat label="Awaiting verification" value={counts.POTENTIAL_HAZARD} tone="warn" hint="Potential hazards" onClick={() => go('map', { status: 'POTENTIAL_HAZARD' })} />
        <Stat label="Conflicting" value={counts.CONFLICTING_EVIDENCE} tone="conf" hint="Reports disagree" onClick={() => go('map', { status: 'CONFLICTING_EVIDENCE' })} />
        <Stat label="Verified passable" value={counts.VERIFIED_PASSABLE} tone="ok" hint={`of ${state.segments.length} segments`} onClick={() => go('map', { status: 'VERIFIED_PASSABLE' })} />
        <Stat label="Unknown" value={counts.UNKNOWN} tone="unk" hint="No adequate evidence" onClick={() => go('map', { status: 'UNKNOWN' })} />
        <Stat label="Stale evidence" value={counts.STALE_EVIDENCE} tone="unk" hint="Expired observations" onClick={() => go('map', { status: 'STALE_EVIDENCE' })} />
        <Stat label="Reports today" value={today} hint="Simulated clock day" onClick={() => go('hazards')} />
        <Stat label="Avg verification" value={avgVer === null ? '—' : `${avgVer}m`} hint={`${verified.length} tasks verified`} onClick={() => go('tasks')} />
        <Stat label="Routes computed" value={state.routes.length} hint={`${routesFound} found · ${state.routes.length - routesFound} no verified route`} onClick={() => go('map')} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <NetworkMap height={430} onSelectSegment={(id) => go('map', { segment: id })} />
        <Panel title="High-priority verification queue" sub={`${state.tasks.filter(isOpenTask).length} open tasks`} actions={<Button size="sm" variant="ghost" onClick={() => go('tasks')}>All tasks</Button>} bodyClass="p-0">
          <Table
            rows={queue}
            rowKey={(t) => t.id}
            onRow={() => go('tasks')}
            empty="No open verification tasks."
            cols={[
              { key: 'p', header: 'Pri', cell: (t) => <PriorityTag p={t.priority} /> },
              { key: 'seg', header: 'Segment', cell: (t) => <><Mono>{t.segmentId}</Mono><div className="text-[12px] text-muted">{t.reason.replace('_', ' ')}</div></> },
              { key: 'st', header: 'Road', cell: (t) => <StatusChip status={assessments.get(t.segmentId)!.status} compact /> },
              { key: 'due', header: 'Due', cell: (t) => <span className={t.dueAt < state.now ? 'font-mono text-crit' : 'font-mono text-muted'}>{fmtTime(t.dueAt).split(', ').pop()}</span> },
            ]}
          />
        </Panel>
      </div>

      <Panel
        title="Recent incidents"
        sub={`Resolution: ${resolved.length} resolved · avg ${avgRes === null ? '—' : `${avgRes} min`} report→resolution (simulated)`}
        bodyClass="p-0"
        actions={<div className="flex flex-wrap gap-1.5">
          <Select<Priority | 'ALL'> className="h-8 w-28" ariaLabel="Priority filter" value={pf} onChange={setPf} options={[{ value: 'ALL', label: 'Priority' }, ...(['P1', 'P2', 'P3', 'P4'] as Priority[]).map((p) => ({ value: p, label: p }))]} />
          <Select<IncidentCategory | 'ALL'> className="h-8 w-40" ariaLabel="Category filter" value={cf} onChange={setCf} options={[{ value: 'ALL', label: 'All types' }, ...(Object.keys(INCIDENT_LABEL) as IncidentCategory[]).map((c) => ({ value: c, label: INCIDENT_LABEL[c] }))]} />
          <Select<IncidentStatus | 'ALL'> className="h-8 w-40" ariaLabel="Status filter" value={sf} onChange={setSf} options={[{ value: 'ALL', label: 'All statuses' }, ...INCIDENT_STATUSES.map((s) => ({ value: s, label: s }))]} />
        </div>}
      >
        <Table
          rows={incidents}
          rowKey={(i) => i.id}
          onRow={(i) => go('incidents', { id: i.id })}
          cols={[
            { key: 'id', header: 'ID', cell: (i) => <Mono>{i.id}</Mono> },
            { key: 'p', header: 'Pri', cell: (i) => <PriorityTag p={i.priority} /> },
            { key: 'c', header: 'Type', cell: (i) => INCIDENT_LABEL[i.category] },
            { key: 'l', header: 'Location', cell: (i) => (observer ? <span className="text-muted">Restricted</span> : jn(i.nodeId)) },
            { key: 's', header: 'Status', cell: (i) => <Tag tone={i.status === 'Resolved' || i.status === 'Closed' ? 'ok' : 'accent'}>{i.status}</Tag> },
            { key: 't', header: 'Reported', cell: (i) => <span className="font-mono text-muted">{fmtTime(i.reportedAt)}</span> },
          ]}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Latest road-status updates" bodyClass="p-0">
          <ul className="divide-y divide-line/60">
            {updates.length === 0 && <li className="px-3.5 py-6 text-center text-[13px] text-muted">No status changes since the initial assessment.</li>}
            {updates.map((u, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 px-3.5 py-2 text-[13px]">
                <span className="font-mono text-[12px] text-faint">{fmtTime(u.at)}</span>
                <button className="font-mono hover:underline" onClick={() => go('map', { segment: u.seg.id })}>{u.seg.id}</button>
                <span className="text-muted">{u.from ? STATUS_LABEL[u.from] : ''} →</span>
                <StatusChip status={u.to} compact />
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Activity feed" actions={<Button size="sm" variant="ghost" onClick={() => go('audit')}>Audit trail</Button>} bodyClass="p-0">
          <ul className="divide-y divide-line/60">
            {feed.map((e) => (
              <li key={e.id} className="px-3.5 py-2 text-[12.5px]">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11.5px] text-faint">{fmtTime(e.at)}</span>
                  <Tag>{e.type.replace(/_/g, ' ')}</Tag>
                  <span className="text-[11.5px] text-faint">{e.actor}</span>
                </div>
                <div className="mt-0.5 text-muted">{e.details}</div>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
