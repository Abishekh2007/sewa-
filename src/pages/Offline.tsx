import { useState } from 'react';
import { useStore } from '../state/store';
import { can, injectRemoteRecord, setOnline, syncOffline } from '../engine/actions';
import { HAZARD_LABEL, SOURCE_LABEL } from '../types';
import { Button, Field, fmtTime, KV, Mono, Notice, PageHeader, Panel, Select, Table, Tag, Toast } from '../ui/kit';
import { fmtAge } from '../engine/evidence';

export default function Offline() {
  const { state, update } = useStore();
  const { offline } = state;
  const [seg, setSeg] = useState('S24');
  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'crit' } | null>(null);
  const ageMin = (state.now - offline.lastSyncAt) / 60_000;
  const canOp = can(state.role, 'report');

  return (
    <div className="space-y-4">
      <PageHeader
        title="Offline & synchronisation"
        desc="Simulated connectivity. While offline, the last synchronised network and hazard data is shown as cached, and new reports are queued instead of being applied."
        actions={
          <>
            <Button onClick={() => update((s) => setOnline(s, !s.offline.online))} variant={offline.online ? 'danger' : 'primary'}>
              {offline.online ? 'Go offline (simulated)' : 'Restore connectivity'}
            </Button>
            <Button disabled={!offline.online} title={!offline.online ? 'Cannot sync while offline' : undefined}
              onClick={() => { update(syncOffline); setToast({ text: 'Synchronisation complete. See sync log.' }); }}>
              Sync now
            </Button>
          </>
        }
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Connection">
          <KV items={[
            ['Status', offline.online ? <Tag tone="ok">● Online (simulated)</Tag> : <Tag tone="warn">▲ Offline (simulated)</Tag>],
            ['Last sync', <span>{fmtTime(offline.lastSyncAt)} <span className="text-faint">({fmtAge(ageMin)} ago)</span></span>],
            ['Queued reports', <Mono>{offline.queue.length}</Mono>],
            ['Remote inbox', <Mono>{offline.remoteInbox.length}</Mono>],
          ]} />
          {!offline.online && <div className="mt-3"><Notice tone="warn">Cached data may be stale. Road statuses shown were last refreshed {fmtAge(ageMin)} ago and cannot be updated until reconnection.</Notice></div>}
        </Panel>
        <Panel title="Simulate update from another device" className="lg:col-span-2" sub="Adds a record to the simulated server inbox; it arrives at next sync">
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Segment">
              <Select value={seg} onChange={setSeg} options={state.segments.map((s) => ({ value: s.id, label: `${s.id} ${s.name}` }))} className="w-64" />
            </Field>
            <Button disabled={!canOp} title={!canOp ? 'Your demo role cannot add records' : undefined}
              onClick={() => {
                update((s) => injectRemoteRecord(s, { segmentId: seg, kind: 'report', condition: 'passable', observedAt: s.now, sourceType: 'local_authority', sourceName: 'Ward Office R-7 (other device)', verification: 'unverified', note: 'Simulated remote record' }));
                setToast({ text: `Remote "passable" record for ${seg} placed in inbox.` });
              }}>
              Add remote "passable" record
            </Button>
          </div>
          <p className="mt-2 text-[12.5px] text-faint">Tip: go offline, submit a hazard report for the same segment, add a remote record, then restore connectivity. The sync preserves both observations and the evidence engine flags the conflict.</p>
        </Panel>
      </div>

      <Panel title="Queued reports (not yet applied)" bodyClass="p-0">
        <Table
          rows={offline.queue}
          rowKey={(r) => r.id}
          empty="No reports queued."
          cols={[
            { key: 'id', header: 'Report', cell: (r) => <Mono>{r.id}</Mono> },
            { key: 'seg', header: 'Segment ref', cell: (r) => <Mono>{r.submittedSegmentRef}</Mono> },
            { key: 'cat', header: 'Category', cell: (r) => HAZARD_LABEL[r.category] },
            { key: 'cond', header: 'Claim', cell: (r) => r.condition },
            { key: 'src', header: 'Source', cell: (r) => SOURCE_LABEL[r.sourceType] },
            { key: 'obs', header: 'Observed', cell: (r) => fmtTime(r.observedAt) },
          ]}
        />
      </Panel>

      <Panel title="Remote inbox (simulated server records)" bodyClass="p-0">
        <Table
          rows={offline.remoteInbox}
          rowKey={(r) => r.id}
          empty="Inbox empty."
          cols={[
            { key: 'id', header: 'Evidence', cell: (r) => <Mono>{r.id}</Mono> },
            { key: 'seg', header: 'Segment', cell: (r) => <Mono>{r.segmentId}</Mono> },
            { key: 'c', header: 'Claim', cell: (r) => r.condition },
            { key: 's', header: 'Source', cell: (r) => r.sourceName },
            { key: 'at', header: 'Observed', cell: (r) => fmtTime(r.observedAt) },
          ]}
        />
      </Panel>

      <Panel title="Sync log" bodyClass="p-0">
        <Table
          rows={[...offline.syncLog].reverse()}
          rowKey={(r) => String(r.at) + r.details}
          empty="No synchronisations yet."
          cols={[
            { key: 'at', header: 'Sim time', cell: (r) => fmtTime(r.at) },
            { key: 'a', header: 'Applied', cell: (r) => <Mono>{r.applied}</Mono> },
            { key: 'c', header: 'Conflicts', cell: (r) => <Mono className={r.conflicts ? 'text-conf' : ''}>{r.conflicts}</Mono> },
            { key: 'u', header: 'Unmatched', cell: (r) => <Mono>{r.unmatched}</Mono> },
            { key: 'd', header: 'Details', cell: (r) => <span className="text-muted">{r.details}</span> },
          ]}
        />
      </Panel>

      <Panel title="Service worker test procedure (real offline loading)">
        <ol className="list-decimal space-y-1 pl-5 text-[13px] text-muted">
          <li>Run <Mono>npm run build</Mono> then <Mono>npm run preview</Mono> (the service worker registers in production builds only).</li>
          <li>Open the preview URL once so the app shell is cached.</li>
          <li>DevTools → Network → set throttling to <em>Offline</em>, then reload. The app loads from cache with data from LocalStorage.</li>
          <li>The simulated online/offline toggle above controls report queuing independently of the real network.</li>
        </ol>
      </Panel>
      <Toast msg={toast} onDone={() => setToast(null)} />
    </div>
  );
}
