import { useEffect, useMemo, useState } from 'react';
import { Plus, Route as RouteIcon } from 'lucide-react';
import { useRoute, useStore } from '../state/store';
import { can, createIncident, runRoute, updateIncident, type IncidentInput } from '../engine/actions';
import {
  INCIDENT_LABEL, INCIDENT_STATUSES, MODE_LABEL, ROLE_LABEL, VEHICLES, VEHICLE_LABEL,
  type EmergencyIncident, type IncidentCategory, type IncidentStatus, type Priority, type RouteMode, type RouteResult, type Vehicle,
} from '../types';
import {
  Button, Field, KV, Modal, Mono, Notice, PageHeader, Panel, PriorityTag, Select, SimTag, Table, Tag, Toast, cx, fmtTime, inputCls, textareaCls, type Col,
} from '../ui/kit';
import { RouteResultView } from '../ui/RouteResultView';
import { NetworkMap } from '../ui/NetworkMap';

const ACTIVE: IncidentStatus[] = ['Received', 'Under assessment', 'Route planning', 'Responder assigned', 'In progress'];
const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
const CATS = Object.keys(INCIDENT_LABEL) as IncidentCategory[];

const blankInput = (): IncidentInput => ({ category: 'medical', nodeId: 'J20', priority: 'P2', peopleAffected: 1, vehicle: 'ambulance', accessibility: '', notes: '' });

export default function Incidents() {
  const { state, update } = useStore();
  const [, params, go] = useRoute();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'all' | IncidentCategory>('all');
  const [pri, setPri] = useState<'all' | Priority>('all');
  const [st, setSt] = useState<'all' | 'active' | IncidentStatus>(params.get('filter') === 'active' ? 'active' : 'all');
  const [sort, setSort] = useState<'priority' | 'time'>('priority');
  const [selected, setSelected] = useState<string | null>(params.get('id'));
  const [showNew, setShowNew] = useState(params.get('new') === '1');
  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'crit' } | null>(null);
  const jName = (id: string) => state.junctions.find((j) => j.id === id)?.name ?? id;

  useEffect(() => { if (params.get('new') === '1') setShowNew(true); }, [params]);

  const rows = useMemo(() => {
    const text = q.trim().toLowerCase();
    return state.incidents
      .filter((i) => cat === 'all' || i.category === cat)
      .filter((i) => pri === 'all' || i.priority === pri)
      .filter((i) => st === 'all' || (st === 'active' ? ACTIVE.includes(i.status) : i.status === st))
      .filter((i) => !text || `${i.id} ${INCIDENT_LABEL[i.category]} ${jName(i.nodeId)} ${i.status}`.toLowerCase().includes(text))
      .sort((a, b) => (sort === 'priority' ? a.priority.localeCompare(b.priority) || b.reportedAt - a.reportedAt : b.reportedAt - a.reportedAt));
  }, [state.incidents, q, cat, pri, st, sort]);

  const cols: Col<EmergencyIncident>[] = [
    { key: 'id', header: 'ID', cell: (i) => <Mono>{i.id}</Mono> },
    { key: 'cat', header: 'Category', cell: (i) => INCIDENT_LABEL[i.category] },
    { key: 'loc', header: 'Location', cell: (i) => <span>{jName(i.nodeId)} <Mono className="text-faint">{i.nodeId}</Mono></span> },
    { key: 'pri', header: 'Priority', cell: (i) => <PriorityTag p={i.priority} /> },
    { key: 'status', header: 'Status', cell: (i) => <Tag tone={ACTIVE.includes(i.status) ? 'accent' : 'neutral'}>{i.status}</Tag> },
    { key: 'unit', header: 'Unit', cell: (i) => <Mono>{i.assignedUnit ?? '—'}</Mono> },
    { key: 'time', header: 'Reported', cell: (i) => <span className="whitespace-nowrap text-muted">{fmtTime(i.reportedAt)}</span> },
    { key: 'sim', header: '', cell: () => <SimTag /> },
  ];

  const inc = state.incidents.find((i) => i.id === selected) ?? null;
  const canInc = can(state.role, 'incident');
  const deny = `Not permitted for ${ROLE_LABEL[state.role]}`;

  return (
    <div>
      <PageHeader
        title="Emergency incidents"
        desc="Simulated incidents for the fictional Sector R-7 test area. Creating or updating an incident here does not dispatch any real emergency service."
        actions={<Button variant="primary" icon={<Plus size={15} />} disabled={!canInc} title={canInc ? undefined : deny} onClick={() => setShowNew(true)}>New incident</Button>}
      />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <Panel
          title={`Incidents (${rows.length})`}
          bodyClass="p-0"
          actions={
            <div className="flex flex-wrap gap-1.5">
              <input aria-label="Search incidents" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputCls, 'h-8 w-36')} />
              <Select ariaLabel="Category filter" className="h-8 w-36" value={cat} onChange={setCat} options={[{ value: 'all', label: 'All categories' }, ...CATS.map((c) => ({ value: c, label: INCIDENT_LABEL[c] }))]} />
              <Select ariaLabel="Priority filter" className="h-8 w-24" value={pri} onChange={setPri} options={[{ value: 'all', label: 'All P' }, ...PRIORITIES.map((p) => ({ value: p, label: p }))]} />
              <Select ariaLabel="Status filter" className="h-8 w-36" value={st} onChange={setSt} options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active only' }, ...INCIDENT_STATUSES.map((s) => ({ value: s, label: s }))]} />
              <Select ariaLabel="Sort" className="h-8 w-32" value={sort} onChange={setSort} options={[{ value: 'priority', label: 'By priority' }, { value: 'time', label: 'Newest first' }]} />
            </div>
          }
        >
          <Table rows={rows} cols={cols} rowKey={(i) => i.id} onRow={(i) => setSelected(i.id)} selected={selected ?? undefined} />
        </Panel>
        {inc ? <IncidentDetail key={inc.id} inc={inc} onToast={setToast} /> : (
          <Panel title="Incident detail"><p className="text-[13px] text-muted">Select an incident to view its timeline, assign a unit and compute an evidence-aware route.</p></Panel>
        )}
      </div>
      <NewIncidentModal
        open={showNew}
        onClose={() => { setShowNew(false); if (params.get('new')) go('incidents'); }}
        onCreate={(input) => {
          let id = '';
          update((s) => { const [n, newId] = createIncident(s, input); id = newId; return n; });
          setTimeout(() => { setSelected(id); setToast({ text: `Incident ${id} created (simulated).` }); }, 0);
          setShowNew(false);
        }}
      />
      <Toast msg={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function NewIncidentModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (i: IncidentInput) => void }) {
  const { state } = useStore();
  const [f, setF] = useState<IncidentInput>(blankInput);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const submit = () => {
    const e: Record<string, string> = {};
    if (!state.junctions.some((j) => j.id === f.nodeId)) e.nodeId = 'Select a location.';
    if (!Number.isInteger(f.peopleAffected) || f.peopleAffected < 0 || f.peopleAffected > 10000) e.people = 'Enter a whole number 0–10000.';
    if (f.notes.trim().length < 5) e.notes = 'Add a short description (min 5 characters).';
    setErrs(e);
    if (Object.keys(e).length) return;
    onCreate(f);
    setF(blankInput());
  };
  return (
    <Modal open={open} onClose={onClose} title="New simulated incident" wide footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={submit}>Create incident</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" required><Select value={f.category} onChange={(v) => setF({ ...f, category: v })} options={CATS.map((c) => ({ value: c, label: INCIDENT_LABEL[c] }))} /></Field>
        <Field label="Location" required error={errs.nodeId}><Select value={f.nodeId} onChange={(v) => setF({ ...f, nodeId: v })} options={state.junctions.map((j) => ({ value: j.id, label: `${j.id} — ${j.name}` }))} /></Field>
        <Field label="Priority" required><Select value={f.priority} onChange={(v) => setF({ ...f, priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: p }))} /></Field>
        <Field label="People potentially affected" required error={errs.people}><input type="number" min={0} className={inputCls} value={f.peopleAffected} onChange={(e) => setF({ ...f, peopleAffected: Number(e.target.value) })} /></Field>
        <Field label="Required response vehicle" required><Select value={f.vehicle} onChange={(v) => setF({ ...f, vehicle: v })} options={VEHICLES.map((v) => ({ value: v, label: VEHICLE_LABEL[v] }))} /></Field>
        <Field label="Accessibility considerations" hint="e.g. wheelchair user, stretcher needed. Avoid names."><input className={inputCls} value={f.accessibility} onChange={(e) => setF({ ...f, accessibility: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Notes" required error={errs.notes}><textarea className={textareaCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
      </div>
      <div className="mt-3"><Notice>Simulated record only. No real emergency service is contacted. Use synthetic details and do not enter personal data.</Notice></div>
    </Modal>
  );
}

function IncidentDetail({ inc, onToast }: { inc: EmergencyIncident; onToast: (t: { text: string; tone?: 'ok' | 'crit' }) => void }) {
  const { state, update } = useStore();
  const [mode, setMode] = useState<RouteMode>('EVIDENCE');
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [alt, setAlt] = useState(0);
  const [edit, setEdit] = useState({ priority: inc.priority, peopleAffected: inc.peopleAffected, notes: inc.notes });
  const [resNotes, setResNotes] = useState(inc.resolutionNotes ?? '');
  const [closedBy, setClosedBy] = useState('');
  const [unit, setUnit] = useState(inc.assignedUnit ?? '');
  const canInc = can(state.role, 'incident');
  const canRoute = can(state.role, 'route');
  const deny = `Not permitted for ${ROLE_LABEL[state.role]}`;
  const restricted = state.role === 'observer';
  const jName = (id: string) => state.junctions.find((j) => j.id === id)?.name ?? id;
  const assigned = state.units.find((u) => u.id === inc.assignedUnit);
  const origin = assigned?.baseNodeId ?? 'J01';
  const vehicle: Vehicle = assigned?.vehicle ?? inc.vehicle;
  const idx = INCIDENT_STATUSES.indexOf(inc.status);
  const next = INCIDENT_STATUSES[idx + 1] as IncidentStatus | undefined;

  const advance = () => {
    if (!next) return;
    if (next === 'Resolved' && resNotes.trim().length < 5) return onToast({ text: 'Resolution notes are required to resolve.', tone: 'crit' });
    if (next === 'Closed' && !closedBy.trim()) return onToast({ text: 'Enter who verified closure.', tone: 'crit' });
    const patch: Partial<EmergencyIncident> = { status: next };
    if (next === 'Resolved') patch.resolutionNotes = resNotes.trim();
    if (next === 'Closed') patch.closureVerifiedBy = closedBy.trim();
    update((s) => updateIncident(s, inc.id, patch, `Status → ${next}${next === 'Closed' ? ` (closure verified by ${closedBy.trim()})` : ''}`));
  };

  const computeRoute = () => {
    let r: RouteResult | null = null;
    update((s) => { const [n, res] = runRoute(s, origin, inc.nodeId, vehicle, mode, inc.id); r = res; return n; });
    setTimeout(() => { setRoute(r); setAlt(0); }, 0);
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Panel title={<span className="flex items-center gap-2"><Mono>{inc.id}</Mono> {INCIDENT_LABEL[inc.category]}</span>} sub={`${jName(inc.nodeId)} · reported ${fmtTime(inc.reportedAt)}`} actions={<SimTag />}>
        <KV items={[
          ['Status', <Tag tone="accent">{inc.status}</Tag>],
          ['Priority', <PriorityTag p={inc.priority} />],
          ['People affected', <Mono>{inc.peopleAffected}</Mono>],
          ['Required vehicle', VEHICLE_LABEL[inc.vehicle]],
          ['Assigned unit', assigned ? `${assigned.name}` : '—'],
          ['Accessibility', restricted ? <span className="text-faint">Restricted</span> : inc.accessibility || '—'],
          ['Notes', restricted ? <span className="text-faint">Restricted to authorised roles</span> : inc.notes || '—'],
          ...(inc.resolutionNotes ? [['Resolution', inc.resolutionNotes] as [string, string]] : []),
          ...(inc.closureVerifiedBy ? [['Closure verified by', inc.closureVerifiedBy] as [string, string]] : []),
        ]} />
        <div className="mt-3"><Notice>No real emergency services are dispatched. Assignments are to simulated units.</Notice></div>
      </Panel>

      <Panel title="Update">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Priority"><Select value={edit.priority} onChange={(v) => setEdit({ ...edit, priority: v })} options={PRIORITIES.map((p) => ({ value: p, label: p }))} /></Field>
          <Field label="People affected"><input type="number" min={0} className={inputCls} value={edit.peopleAffected} onChange={(e) => setEdit({ ...edit, peopleAffected: Number(e.target.value) })} /></Field>
          <div className="sm:col-span-2"><Field label="Notes"><textarea className={textareaCls} value={restricted ? '' : edit.notes} disabled={restricted} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} /></Field></div>
        </div>
        <div className="mt-2 flex justify-end">
          <Button size="sm" disabled={!canInc} title={canInc ? undefined : deny} onClick={() => update((s) => updateIncident(s, inc.id, { priority: edit.priority, peopleAffected: Math.max(0, Math.floor(edit.peopleAffected) || 0), notes: edit.notes }))}>Save changes</Button>
        </div>
        <div className="mt-4 grid gap-2 border-t border-line pt-3 sm:grid-cols-[1fr_auto]">
          <Field label="Assign simulated unit">
            <Select value={unit} onChange={setUnit} options={[{ value: '', label: 'Select unit…' }, ...state.units.map((u) => ({ value: u.id, label: `${u.name}${u.vehicle === inc.vehicle ? '' : ` (≠ required ${VEHICLE_LABEL[inc.vehicle]})`}` }))]} />
          </Field>
          <Button className="self-end" disabled={!canInc || !unit || unit === inc.assignedUnit} title={canInc ? undefined : deny}
            onClick={() => update((s) => updateIncident(s, inc.id, { assignedUnit: unit, status: idx < 3 ? 'Responder assigned' : inc.status }, `Assigned ${unit}`))}>Assign</Button>
        </div>
        <div className="mt-4 grid gap-2 border-t border-line pt-3">
          {next === 'Resolved' && <Field label="Resolution notes" required><textarea className={textareaCls} value={resNotes} onChange={(e) => setResNotes(e.target.value)} /></Field>}
          {next === 'Closed' && <Field label="Closure verified by" required hint="Synthetic name or role"><input className={inputCls} value={closedBy} onChange={(e) => setClosedBy(e.target.value)} /></Field>}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] text-muted">Workflow: {INCIDENT_STATUSES.map((s, i) => <span key={s} className={cx(i === idx ? 'text-ink' : i < idx ? 'text-faint line-through' : '')}>{s}{i < INCIDENT_STATUSES.length - 1 ? ' › ' : ''}</span>)}</span>
            {next && <Button size="sm" variant="primary" disabled={!canInc} title={canInc ? undefined : deny} onClick={advance}>Move to {next}</Button>}
          </div>
        </div>
      </Panel>

      <Panel title="Route to incident" sub={`From ${jName(origin)} (${assigned ? assigned.id : 'default: response station'}) · ${VEHICLE_LABEL[vehicle]}`}
        actions={<>
          <Select ariaLabel="Routing mode" className="h-8 w-48" value={mode} onChange={setMode} options={(Object.keys(MODE_LABEL) as RouteMode[]).map((m) => ({ value: m, label: MODE_LABEL[m] }))} />
          <Button size="sm" variant="primary" icon={<RouteIcon size={14} />} disabled={!canRoute} title={canRoute ? undefined : deny} onClick={computeRoute}>Compute</Button>
        </>}
      >
        {route ? (
          <div className="flex flex-col gap-3">
            <NetworkMap route={route} altIndex={alt} height={300} showIncidents />
            <RouteResultView result={route} altIndex={alt} onAltIndex={setAlt} />
          </div>
        ) : inc.lastRoute ? (
          <p className="text-[13px] text-muted">Last computed {fmtTime(inc.lastRoute.at)} ({MODE_LABEL[inc.lastRoute.mode]}): {inc.lastRoute.found ? `${inc.lastRoute.lengthKm} km, ~${inc.lastRoute.estMinutes} min est., ${inc.lastRoute.uncertain} uncertain segment(s)` : 'NO ADEQUATELY VERIFIED ROUTE FOUND'}. Compute again to use current evidence.</p>
        ) : <p className="text-[13px] text-muted">No route computed yet.</p>}
      </Panel>

      <Panel title="Timeline">
        <ol className="flex flex-col gap-2">
          {[...inc.timeline].reverse().map((e, i) => (
            <li key={i} className="grid grid-cols-[110px_1fr] gap-3 text-[13px]"><span className="font-mono text-[12px] text-faint">{fmtTime(e.at)}</span><span>{e.text}</span></li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}
