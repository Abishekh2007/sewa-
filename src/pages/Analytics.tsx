import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, FlaskConical } from 'lucide-react';
import { useStore } from '../state/store';
import { runAllTests } from '../engine/testcases';
import { STATUS_LABEL } from '../engine/evidence';
import { HAZARD_LABEL, type SegmentStatus, type TestResult } from '../types';
import { Button, Notice, PageHeader, Panel, Stat, STATUS_STYLE, Table, Tag } from '../ui/kit';
import { downloadCsv } from '../utils/csv';

const MIN = 60_000;
const axis = { fontSize: 11, fill: 'var(--color-muted)' };
const tip = { contentStyle: { background: 'var(--color-raised)', border: '1px solid var(--color-line-strong)', fontSize: 12, borderRadius: 2 }, labelStyle: { color: 'var(--color-ink)' }, cursor: { fill: 'var(--color-surface-2)' } };
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

const LIMITATIONS = [
  'All results come from a fictional simulated network (Sector R-7); none are field-validated.',
  'Travel times are estimates from configured road speeds; no live traffic or terrain model.',
  'Freshness limits and penalties are configurable test values, not calibrated against real incidents.',
  'Demo roles are client-side only and are not a security boundary.',
  'LocalStorage persistence and the audit log are not tamper-proof.',
  'Sensor readings are simulated; a water-level reading alone does not establish passability.',
  'Alternative routes use first-order edge removal (not full k-shortest-paths).',
];

function Chart({ data, color, colors }: { data: { name: string; value: number }[]; color?: string; colors?: string[] }) {
  if (!data.length || data.every((d) => d.value === 0)) return <p className="py-10 text-center text-[13px] text-muted">No data yet.</p>;
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-line)" vertical={false} />
        <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={{ stroke: 'var(--color-line)' }} interval={0} angle={data.length > 5 ? -25 : 0} textAnchor={data.length > 5 ? 'end' : 'middle'} height={data.length > 5 ? 60 : 24} />
        <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip {...tip} />
        <Bar dataKey="value" fill={color ?? 'var(--color-accent)'} maxBarSize={36}>
          {colors && data.map((_, i) => <Cell key={i} fill={colors[i]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function Analytics() {
  const { state, assessments } = useStore();
  const [results, setResults] = useState<TestResult[] | null>(null);

  const m = useMemo(() => {
    const ev = state.evidence;
    const statusCounts = {} as Record<SegmentStatus, number>;
    for (const a of assessments.values()) statusCounts[a.status] = (statusCounts[a.status] ?? 0) + 1;
    const verTimes = state.tasks.filter((t) => t.verifiedAt).map((t) => (t.verifiedAt! - t.createdAt) / MIN);
    const resTimes = state.incidents.filter((i) => i.resolvedAt).map((i) => (i.resolvedAt! - i.reportedAt) / MIN);
    const byCat: Record<string, number> = {};
    for (const r of state.reports) byCat[HAZARD_LABEL[r.category]] = (byCat[HAZARD_LABEL[r.category]] ?? 0) + 1;
    const found = state.routes.filter((r) => r.found);
    return {
      total: state.reports.length,
      verified: state.reports.filter((r) => r.status === 'verified').length + ev.filter((e) => e.kind === 'inspection' && e.origin !== 'simulated-seed').length,
      rejected: state.reports.filter((r) => r.status === 'rejected').length,
      conflicting: statusCounts.CONFLICTING_EVIDENCE ?? 0,
      stale: statusCounts.STALE_EVIDENCE ?? 0,
      avgVer: avg(verTimes),
      avgRes: avg(resTimes),
      avgCalc: avg(state.routes.map((r) => r.computeMs)),
      avoided: state.routes.reduce((n, r) => n + r.blockedAvoided.length, 0),
      noRoute: state.routes.length - found.length,
      altPct: found.length ? Math.round((found.filter((r) => r.alternatives.length > 0).length / found.length) * 100) : null,
      syncs: state.offline.syncLog,
      statusData: (Object.keys(STATUS_LABEL) as SegmentStatus[]).map((s) => ({ name: STATUS_LABEL[s], value: statusCounts[s] ?? 0, color: STATUS_STYLE[s].color })),
      catData: Object.entries(byCat).map(([name, value]) => ({ name, value })),
      calcData: state.routes.slice(-20).map((r, i) => ({ name: `${i + 1}`, value: r.computeMs })),
    };
  }, [state, assessments]);

  const passed = results?.filter((r) => r.passed).length ?? 0;
  const cmp = results?.filter((r) => r.baseline && r.proposed) ?? [];
  const tot = cmp.reduce((a, r) => ({ bb: a.bb + r.baseline!.usesBlocked, pb: a.pb + r.proposed!.usesBlocked, bu: a.bu + r.baseline!.uncertain, pu: a.pu + r.proposed!.uncertain }), { bb: 0, pb: 0, bu: 0, pu: 0 });
  const fmt = (n: number | null, d = 1, u = '') => (n === null ? '—' : `${n.toFixed(d)}${u}`);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title="Analytics & evaluation" desc="All figures are derived from the records stored in this browser and from deterministic test runs on the simulated dataset. They are not field measurements." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Reports" value={m.total} />
        <Stat label="Verified" value={m.verified} tone="ok" hint="reports + inspections" />
        <Stat label="Rejected" value={m.rejected} />
        <Stat label="Conflicting segs" value={m.conflicting} tone="conf" />
        <Stat label="Stale segs" value={m.stale} tone="unk" />
        <Stat label="Avg verification" value={fmt(m.avgVer, 0)} hint="sim minutes" />
        <Stat label="Avg route calc" value={fmt(m.avgCalc, 2)} hint={`ms · ${state.routes.length} runs`} />
        <Stat label="Avg resolution" value={fmt(m.avgRes, 0)} hint="sim minutes" />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Blocked segments avoided" value={m.avoided} hint="vs. geometric shortest path" tone="crit" />
        <Stat label="No-route results" value={m.noRoute} />
        <Stat label="Alternative available" value={m.altPct === null ? '—' : `${m.altPct}%`} hint="of found routes" />
        <Stat label="Offline syncs" value={m.syncs.length} hint={`${m.syncs.reduce((a, s) => a + s.conflicts, 0)} conflicts · ${m.syncs.reduce((a, s) => a + s.unmatched, 0)} unmatched`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Road segment status"><Chart data={m.statusData} colors={m.statusData.map((d) => d.color)} /></Panel>
        <Panel title="Reports by hazard category"><Chart data={m.catData} /></Panel>
        <Panel title="Route computation time (ms, last 20)"><Chart data={m.calcData} color="var(--color-stale)" /></Panel>
      </div>

      <Panel
        title="Built-in evaluation"
        sub="Deterministic test cases on the simulated dataset, compared with a basic length-only shortest-path baseline"
        actions={
          <>
            <Button variant="primary" icon={<FlaskConical size={14} />} onClick={() => setResults(runAllTests())}>Run evaluation</Button>
            <Button icon={<Download size={14} />} disabled={!results} onClick={() => results && downloadCsv('raksha-test-results.csv', results.map((r) => ({ id: r.id, name: r.name, category: r.category, expected: r.expected, observed: r.observed, result: r.passed ? 'PASS' : 'FAIL', ms: r.ms, baseline_blocked: r.baseline?.usesBlocked, proposed_blocked: r.proposed?.usesBlocked, baseline_uncertain: r.baseline?.uncertain, proposed_uncertain: r.proposed?.uncertain })))}>CSV</Button>
          </>
        }
      >
        {!results ? (
          <p className="text-[13px] text-muted">Run the evaluation to execute every test case against a fresh copy of the seeded data. Results are measured, not hard-coded.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Passed" value={passed} tone="ok" />
              <Stat label="Failed" value={results.length - passed} tone={results.length - passed ? 'crit' : undefined} />
              <Stat label="Baseline: blocked segs used" value={tot.bb} tone="crit" hint={`across ${cmp.length} routing cases`} />
              <Stat label="Proposed: blocked segs used" value={tot.pb} tone="ok" hint={`uncertain: ${tot.pu} vs baseline ${tot.bu}`} />
            </div>
            <Notice>Simulated test results only. They show the logic behaves as specified on a fictional network; they are not evidence of field accuracy.</Notice>
            <Table<TestResult> rowKey={(r) => r.id} rows={results} cols={[
              { key: 'id', header: 'ID', cell: (r) => <span className="font-mono">{r.id}</span> },
              { key: 'n', header: 'Test', cell: (r) => <div><div>{r.name}</div><div className="text-[12px] text-faint">{r.category}</div></div> },
              { key: 'e', header: 'Expected', cell: (r) => <span className="text-muted">{r.expected}</span> },
              { key: 'o', header: 'Observed', cell: (r) => <span className="font-mono text-[12px]">{r.observed}</span> },
              { key: 'b', header: 'Baseline / proposed', cell: (r) => (r.baseline && r.proposed ? <span className="font-mono text-[12px]">blk {r.baseline.usesBlocked}/{r.proposed.usesBlocked} · unc {r.baseline.uncertain}/{r.proposed.uncertain}</span> : <span className="text-faint">—</span>) },
              { key: 'ms', header: 'ms', cell: (r) => <span className="font-mono">{r.ms}</span>, className: 'text-right' },
              { key: 'p', header: 'Result', cell: (r) => <Tag tone={r.passed ? 'ok' : 'crit'}>{r.passed ? 'PASS' : 'FAIL'}</Tag> },
            ]} />
          </div>
        )}
      </Panel>

      <Panel title="Known limitations">
        <ul className="list-disc space-y-1 pl-5 text-[13.5px] text-muted">{LIMITATIONS.map((l) => <li key={l}>{l}</li>)}</ul>
      </Panel>
    </div>
  );
}
