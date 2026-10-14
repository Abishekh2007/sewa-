import { useState } from 'react';
import { CheckCircle2, ListChecks, Play, RotateCcw, XCircle } from 'lucide-react';
import { useStore } from '../state/store';
import { can } from '../engine/actions';
import { SCENARIOS, type ScenarioRun } from '../engine/scenarios';
import { Button, ConfirmDialog, cx, Notice, PageHeader, Panel, Tag, Table } from '../ui/kit';
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
            <Button variant="danger" icon={<RotateCcw size={15} />} disabled={!allowed} onClick={() => setConfirm(true)}>Reset scenario</Button>
          </>
        }
      />
      {!allowed && <div className="mb-3"><Notice tone="warn">The current demo role cannot run scenarios. Switch to Emergency Coordinator.</Notice></div>}
      {all && (
        <Panel className="mb-4" title="Scenario check" sub="Run in isolation; does not change the current application state" actions={<Button size="sm" variant="ghost" onClick={() => setAll(null)}>Hide</Button>}>
          <Table rowKey={(r) => r.id} rows={all} cols={[
            { key: 'id', header: 'ID', cell: (r) => <span className="font-mono">{r.id}</span> },
            { key: 't', header: 'Scenario', cell: (r) => r.title },
            { key: 'o', header: 'Observed', cell: (r) => <span className="text-muted">{r.observed}</span> },
            { key: 'p', header: 'Result', cell: (r) => <Tag tone={r.pass ? 'ok' : 'crit'}>{r.pass ? 'PASS' : 'FAIL'}</Tag> },
          ]} />
          <div className="mt-2 text-[12.5px] text-muted">{all.filter((a) => a.pass).length}/{all.length} passed (simulated test results, not field validation).</div>
        </Panel>
      )}
      <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
        <Panel title="Scenarios" bodyClass="p-0">
          <ol>
            {SCENARIOS.map((s, i) => (
              <li key={s.id}>
                <button
                  onClick={() => { setSel(s.id); setAltIndex(0); }}
                  aria-current={sel === s.id}
                  className={cx('flex w-full items-start gap-3 border-b border-line px-3.5 py-2.5 text-left last:border-0 hover:bg-surface-2', sel === s.id && 'bg-raised')}
                >
                  <span className="mt-0.5 font-mono text-[12px] text-faint">{String(i + 1).padStart(2, '0')}</span>
                  <span className="flex-1 text-[13.5px]">{s.title}{state.activeScenario === s.id && <span className="ml-2 text-[11px] text-accent">active</span>}</span>
                  {runs[s.id] && (runs[s.id].pass ? <CheckCircle2 size={15} className="mt-0.5 text-ok" aria-label="Passed" /> : <XCircle size={15} className="mt-0.5 text-crit" aria-label="Failed" />)}
                </button>
              </li>
            ))}
          </ol>
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          <Panel
            title={`${sc.id} · ${sc.title}`}
            sub={sc.summary}
            actions={<Button variant="primary" icon={<Play size={14} />} disabled={!allowed} onClick={start}>Start scenario</Button>}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="label-caps mb-1.5">Steps</div>
                <ol className="list-decimal space-y-1 pl-5 text-[13.5px]">{sc.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              </div>
              <div>
                <div className="label-caps mb-1.5">Expected behaviour</div>
                <p className="text-[13.5px]">{sc.expected}</p>
              </div>
            </div>
            {run && (
              <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-2">
                <div>
                  <div className="mb-1.5 flex items-center gap-2"><span className="label-caps">Observed behaviour</span><Tag tone={run.pass ? 'ok' : 'crit'}>{run.pass ? 'PASS' : 'FAIL'}</Tag></div>
                  <ul className="space-y-1 text-[13.5px]">{run.observed.filter(Boolean).map((o) => <li key={o} className="border-l-2 border-line-strong pl-2">{o}</li>)}</ul>
                </div>
                <div>
                  <div className="label-caps mb-1.5">Step log</div>
                  <ol className="space-y-1 font-mono text-[12px] text-muted">{run.log.map((l, i) => <li key={i}>{String(i + 1).padStart(2, '0')} {l}</li>)}</ol>
                </div>
              </div>
            )}
            {!run && <p className="mt-4 text-[13px] text-muted">Start the scenario to apply it to the application state. Every other page (map, tasks, audit trail, analytics) then reflects the result.</p>}
          </Panel>
          {run && (
            <div className="grid gap-4 2xl:grid-cols-[1fr_380px]">
              <Panel title="Network after scenario" bodyClass="p-0">
                <NetworkMap route={run.route ?? null} altIndex={altIndex} height={460} />
              </Panel>
              {run.route ? (
                <Panel title="Route result"><RouteResultView result={run.route} altIndex={altIndex} onAltIndex={setAltIndex} /></Panel>
              ) : (
                <Panel title="Route result"><p className="text-[13px] text-muted">This scenario does not compute a route. See the Verification and Offline pages for its effects.</p></Panel>
              )}
            </div>
          )}
        </div>
      </div>
      <ConfirmDialog open={confirm} title="Reset scenario?" body="Restores the seeded simulated dataset. Reports, tasks and audit events created since then will be discarded." confirmLabel="Reset" danger onCancel={() => setConfirm(false)} onConfirm={() => { reset(); setRuns({}); setConfirm(false); }} />
    </div>
  );
}
