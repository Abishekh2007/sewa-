import { useEffect, useState } from 'react';
import { Check, Minus } from 'lucide-react';
import { useStore } from '../state/store';
import { can, updateConfig, type Permission } from '../engine/actions';
import { DEFAULT_CONFIG } from '../data/seed';
import { HAZARD_LABEL, ROLE_LABEL, type EvidenceConfig, type HazardCategory, type UserRole } from '../types';
import { Button, ConfirmDialog, Field, inputCls, Notice, PageHeader, Panel, Table, Toast } from '../ui/kit';

const PERMS: { p: Permission; label: string }[] = [
  { p: 'report', label: 'Submit hazard reports' },
  { p: 'incident', label: 'Create / edit incidents' },
  { p: 'verify', label: 'Verify / reject evidence' },
  { p: 'assign', label: 'Assign tasks' },
  { p: 'route', label: 'Compute routes' },
  { p: 'sensor', label: 'Operate sensors' },
  { p: 'config', label: 'Change evidence rules' },
  { p: 'cost', label: 'Edit cost plan' },
  { p: 'scenario', label: 'Run demo scenarios / reset' },
];

export default function Settings() {
  const { state, update } = useStore();
  const [cfg, setCfg] = useState<EvidenceConfig>(() => structuredClone(state.config));
  const [confirm, setConfirm] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'crit' } | null>(null);
  useEffect(() => setCfg(structuredClone(state.config)), [state.config]);
  const allowed = can(state.role, 'config');
  const dirty = JSON.stringify(cfg) !== JSON.stringify(state.config);
  const invalid = [...Object.values(cfg.hazardFreshnessH), cfg.passableFreshnessH, cfg.passableFloodProneFreshnessH, cfg.duplicateWindowMin, cfg.waterWarnCm].some((v) => !(v > 0)) || Object.values(cfg.penalties).some((v) => !(v >= 1));

  const num = (v: number, set: (n: number) => void, unit: string) => (
    <div className="flex items-center gap-2">
      <input type="number" step="any" min={0} className={`${inputCls} w-24 font-mono`} value={v} disabled={!allowed} onChange={(e) => set(Number(e.target.value))} />
      <span className="text-[12px] text-faint">{unit}</span>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title="Evidence rules & roles"
        desc="Freshness limits differ by hazard type and road. Changing them immediately re-evaluates every segment and the routes built on them."
      />
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 border-b border-line bg-bg/95 px-1 py-2">
        <span className="text-[12.5px] text-muted">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        <div className="flex flex-wrap gap-2">
            <Button disabled={!dirty} onClick={() => setCfg(structuredClone(state.config))}>Revert</Button>
            <Button disabled={!allowed} title={!allowed ? 'Your demo role cannot change rules' : undefined} onClick={() => setConfirm(true)}>Restore defaults</Button>
            <Button variant="primary" disabled={!allowed || !dirty || invalid} title={!allowed ? 'Your demo role cannot change rules' : invalid ? 'All values must be positive; penalties ≥ 1' : undefined}
              onClick={() => { update((s) => updateConfig(s, cfg)); setToast({ text: 'Configuration saved; all segments re-evaluated.' }); }}>Save changes</Button>
          </div>
      </div>
      {invalid && <Notice tone="crit">All thresholds must be positive numbers and penalties must be at least 1.</Notice>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Freshness by hazard type" sub="A hazard observation older than this is treated as stale" bodyClass="p-0">
          <Table
            rows={Object.keys(cfg.hazardFreshnessH) as HazardCategory[]}
            rowKey={(k) => k}
            cols={[
              { key: 'k', header: 'Hazard type', cell: (k) => HAZARD_LABEL[k] },
              { key: 'v', header: 'Limit', cell: (k) => num(cfg.hazardFreshnessH[k], (n) => setCfg({ ...cfg, hazardFreshnessH: { ...cfg.hazardFreshnessH, [k]: n } }), 'hours') },
            ]}
          />
        </Panel>
        <div className="space-y-4">
          <Panel title="Passable evidence, duplicates & water threshold">
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Field label="Passable: normal road">{num(cfg.passableFreshnessH, (n) => setCfg({ ...cfg, passableFreshnessH: n }), 'hours')}</Field>
              <Field label="Passable: flood-prone road">{num(cfg.passableFloodProneFreshnessH, (n) => setCfg({ ...cfg, passableFloodProneFreshnessH: n }), 'hours')}</Field>
              <Field label="Duplicate window">{num(cfg.duplicateWindowMin, (n) => setCfg({ ...cfg, duplicateWindowMin: n }), 'minutes')}</Field>
              <Field label="Water-level test threshold" hint="Manual readings above this conflict with a 'passable' claim">{num(cfg.waterWarnCm, (n) => setCfg({ ...cfg, waterWarnCm: n }), 'cm')}</Field>
            </div>
          </Panel>
          <Panel title="Evidence-prioritized routing penalties" sub="Travel-time multiplier for segments without verified passability">
            <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {(Object.keys(cfg.penalties) as (keyof EvidenceConfig['penalties'])[]).map((k) => (
                <Field key={k} label={k.replace(/_/g, ' ').toLowerCase()}>{num(cfg.penalties[k], (n) => setCfg({ ...cfg, penalties: { ...cfg.penalties, [k]: n } }), '× time')}</Field>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Trust tiers (as implemented)">
          <Table
            rows={[
              ['3 · Verified', 'Observation independently verified (field inspection or verified report). Supersedes older evidence.'],
              ['2 · Authenticated', 'Field verifier, local authority or emergency responder account, not yet independently verified.'],
              ['1 · Identified / sensor', 'Identified public reporter or sensor reading; also any report that used a legacy segment ID.'],
              ['0 · Anonymous', 'Anonymous public report. Remains unverified until the verification workflow completes.'],
            ]}
            rowKey={(r) => r[0]}
            cols={[{ key: 't', header: 'Tier', cell: (r) => <span className="whitespace-nowrap font-medium">{r[0]}</span> }, { key: 'd', header: 'Meaning', cell: (r) => <span className="text-muted">{r[1]}</span> }]}
          />
        </Panel>
        <Panel title="Status & confidence rules">
          <ul className="list-disc space-y-1.5 pl-5 text-[13px] text-muted">
            <li><b className="text-ink">No observations</b> → Unknown, Low. A lack of reports never means passable.</li>
            <li><b className="text-ink">All observations expired</b> → Stale evidence, Low. If the last known condition was blocked, routing still excludes it.</li>
            <li><b className="text-ink">Blocked claim from tier ≥ 2</b> → Blocked (High if tier 3, else Medium). Only a newer verified "passable" lifts it.</li>
            <li><b className="text-ink">Passable and hazard/blocked claims both current</b> → Conflicting, Low. Both are kept and a verification task opens.</li>
            <li><b className="text-ink">"Passable" with water above threshold</b> → Conflicting.</li>
            <li><b className="text-ink">Hazard claims only</b> → Potential hazard (Medium if tier ≥ 2, else Low).</li>
            <li><b className="text-ink">Passable from tier ≥ 2</b> → Verified passable. High only if tier 3 and younger than half the freshness limit; otherwise Medium.</li>
            <li><b className="text-ink">Passable from tier ≤ 1 only</b> → Unknown.</li>
          </ul>
          <p className="mt-2 text-[12.5px] text-faint">No numerical AI confidence score is used. Levels are qualitative and fully determined by the rules above.</p>
        </Panel>
      </div>

      <Panel title="Roles and permissions" sub="Client-side demo roles are not real security; a real deployment needs server-side authorization." bodyClass="p-0">
        <Table
          rows={PERMS}
          rowKey={(r) => r.p}
          cols={[
            { key: 'p', header: 'Permission', cell: (r) => r.label },
            ...(Object.keys(ROLE_LABEL) as UserRole[]).map((role) => ({
              key: role,
              header: <span className={role === state.role ? 'text-accent' : ''}>{ROLE_LABEL[role]}</span>,
              cell: (r: (typeof PERMS)[number]) => can(role, r.p) ? <span className="text-ok"><Check size={14} aria-hidden /><span className="sr-only">allowed</span></span> : <span className="text-faint"><Minus size={14} aria-hidden /><span className="sr-only">not allowed</span></span>,
            })),
          ]}
        />
      </Panel>
      <ConfirmDialog open={confirm} title="Restore default rules?" body="All freshness limits, thresholds and penalties return to their defaults, and every segment is re-evaluated." confirmLabel="Restore defaults" danger
        onCancel={() => setConfirm(false)} onConfirm={() => { update((s) => updateConfig(s, DEFAULT_CONFIG)); setConfirm(false); setToast({ text: 'Defaults restored.' }); }} />
      <Toast msg={toast} onDone={() => setToast(null)} />
    </div>
  );
}
