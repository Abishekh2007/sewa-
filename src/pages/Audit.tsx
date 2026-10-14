import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useStore } from '../state/store';
import type { AuditEvent, AuditType } from '../types';
import { Button, fmtTime, inputCls, Mono, PageHeader, Panel, Select, Table, Tag } from '../ui/kit';
import { downloadCsv, iso } from '../utils/csv';

const PAGE = 50;

export default function Audit() {
  const { state } = useStore();
  const [q, setQ] = useState('');
  const [type, setType] = useState<'all' | AuditType>('all');
  const [source, setSource] = useState<'all' | AuditEvent['source']>('all');
  const [page, setPage] = useState(0);
  const types = useMemo(() => [...new Set(state.audit.map((a) => a.type))].sort(), [state.audit]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return [...state.audit].reverse().filter((a) =>
      (type === 'all' || a.type === type) && (source === 'all' || a.source === source) &&
      (!needle || `${a.id} ${a.recordId} ${a.details} ${a.actor}`.toLowerCase().includes(needle)));
  }, [state.audit, q, type, source]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const p = Math.min(page, pages - 1);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit trail"
        desc="Append-only event history with provenance for every report, status change, verification, assignment, route calculation, sensor alert and sync."
        actions={<Button icon={<Download size={14} />} onClick={() => downloadCsv('audit-trail.csv', rows.map((a) => ({ ...a, at: iso(a.at), wallAt: iso(a.wallAt) })))}>Export CSV</Button>}
      />
      <p className="text-[12px] text-faint">Stored in browser LocalStorage. Append-only by convention, but not tamper-proof; a real deployment needs server-side, access-controlled storage.</p>
      <Panel
        title={`${rows.length} event(s)`}
        actions={
          <div className="flex flex-wrap gap-2">
            <input aria-label="Search events" className={`${inputCls} h-8 w-56`} placeholder="Search ID, record, details" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
            <Select ariaLabel="Event type" className="h-8 w-44" value={type} onChange={(v) => { setType(v); setPage(0); }} options={[{ value: 'all', label: 'All types' }, ...types.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))]} />
            <Select ariaLabel="Source" className="h-8 w-36" value={source} onChange={(v) => { setSource(v); setPage(0); }} options={[{ value: 'all', label: 'All sources' }, { value: 'demo-user', label: 'Demo user' }, { value: 'system', label: 'System' }, { value: 'simulated', label: 'Simulated' }, { value: 'sensor-sim', label: 'Sensor sim' }]} />
          </div>
        }
        bodyClass="p-0"
      >
        <Table
          rows={rows.slice(p * PAGE, p * PAGE + PAGE)}
          rowKey={(a) => a.id}
          cols={[
            { key: 'id', header: 'Event', cell: (a) => <Mono>{a.id}</Mono> },
            { key: 'at', header: 'Sim time', cell: (a) => <span className="whitespace-nowrap font-mono text-[12px]">{fmtTime(a.at)}</span> },
            { key: 'type', header: 'Type', cell: (a) => <Tag>{a.type.replace(/_/g, ' ')}</Tag> },
            { key: 'rec', header: 'Record', cell: (a) => <Mono>{a.recordId}</Mono> },
            { key: 'src', header: 'Source', cell: (a) => <span className="whitespace-nowrap text-muted">{a.source} · {a.actor}</span> },
            { key: 'd', header: 'Details', cell: (a) => a.details },
            { key: 'w', header: 'Wall clock', cell: (a) => <span className="whitespace-nowrap font-mono text-[12px] text-faint">{fmtTime(a.wallAt)}</span> },
          ]}
        />
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12.5px] text-muted">
          <span>Page {p + 1} of {pages}</span>
          <div className="flex gap-1.5">
            <Button size="sm" disabled={p === 0} onClick={() => setPage(p - 1)}>Previous</Button>
            <Button size="sm" disabled={p >= pages - 1} onClick={() => setPage(p + 1)}>Next</Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
