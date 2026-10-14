import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { addTaskNote, can, isOpenTask, rejectTask, runRoute, updateTask, verifyTask } from '../engine/actions';
import { fmtAge, STATUS_LABEL, TIER_LABEL, trustTier } from '../engine/evidence';
import {
  HAZARD_LABEL, ROLE_LABEL, SOURCE_LABEL, TASK_STATUSES, VEHICLES, VEHICLE_LABEL,
  type HazardCategory, type ObservedCondition, type Priority, type TaskStatus, type Vehicle, type VerificationTask,
} from '../types';
import { Button, ConfirmDialog, Field, KV, Mono, Notice, PageHeader, Panel, PriorityTag, Select, StatusChip, Tag, Toast, cx, fmtTime, inputCls, textareaCls } from '../ui/kit';

const REASONS: VerificationTask['reason'][] = ['conflict', 'unverified_hazard', 'stale', 'sensor_alert', 'legacy_id', 'offline_conflict'];
const REASON_LABEL: Record<VerificationTask['reason'], string> = {
  conflict: 'Conflicting evidence', unverified_hazard: 'Unverified hazard', stale: 'Stale evidence', sensor_alert: 'Sensor alert', legacy_id: 'Legacy segment ID', offline_conflict: 'Offline sync conflict',
};

export default function Tasks() {
  const { state, update } = useStore();
  const [st, setSt] = useState<'open' | 'all' | TaskStatus>('open');
  const [pri, setPri] = useState<'all' | Priority>('all');
  const [reason, setReason] = useState<'all' | VerificationTask['reason']>('all');
  const [sel, setSel] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'crit' } | null>(null);

  const rows = useMemo(() => state.tasks
    .filter((t) => st === 'all' || (st === 'open' ? isOpenTask(t) : t.status === st))
    .filter((t) => pri === 'all' || t.priority === pri)
    .filter((t) => reason === 'all' || t.reason === reason)
    .sort((a, b) => (Number(isOpenTask(b)) - Number(isOpenTask(a))) || a.dueAt - b.dueAt), [state.tasks, st, pri, reason]);

  const GROUPS: TaskStatus[] = ['Pending', 'Assigned', 'In progress', 'Escalated'];
  const groupOf = (g: TaskStatus) => rows.filter((r) => r.status === g);
  const resolved = rows.filter((r) => !GROUPS.includes(r.status));
  const [showRes, setShowRes] = useState(false);
  const row = (t: VerificationTask) => {
    const over = isOpenTask(t) && t.dueAt < state.now;
    return (
      <li key={t.id}>
        <button onClick={() => setSel(t.id)} aria-current={t.id === sel} className={cx('grid min-h-10 w-full grid-cols-[28px_56px_64px_1fr_auto] items-center gap-2 border-b border-line px-1 py-1.5 text-left text-[13px] hover:bg-surface-2 xl:pr-3', t.id === sel && 'bg-surface-2')}>
          <PriorityTag p={t.priority} />
          <Mono className="text-muted">{t.id}</Mono>
          <Mono>{t.segmentId}</Mono>
          <span className="min-w-0 truncate">{REASON_LABEL[t.reason]}</span>
          <span className={cx('whitespace-nowrap font-mono text-[12px]', over ? 'text-crit' : 'text-muted')}>{fmtTime(t.dueAt)}{over ? ' · overdue' : ''}</span>
        </button>
      </li>
    );
  };
  const task = state.tasks.find((t) => t.id === sel);

  return (
    <div>
      <PageHeader title="Verification tasks" desc="Created automatically when evidence is conflicting, stale, unverified or sensor-triggered. A verified result becomes high-trust evidence and immediately changes routing inputs." />
      <div className="grid items-start border-t border-line xl:grid-cols-[minmax(0,1fr)_minmax(0,520px)]">
        <section className="min-w-0 xl:border-r xl:border-line">
          <div className="flex flex-wrap items-center gap-1.5 border-b border-line py-2 xl:pr-3">
            <Select ariaLabel="Status" className="h-8 w-32" value={st} onChange={setSt} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }, ...TASK_STATUSES.map((s) => ({ value: s, label: s }))]} />
            <Select ariaLabel="Priority" className="h-8 w-24" value={pri} onChange={setPri} options={[{ value: 'all', label: 'All P' }, ...(['P1', 'P2', 'P3', 'P4'] as const).map((p) => ({ value: p, label: p }))]} />
            <Select ariaLabel="Reason" className="h-8 w-40" value={reason} onChange={setReason} options={[{ value: 'all', label: 'All reasons' }, ...REASONS.map((r) => ({ value: r, label: REASON_LABEL[r] }))]} />
            <span className="num ml-auto text-[12px] text-muted">{rows.length} tasks</span>
          </div>
          {rows.length === 0 && <p className="py-6 text-[13px] text-muted">No verification tasks match the filters.</p>}
          {GROUPS.map((g) => groupOf(g).length > 0 && (
            <div key={g}>
              <h2 className="border-b border-line bg-surface-2 px-1 py-1 text-[12px] font-semibold text-muted">{g} <span className="num font-normal">({groupOf(g).length})</span></h2>
              <ul>{groupOf(g).map(row)}</ul>
            </div>
          ))}
          {resolved.length > 0 && (
            <div>
              <button onClick={() => setShowRes(!showRes)} aria-expanded={showRes} className="w-full border-b border-line bg-surface-2 px-1 py-1 text-left text-[12px] font-semibold text-muted">{showRes ? '▾' : '▸'} Resolved <span className="num font-normal">({resolved.length})</span></button>
              {showRes && <ul>{resolved.map(row)}</ul>}
            </div>
          )}
        </section>
        <aside className="min-w-0 xl:sticky xl:top-2 xl:max-h-[calc(100vh-1rem)] xl:overflow-y-auto">
          {task ? <TaskDetail key={task.id} task={task} onToast={setToast} update={update} /> : <p className="p-4 text-[13px] text-muted">Select a task to assign, inspect, verify, reject or escalate it.</p>}
        </aside>
      </div>
      <Toast msg={toast} onDone={() => setToast(null)} />
    </div>
  );
}

function TaskDetail({ task, onToast, update }: { task: VerificationTask; onToast: (t: { text: string; tone?: 'ok' | 'crit' }) => void; update: ReturnType<typeof useStore>['update'] }) {
  const { state, assessments } = useStore();
  const [assignee, setAssignee] = useState(task.assignee ?? '');
  const [note, setNote] = useState('');
  const [cond, setCond] = useState<ObservedCondition>('passable');
  const [cat, setCat] = useState<HazardCategory>('flooded_road');
  const [limit, setLimit] = useState<Vehicle[]>([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const seg = state.segments.find((s) => s.id === task.segmentId)!;
  const a = assessments.get(task.segmentId);
  const open = isOpenTask(task);
  const canVerify = can(state.role, 'verify');
  const canAssign = can(state.role, 'assign');
  const deny = `Not permitted for ${ROLE_LABEL[state.role]}`;
  const evidence = task.relatedEvidence.map((id) => state.evidence.find((e) => e.id === id)).filter(Boolean) as typeof state.evidence;
  const affected = state.incidents.filter((i) => i.lastRoute && i.status !== 'Closed' && (i.lastRoute.segments.includes(task.segmentId) || !i.lastRoute.found));

  return (
    <div className="flex min-w-0 flex-col xl:pl-4 [&>section]:border-0 [&>section]:border-b [&>section]:border-line [&>section]:bg-transparent">
      <Panel title={<span className="flex items-center gap-2"><Mono>{task.id}</Mono> {REASON_LABEL[task.reason]}</span>} sub={`${seg.id} ${seg.name}`} actions={a && <StatusChip status={a.status} />}>
        <KV items={[
          ['Priority', <PriorityTag p={task.priority} />],
          ['Status', task.status],
          ['Assignee', task.assignee ?? 'Unassigned'],
          ['Created / due', `${fmtTime(task.createdAt)} / ${fmtTime(task.dueAt)}`],
          ['Description', task.description],
          ...(task.result ? [['Result', `${task.result.condition}${task.result.category ? ` (${HAZARD_LABEL[task.result.category]})` : ''}${task.result.restrictsTo ? ` · limited to ${task.result.restrictsTo.join(', ')}` : ''}`] as [string, string]] : []),
          ...(task.closedAt ? [['Closed', fmtTime(task.closedAt)] as [string, string]] : []),
        ]} />
        {a && (
          <details className="mt-3 border-t border-line pt-2 text-[13px]" open>
            <summary className="cursor-pointer text-muted">Why is this segment {STATUS_LABEL[a.status].toLowerCase()}?</summary>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">{a.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </details>
        )}
      </Panel>

      <Panel title="Related evidence" bodyClass="p-0">
        {evidence.length ? (
          <ul className="divide-y divide-line/60">
            {evidence.map((e) => (
              <li key={e.id} className="px-3.5 py-2 text-[13px]">
                <div className="flex flex-wrap items-center gap-2"><Mono>{e.id}</Mono><Tag tone={e.condition === 'passable' ? 'ok' : e.condition === 'blocked' ? 'crit' : 'warn'}>{e.condition}{e.category ? ` · ${HAZARD_LABEL[e.category]}` : ''}</Tag><Tag>{TIER_LABEL[trustTier(e)]}</Tag><Tag tone={e.verification === 'verified' ? 'ok' : e.verification === 'rejected' ? 'crit' : 'neutral'}>{e.verification}</Tag></div>
                <div className="mt-1 text-muted">{SOURCE_LABEL[e.sourceType]} — {e.sourceName} · observed {fmtTime(e.observedAt)} ({fmtAge((state.now - e.observedAt) / 60000)} ago){e.waterLevelCm !== undefined ? ` · water ${e.waterLevelCm} cm` : ''}</div>
                {e.note && <div className="mt-0.5 text-[12px] text-faint">{e.note}</div>}
              </li>
            ))}
          </ul>
        ) : <p className="p-3.5 text-[13px] text-muted">No linked evidence.</p>}
      </Panel>

      <Panel title="Actions: assign, inspect, note, verify, escalate">
        <div className="flex flex-col gap-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <Field label="Assign to (synthetic personnel)"><Select value={assignee} onChange={setAssignee} options={[{ value: '', label: 'Select…' }, ...state.personnel.map((p) => ({ value: p, label: p }))]} /></Field>
            <Button className="self-end" disabled={!open || !canAssign || !assignee} title={canAssign ? undefined : deny} onClick={() => update((s) => updateTask(s, task.id, { assignee }))}>Assign</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!open || !canVerify || task.status === 'In progress'} title={canVerify ? undefined : deny} onClick={() => update((s) => updateTask(s, task.id, { status: 'In progress' }))}>Start inspection</Button>
            <Button size="sm" variant="danger" disabled={!open || !canAssign || task.status === 'Escalated'} title={canAssign ? undefined : deny} onClick={() => update((s) => updateTask(s, task.id, { status: 'Escalated', priority: 'P1' }))}>Escalate</Button>
            <Button size="sm" disabled={task.status === 'Closed' || !canAssign} title={canAssign ? undefined : deny} onClick={() => update((s) => updateTask(s, task.id, { status: 'Closed' }))}>Close task</Button>
          </div>
          <div className="grid gap-2 border-t border-line pt-3">
            <Field label="Inspection note"><textarea className={textareaCls} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
            <div className="flex justify-end"><Button size="sm" disabled={!note.trim() || !canVerify} title={canVerify ? undefined : deny} onClick={() => { update((s) => addTaskNote(s, task.id, note)); setNote(''); }}>Add note</Button></div>
            {task.notes.length > 0 && <ul className="space-y-1 text-[12.5px]">{task.notes.map((n, i) => <li key={i}><span className="font-mono text-faint">{fmtTime(n.at)}</span> <span className="text-muted">{n.by}:</span> {n.text}</li>)}</ul>}
          </div>
          {open && (
            <div className="grid gap-3 border-t border-line pt-3">
              <div className="text-[13px] font-semibold">Verify road condition</div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Field label="Observed condition"><Select<ObservedCondition> value={cond} onChange={setCond} options={[{ value: 'passable', label: 'Passable (verified)' }, { value: 'hazard', label: 'Hazard present' }, { value: 'blocked', label: 'Blocked' }]} /></Field>
                {cond !== 'passable' && <Field label="Hazard category"><Select value={cat} onChange={setCat} options={(Object.keys(HAZARD_LABEL) as HazardCategory[]).map((c) => ({ value: c, label: HAZARD_LABEL[c] }))} /></Field>}
              </div>
              {cond !== 'blocked' && (
                <fieldset className="flex flex-wrap gap-3 text-[13px]"><legend className="label-caps mb-1">Restrict to vehicles (optional)</legend>
                  {VEHICLES.map((v) => <label key={v} className="flex items-center gap-1.5"><input type="checkbox" checked={limit.includes(v)} onChange={(e) => setLimit(e.target.checked ? [...limit, v] : limit.filter((x) => x !== v))} />{VEHICLE_LABEL[v]}</label>)}
                </fieldset>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="danger" disabled={!canVerify} title={canVerify ? undefined : deny} onClick={() => setRejectOpen(true)}>Reject report</Button>
                <Button variant="primary" disabled={!canVerify} title={canVerify ? undefined : deny} onClick={() => {
                  update((s) => verifyTask(s, task.id, { condition: cond, category: cond === 'passable' ? undefined : cat, restrictsTo: cond === 'blocked' ? undefined : limit, note: note.trim() || undefined }));
                  onToast({ text: `${task.segmentId} verified as ${cond}. Route inputs updated.` });
                }}>Verify condition</Button>
              </div>
            </div>
          )}
        </div>
      </Panel>

      {!open && affected.length > 0 && (
        <Panel title="Routes that may change">
          <Notice tone="warn">Road status changed. Incidents whose last route used {task.segmentId} (or found no route) should be recalculated.</Notice>
          <ul className="mt-3 space-y-2">
            {affected.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span><Mono>{i.id}</Mono> <span className="text-muted">last route {i.lastRoute!.found ? `${i.lastRoute!.lengthKm} km` : 'not found'} ({i.lastRoute!.mode})</span></span>
                <Button size="sm" disabled={!can(state.role, 'route')} onClick={() => {
                  const lr = i.lastRoute!;
                  let found = false;
                  update((s) => { const [n, r] = runRoute(s, lr.from, lr.to, lr.vehicle, lr.mode, i.id); found = r.found; return n; });
                  setTimeout(() => onToast({ text: `${i.id} recalculated: ${found ? 'route found' : 'NO ADEQUATELY VERIFIED ROUTE FOUND'}`, tone: found ? 'ok' : 'crit' }), 0);
                }}>Recalculate</Button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <ConfirmDialog open={rejectOpen} title={`Reject unverified evidence on ${task.segmentId}?`} danger confirmLabel="Reject"
        body={<div className="grid gap-2"><span>Unverified reports linked to this task will be marked rejected and excluded from the evidence engine. Both remain in the audit trail.</span><input className={inputCls} placeholder="Reason (required)" value={note} onChange={(e) => setNote(e.target.value)} /></div>}
        onCancel={() => setRejectOpen(false)}
        onConfirm={() => {
          if (!note.trim()) { onToast({ text: 'A rejection reason is required.', tone: 'crit' }); return; }
          update((s) => rejectTask(s, task.id, note.trim()));
          setNote(''); setRejectOpen(false);
          onToast({ text: `Evidence on ${task.segmentId} rejected.` });
        }} />
    </div>
  );
}
