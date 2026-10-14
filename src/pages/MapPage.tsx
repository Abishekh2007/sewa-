import { useEffect, useMemo, useRef, useState } from 'react';
import { Route as RouteIcon, Columns3 } from 'lucide-react';
import { useRoute, useStore } from '../state/store';
import { can, runRoute } from '../engine/actions';
import { computeRoute } from '../engine/routing';
import { STATUS_LABEL } from '../engine/evidence';
import type { RouteMode, RouteResult, SegmentStatus, Vehicle } from '../types';
import { MODE_LABEL, VEHICLE_LABEL, VEHICLES } from '../types';
import { NetworkMap } from '../ui/NetworkMap';
import { SegmentDetail } from '../ui/SegmentDetail';
import { RouteResultView } from '../ui/RouteResultView';
import { Button, Field, inputCls, Mono, Notice, PageHeader, Panel, Select, StatusChip, Table, Tabs } from '../ui/kit';

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

  return (
    <div>
      <PageHeader title="Road network & routing" desc="Evidence-aware routing over the simulated Sector R-7 network. Select a segment to see why it has its status; click a junction while planning to set the destination." />
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <NetworkMap route={result} altIndex={alt} selectedSegment={seg} selectedNode={node} onSelectSegment={selectSeg} onSelectNode={selectNode} height="calc(100vh - 190px)" />
        <Panel bodyClass="p-0" className="xl:max-h-[calc(100vh-190px)]">
          <Tabs<Tab> value={tab} onChange={setTab} tabs={[{ value: 'route', label: 'Route planner' }, { value: 'segment', label: 'Segment' }, { value: 'segments', label: `Segments (${state.segments.length})` }]} />
          <div className="overflow-y-auto p-3.5 xl:max-h-[calc(100vh-232px)]">
            {tab === 'route' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="From"><Select value={from} onChange={setFrom} options={jOpts} ariaLabel="Origin" /></Field>
                  <Field label="To"><Select value={to} onChange={setTo} options={jOpts} ariaLabel="Destination" /></Field>
                  <Field label="Vehicle"><Select<Vehicle> value={vehicle} onChange={setVehicle} options={VEHICLES.map((v) => ({ value: v, label: VEHICLE_LABEL[v] }))} ariaLabel="Vehicle" /></Field>
                  <Field label="Mode"><Select<RouteMode> value={mode} onChange={setMode} options={MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }))} ariaLabel="Routing mode" /></Field>
                </div>
                <div className="flex gap-2">
                  <Button variant="primary" icon={<RouteIcon size={14} />} onClick={compute} disabled={!can(state.role, 'route')}>Compute route</Button>
                  <Button icon={<Columns3 size={14} />} onClick={compareModes}>Compare modes</Button>
                </div>
                {!can(state.role, 'route') && <Notice>Read-only role: route computation is disabled.</Notice>}
                {compare && (
                  <table className="w-full border border-line text-[12.5px]">
                    <thead><tr className="border-b border-line">{['Mode', 'Result', 'km', 'Est. min', 'Uncertain'].map((h) => <th key={h} className="label-caps px-2 py-1.5 text-left text-[10px]">{h}</th>)}</tr></thead>
                    <tbody>
                      {compare.map((r) => (
                        <tr key={r.mode} className="border-b border-line/60 last:border-0">
                          <td className="px-2 py-1.5">{MODE_LABEL[r.mode]}</td>
                          <td className="px-2 py-1.5">{r.found ? <span className="text-ok">Route</span> : <span className="text-crit">None verified</span>}</td>
                          <td className="px-2 py-1.5 font-mono">{r.best?.lengthKm ?? '—'}</td>
                          <td className="px-2 py-1.5 font-mono">{r.best?.estMinutes ?? '—'}</td>
                          <td className="px-2 py-1.5 font-mono">{r.best?.uncertainSegments.length ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {recalc && result && <Notice tone="warn">Recalculated after evidence change.</Notice>}
                {result ? <RouteResultView result={result} altIndex={alt} onAltIndex={setAlt} /> : <p className="text-[12.5px] text-muted">Choose origin, destination, vehicle and mode, then compute. Confirmed blocked segments are never used.</p>}
              </div>
            )}
            {tab === 'segment' && (seg ? <SegmentDetail segmentId={seg} /> : <p className="text-[13px] text-muted">Select a road segment on the map or in the Segments list.</p>)}
            {tab === 'segments' && (
              <div className="space-y-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <input className={inputCls} placeholder="Search ID or name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search segments" />
                  <Select<SegmentStatus | 'ALL'> value={statusF} onChange={setStatusF} ariaLabel="Filter by status" options={[{ value: 'ALL', label: 'All statuses' }, ...(Object.keys(STATUS_LABEL) as SegmentStatus[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))]} />
                </div>
                <div className="flex items-center gap-1.5 text-[12px] text-muted">
                  Sort:
                  {(['id', 'status', 'age'] as const).map((k) => (
                    <button key={k} onClick={() => setSortKey(k)} className={sortKey === k ? 'text-ink underline' : 'hover:text-ink'}>{k === 'age' ? 'evidence age' : k}</button>
                  ))}
                  <span className="ml-auto font-mono">{rows.length}</span>
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
        </Panel>
      </div>
    </div>
  );
}
