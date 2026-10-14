import { useEffect, useMemo, useRef, useState } from 'react';
import { Route as RouteIcon, Columns3, ArrowLeftRight } from 'lucide-react';
import { useRoute, useStore } from '../state/store';
import { can, runRoute } from '../engine/actions';
import { computeRoute } from '../engine/routing';
import { STATUS_LABEL } from '../engine/evidence';
import type { RouteMode, RouteResult, SegmentStatus, Vehicle } from '../types';
import { MODE_LABEL, VEHICLE_LABEL, VEHICLES } from '../types';
import { NetworkMap } from '../ui/NetworkMap';
import { SegmentDetail } from '../ui/SegmentDetail';
import { RouteResultView } from '../ui/RouteResultView';
import { Button, cx, Field, inputCls, Mono, Notice, Select, StatusChip, Table, Tabs } from '../ui/kit';

type Tab = 'route' | 'segment' | 'segments';
const MODES: RouteMode[] = ['FASTEST', 'EVIDENCE', 'CONSERVATIVE'];

export default function MapPage() {
  const { state, assessments, update } = useStore();
  const [, params] = useRoute();
  const [tab, setTab] = useState<Tab>(params.get('status') ? 'segments' : params.get('segment') ? 'segment' : 'route');
  const [seg, setSeg] = useState<string | null>(params.get('segment'));
  const [node, setNode] = useState<string | null>(null);
  const [from, setFrom] = useState(params.get('from') ?? 'J01');
  const [to, setTo] = useState(params.get('to') ?? 'J12');
  const [vehicle, setVehicle] = useState<Vehicle>('ambulance');
  const [mode, setMode] = useState<RouteMode>('EVIDENCE');
  const [result, setResult] = useState<RouteResult | null>(null);
  const [alt, setAlt] = useState(0);
  const [recalc, setRecalc] = useState(false);
  const [compare, setCompare] = useState<RouteResult[] | null>(null);
  const [q, setQ] = useState('');
  const [statusF, setStatusF] = useState<SegmentStatus | 'ALL'>((params.get('status') as SegmentStatus) || 'ALL');
  const [sortKey, setSortKey] = useState<'id' | 'status' | 'age'>('id');
  const first = useRef(true);

  useEffect(() => {
    const s = params.get('status');
    if (s) { setStatusF(s as SegmentStatus); setTab('segments'); }
    const sg = params.get('segment');
    if (sg) { setSeg(sg); setTab('segment'); }
  }, [params.toString()]);

  // Recalculate displayed route when evidence changes.
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!result) return;
    const r = computeRoute(state, result.from, result.to, result.vehicle, result.mode, assessments);
    setResult(r);
    setAlt(0);
    setRecalc(true);
  }, [assessments]);

  const compute = () => {
    let r: RouteResult | null = null;
    update((s) => { const [ns, rr] = runRoute(s, from, to, vehicle, mode); r = rr; return ns; });
    // runRoute is pure; compute locally too so the result is available immediately.
    setResult(r ?? computeRoute(state, from, to, vehicle, mode, assessments));
    setAlt(0);
    setRecalc(false);
    setCompare(null);
  };
  const compareModes = () => setCompare(MODES.map((m) => computeRoute(state, from, to, vehicle, m, assessments)));

  const jOpts = state.junctions.map((j) => ({ value: j.id, label: `${j.id} · ${j.name}` }));
  const rows = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const list = state.segments.filter((s) => (statusF === 'ALL' || assessments.get(s.id)!.status === statusF) && (!ql || s.id.toLowerCase().includes(ql) || s.name.toLowerCase().includes(ql)));
    const age = (id: string) => assessments.get(id)!.latestAgeMin ?? Infinity;
    return list.sort((a, b) => sortKey === 'id' ? a.id.localeCompare(b.id) : sortKey === 'status' ? assessments.get(a.id)!.status.localeCompare(assessments.get(b.id)!.status) : age(b.id) - age(a.id));
  }, [state.segments, assessments, q, statusF, sortKey]);

  const selectSeg = (id: string) => { setSeg(id); setTab('segment'); };
  const selectNode = (id: string) => { setNode(id); if (tab === 'route') setTo(id); };

  const segBtn = (on: boolean) => cx('-ml-px h-8 flex-1 border px-2 text-[12.5px] first:ml-0 first:rounded-l-[3px] last:rounded-r-[3px]', on ? 'relative z-10 border-ink bg-surface-2 font-medium text-ink' : 'border-line-strong text-muted hover:text-ink');
  return (
    <div className="flex flex-col lg:h-[calc(100vh-96px)] lg:flex-row">
      <div className="min-h-[360px] min-w-0 flex-1 border-b border-line lg:border-b-0 lg:border-r">
        <NetworkMap route={result} altIndex={alt} selectedSegment={seg} selectedNode={node} onSelectSegment={selectSeg} onSelectNode={selectNode} height="max(420px, calc(100vh - 96px))" />
      </div>
      <aside className="flex min-h-0 w-full flex-col bg-surface lg:w-[400px] lg:shrink-0" aria-label="Inspector">
        <div className="px-4 pt-3">
          <h1 className="text-[16px] font-semibold">Road network and routing</h1>
          <p className="text-[12px] text-muted">Evidence-aware routing over the simulated Sector R-7 network.</p>
        </div>
        <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: 'route', label: 'Route planner' }, { value: 'segment', label: 'Segment' }, { value: 'segments', label: `Segments (${state.segments.length})` }]} />
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === 'route' && (
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <Field label="From"><Select value={from} onChange={setFrom} options={jOpts} ariaLabel="Origin" /></Field>
                <Button onClick={() => { setFrom(to); setTo(from); }} aria-label="Swap origin and destination" title="Swap" icon={<ArrowLeftRight size={14} />} className="h-9" />
                <Field label="To"><Select value={to} onChange={setTo} options={jOpts} ariaLabel="Destination" /></Field>
              </div>
              <Field label="Vehicle">
                <div className="flex" role="radiogroup" aria-label="Vehicle">
                  {VEHICLES.map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={vehicle === v} onClick={() => setVehicle(v)} className={segBtn(vehicle === v)}>{VEHICLE_LABEL[v]}</button>
                  ))}
                </div>
              </Field>
              <Field label="Mode">
                <div className="flex" role="radiogroup" aria-label="Routing mode">
                  {MODES.map((m) => (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} className={segBtn(mode === m)}>{MODE_LABEL[m]}</button>
                  ))}
                </div>
              </Field>
              <div className="flex gap-2">
                <Button variant="primary" icon={<RouteIcon size={14} />} onClick={compute} disabled={!can(state.role, 'route')}>Compute route</Button>
                <Button icon={<Columns3 size={14} />} onClick={compareModes}>Compare modes</Button>
              </div>
              {!can(state.role, 'route') && <Notice>Read-only role: route computation is disabled.</Notice>}
              {compare && (
                <table className="w-full text-[12.5px]">
                  <thead><tr className="border-b border-line">{['Mode', 'Result', 'km', 'Est. min', 'Uncertain'].map((h, i) => <th key={h} className={cx('px-1.5 py-1.5 text-[12px] font-medium text-muted', i > 1 ? 'text-right' : 'text-left')}>{h}</th>)}</tr></thead>
                  <tbody>
                    {compare.map((r) => (
                      <tr key={r.mode} className="h-9 border-b border-line/60 last:border-0 hover:bg-surface-2">
                        <td className="px-1.5">{MODE_LABEL[r.mode]}</td>
                        <td className="px-1.5">{r.found ? <span>Route</span> : <span className="text-crit">None verified</span>}</td>
                        <td className="num px-1.5 text-right">{r.best?.lengthKm ?? '—'}</td>
                        <td className="num px-1.5 text-right">{r.best?.estMinutes ?? '—'}</td>
                        <td className="num px-1.5 text-right">{r.best?.uncertainSegments.length ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {recalc && result && <Notice tone="warn">Recalculated after evidence change.</Notice>}
              {result ? <RouteResultView result={result} altIndex={alt} onAltIndex={setAlt} /> : <p className="text-[12.5px] text-muted">Choose origin, destination, vehicle and mode, then compute. Confirmed blocked segments are never used. Click a junction on the map to set the destination.</p>}
            </div>
          )}
          {tab === 'segment' && (seg ? <SegmentDetail segmentId={seg} /> : <p className="text-[13px] text-muted">Select a road segment on the map or in the Segments list.</p>)}
          {tab === 'segments' && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Search ID or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search segments" />
                <Select<SegmentStatus | 'ALL'> value={statusF} onChange={setStatusF} ariaLabel="Filter by status" options={[{ value: 'ALL', label: 'All statuses' }, ...(Object.keys(STATUS_LABEL) as SegmentStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
              </div>
              <div className="flex items-center gap-2 text-[12px] text-muted">
                Sort by
                {(['id', 'status', 'age'] as const).map((k) => (
                  <button key={k} onClick={() => setSortKey(k)} className={cx('min-h-8 px-1', sortKey === k ? 'font-medium text-ink underline underline-offset-4' : 'hover:text-ink')}>{k === 'age' ? 'evidence age' : k}</button>
                ))}
                <span className="num ml-auto">{rows.length}</span>
              </div>
              <Table
                rows={rows}
                rowKey={(r) => r.id}
                selected={seg ?? undefined}
                onRow={(r) => selectSeg(r.id)}
                cols={[
                  { key: 'id', header: 'ID', cell: (r) => <Mono>{r.id}</Mono> },
                  { key: 'name', header: 'Name', cell: (r) => r.name },
                  { key: 'st', header: 'Status', cell: (r) => <StatusChip status={assessments.get(r.id)!.status} compact /> },
                ]}
              />
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
