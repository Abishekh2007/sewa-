import { useState } from 'react';
import { ListChecks, Play, RotateCcw } from 'lucide-react';
import { useStore } from '../state/store';
import { can } from '../engine/actions';
import { SCENARIOS, type ScenarioRun } from '../engine/scenarios';
import { Button, ConfirmDialog, cx, Notice, PageHeader, Panel, Table } from '../ui/kit';
import { NetworkMap } from '../ui/NetworkMap';
import { RouteResultView } from '../ui/RouteResultView';

export default function Demo() {
  const { state, replace, reset } = useStore();
  const [sel, setSel] = useState(state.activeScenario ?? SCENARIOS[0].id);
  const [runs, setRuns] = useState<Record<string, ScenarioRun>>({});
  const [all, setAll] = useState<{ id: string; title: string; pass: boolean; observed: string }[] | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [altIndex, setAltIndex] = useState(0);
  const sc = SCENARIOS.find((s) => s.id === sel)!;
  const run = runs[sel];
  const allowed = can(state.role, 'scenario');

  const start = () => {
    const r = sc.run();
    setRuns((x) => ({ ...x, [sc.id]: r }));
    setAltIndex(0);
    replace(r.state);
  };

  return (
    <div>
      <PageHeader
        title="Live demo scenarios"
        desc="Each scenario resets to the seeded simulated dataset and then applies real reports, verifications, clock changes and route calculations. Results are measured from the resulting application state."
        actions={
          <>
            <Button icon={<ListChecks size={15} />} onClick={() => setAll(SCENARIOS.map((s) => { const r = s.run(); return { id: s.id, title: s.title, pass: r.pass, observed: r.observed.join(' · ') }; }))}>Check all scenarios</Button>
          </>
        }
      />
      {!allowed && <div className="mb-3"><Notice tone="warn">The current demo role cannot run scenarios. Switch to Emergency Coordinator.</Notice></div>}
      {all && (
        <Panel className="mb-5" title="Scenario check" sub="Run in isolation; does not change the current application state" actions={<Button size="sm" variant="ghost" onClick={() => setAll(null)}>Hide</Button>} bodyClass="p-0">
          <Table rowKey={(r) => r.id} rows={all} cols={[
            { key: 'id', header: 'ID', cell: (r) => <span className="font-mono">{r.id}</span> },
            { key: 't', header: 'Scenario', cell: (r) => r.title },
            { key: 'o', header: 'Observed', cell: (r) => <span className="text-muted">{r.observed}</span> },
            { key: 'p', header: 'Result', cell: (r) => <span className={r.pass ? 'text-ok' : 'text-crit'}>{r.pass ? '● Pass' : '■ Fail'}</span> },
          ]} />
          <div className="border-t border-line px-3 py-2 text-[12.5px] text-muted">{all.filter((a) => a.pass).length}/{all.length} passed (simulated test results, not field validation).</div>
        </Panel>
      )}
      <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
        <nav aria-label="Scenarios" className="border-y border-line xl:border-y-0 xl:border-r xl:pr-4">
          <h2 className="px-1 py-2 text-[13px] font-semibold">Scenarios</h2>
          <ol>
            {SCENARIOS.map((s, i) => (
              <li key={s.id}>
                <button
                  onClick={() => { setSel(s.id); setAltIndex(0); }}
                  aria-current={sel === s.id}
                  className={cx('flex min-h-10 w-full items-start gap-3 border-b border-line/60 px-1 py-2 text-left hover:bg-surface-2', sel === s.id && 'bg-surface-2 font-medium')}
                >
                  <span className="num mt-0.5 w-5 text-[12px] text-faint">{i + 1}</span>
                  <span className="flex-1 text-[13px]">{s.title}{state.activeScenario === s.id && <span className="ml-2 text-[11.5px] text-accent">active</span>}</span>
                  {runs[s.id] && (runs[s.id].pass ? <span className="mt-0.5 text-[12px] text-ok" aria-label="Passed">● Pass</span> : <span className="mt-0.5 text-[12px] text-crit" aria-label="Failed">■ Fail</span>)}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex min-w-0 flex-col gap-5">
          <section>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold tracking-tight">{sc.title}</h2>
                <p className="mt-0.5 text-[13px] text-muted"><span className="font-mono text-[12px]">{sc.id}</span> · {sc.summary}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" icon={<Play size={14} />} disabled={!allowed} onClick={start}>Start scenario</Button>
                <Button icon={<RotateCcw size={14} />} disabled={!allowed} onClick={() => setConfirm(true)}>Reset</Button>
              </div>
            </div>
            <h3 className="mb-1.5 mt-4 text-[13px] font-semibold">Steps</h3>
            <ol className="list-decimal space-y-1 pl-5 text-[13.5px]">{sc.steps.map((s) => <li key={s}>{s}</li>)}</ol>
            <div className="mt-4 grid gap-px border border-line bg-line md:grid-cols-2">
              <div className="bg-bg p-3.5">
                <h3 className="mb-1.5 text-[13px] font-semibold">Expected</h3>
                <p className="text-[13.5px]">{sc.expected}</p>
              </div>
              <div className="bg-bg p-3.5">
                <div className="mb-1.5 flex items-center gap-2">
                  <h3 className="text-[13px] font-semibold">Observed</h3>
                  {run && (run.pass ? <span className="text-[12px] font-medium text-ok">● Pass</span> : <span className="text-[12px] font-medium text-crit">■ Fail</span>)}
                </div>
                {run ? (
                  <ul className="space-y-1 text-[13.5px]">{run.observed.filter(Boolean).map((o) => <li key={o} className="border-l-2 border-line-strong pl-2">{o}</li>)}</ul>
                ) : <p className="text-[13px] text-muted">Not run yet. Start the scenario to apply it to the application state; every other page then reflects the result.</p>}
              </div>
            </div>
            {run && (
              <details className="mt-3">
                <summary className="cursor-pointer text-[13px] text-muted hover:text-ink">Step log</summary>
                <ol className="mt-1.5 space-y-1 font-mono text-[12px] text-muted">{run.log.map((l, i) => <li key={i}>{String(i + 1).padStart(2, '0')} {l}</li>)}</ol>
              </details>
            )}
          </section>
          {run && (
            <section className="grid gap-5 border-t border-line pt-4 2xl:grid-cols-[1fr_380px]">
              <div className="min-w-0">
                <h3 className="mb-2 text-[13px] font-semibold">Network after scenario</h3>
                <div className="border border-line"><NetworkMap route={run.route ?? null} altIndex={altIndex} height={460} /></div>
              </div>
              <div className="min-w-0">
                <h3 className="mb-2 text-[13px] font-semibold">Route result</h3>
                {run.route ? <RouteResultView result={run.route} altIndex={altIndex} onAltIndex={setAltIndex} /> : <p className="text-[13px] text-muted">This scenario does not compute a route. See the Verification and Offline pages for its effects.</p>}
              </div>
            </section>
          )}
        </div>
      </div>
      <ConfirmDialog open={confirm} title="Reset scenario?" body="Restores the seeded simulated dataset. Reports, tasks and audit events created since then will be discarded." confirmLabel="Reset" danger onCancel={() => setConfirm(false)} onConfirm={() => { reset(); setRuns({}); setConfirm(false); }} />
    </div>
  );
}
