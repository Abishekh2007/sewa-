import { useState } from 'react';
import { Download, Plus } from 'lucide-react';
import { useStore } from '../state/store';
import { audit, can } from '../engine/actions';
import type { CostItem } from '../types';
import { Button, ConfirmDialog, inputCls, Mono, PageHeader, Panel, Select, Table } from '../ui/kit';
import { downloadCsv } from '../utils/csv';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;
const CATS: CostItem['category'][] = ['software', 'hosting', 'hardware', 'operations'];

const PHASES = [
  ['Phase 1', 'Software simulation', 'Built-in fictional network, evidence engine, routing, scenarios and automated tests (this prototype).'],
  ['Phase 2', 'Controlled routing tests', 'Expand deterministic test suites; compare against baseline shortest path; review rules with domain experts.'],
  ['Phase 3', 'Stakeholder feedback', 'Walkthroughs with emergency coordinators, ward offices and field volunteers; usability and language review.'],
  ['Phase 4', 'Optional hardware demonstration', 'ESP32 water-level gauge on a test stand; calibration study; sensor readings remain advisory.'],
  ['Phase 5', 'Limited pilot', 'Small supervised pilot, subject to permissions, data-protection review and validation. No automated dispatch.'],
];

const RISKS = [
  ['False "passable" status', 'Conservative mode, freshness expiry, verified-only passability, human decision retained.'],
  ['Malicious or mistaken public reports', 'Anonymous reports stay unverified; duplicate detection; verification tasks; rejection workflow.'],
  ['Stale cached data offline', 'Last-sync timestamp shown everywhere; offline banner; queued reports applied only after sync.'],
  ['Sensor misplacement / drift', 'Readings never decide passability alone; calibration notes; out-of-range and missing-data flags.'],
  ['Exposure of vulnerable people\'s locations', 'Role-restricted incident detail; minimal data; consent for contact details.'],
  ['Client-side roles are not security', 'Server-side authorization required before any real deployment.'],
];

export default function Implementation() {
  const { state, update } = useStore();
  const allowed = can(state.role, 'cost');
  const [del, setDel] = useState<string | null>(null);
  const deny = allowed ? undefined : 'Your demo role cannot edit costs';

  const edit = (id: string, patch: Partial<CostItem>) => update((s) => {
    const n = structuredClone(s);
    Object.assign(n.costs.find((c) => c.id === id)!, patch);
    return n;
  });
  const add = () => update((s) => {
    const n = structuredClone(s);
    const id = `C${Date.now().toString(36)}`;
    n.costs.push({ id, item: 'New item', category: 'operations', qty: 1, unitInr: 0, note: 'Estimate' });
    audit(n, 'config_change', id, 'Cost item added');
    return n;
  });
  const remove = (id: string) => update((s) => {
    const n = structuredClone(s);
    n.costs = n.costs.filter((c) => c.id !== id);
    audit(n, 'config_change', id, 'Cost item removed');
    return n;
  });
  const total = state.costs.reduce((a, c) => a + c.qty * c.unitInr, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Implementation & cost planning"
        desc="Editable assumptions for a phased, low-cost deployment path."
        actions={<Button icon={<Download size={14} />} onClick={() => downloadCsv('cost-estimates.csv', state.costs.map((c) => ({ ...c, totalInr: c.qty * c.unitInr })))}>Export CSV</Button>}
      />
      <p className="text-[12px] text-faint">All prices are estimates that require verification. They are not supplier quotations.</p>

      <Panel title="Cost assumptions" actions={<Button size="sm" icon={<Plus size={13} />} disabled={!allowed} title={deny} onClick={add}>Add row</Button>} bodyClass="p-0">
        <Table
          rows={state.costs}
          rowKey={(c) => c.id}
          cols={[
            { key: 'item', header: 'Item', cell: (c) => <input aria-label="Item" className={`${inputCls} h-8 min-w-48`} value={c.item} disabled={!allowed} onChange={(e) => edit(c.id, { item: e.target.value })} /> },
            { key: 'cat', header: 'Category', cell: (c) => <Select ariaLabel="Category" className="h-8 w-32" value={c.category} onChange={(v) => allowed && edit(c.id, { category: v })} options={CATS.map((x) => ({ value: x, label: x }))} /> },
            { key: 'qty', header: 'Qty', cell: (c) => <input aria-label="Quantity" type="number" min={0} className={`${inputCls} h-8 w-20 font-mono`} value={c.qty} disabled={!allowed} onChange={(e) => edit(c.id, { qty: Math.max(0, Number(e.target.value) || 0) })} /> },
            { key: 'unit', header: 'Unit ₹ (est.)', cell: (c) => <input aria-label="Unit cost" type="number" min={0} className={`${inputCls} h-8 w-24 font-mono`} value={c.unitInr} disabled={!allowed} onChange={(e) => edit(c.id, { unitInr: Math.max(0, Number(e.target.value) || 0) })} /> },
            { key: 'tot', header: 'Total', className: 'text-right', cell: (c) => <Mono>{inr(c.qty * c.unitInr)}</Mono> },
            { key: 'note', header: 'Note', cell: (c) => <input aria-label="Note" className={`${inputCls} h-8 min-w-40`} value={c.note} disabled={!allowed} onChange={(e) => edit(c.id, { note: e.target.value })} /> },
            { key: 'x', header: '', cell: (c) => <Button size="sm" variant="ghost" disabled={!allowed} title={deny} onClick={() => setDel(c.id)} aria-label={`Remove ${c.item}`}>Remove</Button> },
          ]}
        />
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-line px-3.5 py-2.5 text-[13px]">
          {CATS.map((cat) => <span key={cat} className="text-muted">{cat}: <Mono className="text-ink">{inr(state.costs.filter((c) => c.category === cat).reduce((a, c) => a + c.qty * c.unitInr, 0))}</Mono></span>)}
          <span className="ml-auto font-medium">Estimated total: <Mono>{inr(total)}</Mono></span>
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Prototype components">
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
            <li>Evidence assessment engine (TypeScript)</li><li>Dijkstra routing with 3 modes + last-mile</li><li>Hazard, incident & verification workflows</li><li>Offline queue & sync simulation, service worker</li><li>Sensor adapter (simulated; ESP32-ready payload)</li><li>Analytics, test harness, CSV exports</li>
          </ul>
        </Panel>
        <Panel title="Software & hosting">
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
            <li>React, TypeScript, Vite, Tailwind CSS, Recharts, Lucide (open source)</li><li>No paid APIs or API keys</li><li>Hosting: any static host (free tier); optional managed database for shared data</li><li>Maps: built-in SVG network; OpenStreetMap tiles possible for real areas with attribution</li>
          </ul>
        </Panel>
        <Panel title="Maintenance & beneficiaries">
          <ul className="list-disc space-y-1 pl-5 text-[13px] text-muted">
            <li>Quarterly review of freshness rules and road network data</li><li>Sensor calibration and battery checks</li><li>Pilot beneficiaries: district emergency coordinators, ward offices, ambulance and rescue crews, flood-prone residential clusters</li>
          </ul>
        </Panel>
      </div>

      <section>
        <h2 className="mb-2 text-[14px] font-semibold">Phased implementation plan</h2>
        <ol className="border-l border-line-strong pl-5">
          {PHASES.map((p, i) => (
            <li key={p[0]} className="relative pb-4 last:pb-0">
              <span aria-hidden className={`absolute -left-[25px] top-1.5 h-2 w-2 rounded-full border border-line-strong ${i === 0 ? 'bg-ok' : 'bg-bg'}`} />
              <div className="flex flex-wrap items-baseline gap-x-2"><span className="font-mono text-[12px] text-faint">{p[0]}</span><span className="text-[13.5px] font-medium">{p[1]}</span></div>
              <p className="max-w-3xl text-[13px] text-muted">{p[2]}</p>
            </li>
          ))}
        </ol>
      </section>
      <Panel title="Risks & mitigations" bodyClass="p-0">
        <Table rows={RISKS} rowKey={(r) => r[0]} cols={[
          { key: 'r', header: 'Risk', cell: (r) => <span className="font-medium">{r[0]}</span> },
          { key: 'm', header: 'Mitigation', cell: (r) => <span className="text-muted">{r[1]}</span> },
        ]} />
      </Panel>
      <ConfirmDialog open={!!del} title="Remove cost item?" body="This row will be removed from the cost plan." confirmLabel="Remove" danger onCancel={() => setDel(null)} onConfirm={() => { if (del) remove(del); setDel(null); }} />
    </div>
  );
}
