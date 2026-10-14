import { useMemo, useState, type ReactNode } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Download, FlaskConical } from 'lucide-react';
import { useStore } from '../state/store';
import { runAllTests } from '../engine/testcases';
import { STATUS_LABEL } from '../engine/evidence';
import { HAZARD_LABEL, type SegmentStatus, type TestResult } from '../types';
import { Button, Notice, PageHeader, STATUS_STYLE, Table } from '../ui/kit';
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
    <div className="flex flex-col gap-5">
      <PageHeader title="Analytics & evaluation" desc="All figures are derived from the records stored in this browser and from deterministic test runs on the simulated dataset. They are not field measurements." />

      <Notice>Simulated test results, not field validation. Figures come from the fictional Sector R-7 dataset.</Notice>

      <section aria-label="Key figures" className="grid grid-cols-2 border-l border-t border-line md:grid-cols-4 xl:grid-cols-6">
        {([
          ['Reports', m.total, ''], ['Verified', m.verified, 'reports + inspections'], ['Rejected', m.rejected, ''],
          ['Conflicting segments', m.conflicting, ''], ['Stale segments', m.stale, ''], ['Avg verification', fmt(m.avgVer, 0), 'sim minutes'],
          ['Avg route calculation', fmt(m.avgCalc, 2), `ms · ${state.routes.length} runs`], ['Avg resolution', fmt(m.avgRes, 0), 'sim minutes'],
          ['Blocked segments avoided', m.avoided, 'vs. shortest path'], ['No-route results', m.noRoute, ''],
          ['Alternative available', m.altPct === null ? '—' : `${m.altPct}%`, 'of found routes'],
          ['Offline syncs', m.syncs.length, `${m.syncs.reduce((a, s) => a + s.conflicts, 0)} conflicts · ${m.syncs.reduce((a, s) => a + s.unmatched, 0)} unmatched`],
        ] as [string, ReactNode, string][]).map(([l, v, h]) => (
          <div key={l} className="border-b border-r border-line px-3.5 py-3">
            <div className="text-[12px] text-muted">{l}</div>
            <div className="num mt-1 text-[20px] font-semibold leading-none">{v}</div>
            <div className="mt-1 min-h-4 text-[11.5px] text-faint">{h}</div>
          </div>
        ))}
      </section>

      <section className="grid gap-x-8 gap-y-6 md:grid-cols-2">
        <div><h2 className="mb-2 text-[13px] font-semibold">Road segment status</h2><Chart data={m.statusData} colors={m.statusData.map((d) => d.color)} /></div>
        <div><h2 className="mb-2 text-[13px] font-semibold">Reports by hazard category</h2><Chart data={m.catData} /></div>
        <div><h2 className="mb-2 text-[13px] font-semibold">Route computation time (ms, last 20)</h2><Chart data={m.calcData} color="var(--color-stale)" /></div>
      </section>

      <section className="border-t border-line pt-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold">Built-in evaluation</h2>
            <p className="text-[12.5px] text-muted">Deterministic test cases on the simulated dataset, compared with a basic length-only shortest-path baseline.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="primary" icon={<FlaskConical size={14} />} onClick={() => setResults(runAllTests())}>Run evaluation</Button>
            <Button icon={<Download size={14} />} disabled={!results} onClick={() => results && downloadCsv('raksha-test-results.csv', results.map((r) => ({ id: r.id, name: r.name, category: r.category, expected: r.expected, observed: r.observed, result: r.passed ? 'PASS' : 'FAIL', ms: r.ms, baseline_blocked: r.baseline?.usesBlocked, proposed_blocked: r.proposed?.usesBlocked, baseline_uncertain: r.baseline?.uncertain, proposed_uncertain: r.proposed?.uncertain })))}>Download CSV</Button>
          </div>
        </div>
        {!results ? (
          <p className="text-[13px] text-muted">Run the evaluation to execute every test case against a fresh copy of the seeded data. Results are measured, not hard-coded.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-x-8 gap-y-2 text-[13px]">
              <span><span className="text-ok">●</span> <span className="num font-semibold">{passed}</span> passed</span>
              <span><span className={results.length - passed ? 'text-crit' : 'text-faint'}>■</span> <span className="num font-semibold">{results.length - passed}</span> failed</span>
            </div>
            <table className="w-full max-w-xl border-collapse text-[13px]">
              <thead><tr className="border-b border-line text-left text-muted"><th className="py-2 pr-3 font-medium">Baseline vs proposed ({cmp.length} routing cases)</th><th className="px-3 text-right font-medium">Baseline</th><th className="px-3 text-right font-medium">Proposed</th></tr></thead>
              <tbody>
                <tr className="border-b border-line/60"><td className="py-2 pr-3">Blocked segments used</td><td className="num px-3 text-right">{tot.bb}</td><td className="num px-3 text-right">{tot.pb}</td></tr>
                <tr><td className="py-2 pr-3">Uncertain segments used</td><td className="num px-3 text-right">{tot.bu}</td><td className="num px-3 text-right">{tot.pu}</td></tr>
              </tbody>
            </table>
            <Table<TestResult> rowKey={(r) => r.id} rows={results} cols={[
              { key: 'id', header: 'ID', cell: (r) => <span className="font-mono text-[12px]">{r.id}</span> },
              { key: 'n', header: 'Test', cell: (r) => <div><div>{r.name}</div><div className="text-[12px] text-faint">{r.category}</div></div> },
              { key: 'e', header: 'Expected', cell: (r) => <span className="text-muted">{r.expected}</span> },
              { key: 'o', header: 'Observed', cell: (r) => <span className="font-mono text-[12px]">{r.observed}</span> },
              { key: 'b', header: 'Baseline / proposed', cell: (r) => (r.baseline && r.proposed ? <span className="font-mono text-[12px]">blk {r.baseline.usesBlocked}/{r.proposed.usesBlocked} · unc {r.baseline.uncertain}/{r.proposed.uncertain}</span> : <span className="text-faint">—</span>) },
              { key: 'ms', header: 'ms', cell: (r) => <span className="num">{r.ms}</span>, className: 'text-right' },
              { key: 'p', header: 'Result', cell: (r) => <span className={r.passed ? 'text-ok' : 'text-crit'}>{r.passed ? '● Pass' : '■ Fail'}</span> },
            ]} />
          </div>
        )}
      </section>

      <section className="border-t border-line pt-4">
        <h2 className="mb-2 text-[14px] font-semibold">Known limitations</h2>
        <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">{LIMITATIONS.map((l) => <li key={l}>{l}</li>)}</ul>
      </section>
    </div>
  );
}
