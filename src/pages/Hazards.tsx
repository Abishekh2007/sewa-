import { useMemo, useState } from 'react';
import { Eye, Send } from 'lucide-react';
import { useRoute, useStore } from '../state/store';
import { can, submitReport, validateReport, type ReportInput } from '../engine/actions';
import { HAZARD_LABEL, ROLE_LABEL, SOURCE_LABEL, type HazardCategory, type HazardReport, type ObservedCondition, type SourceType } from '../types';
import { Button, Field, KV, Modal, Mono, Notice, PageHeader, Panel, Select, StatusChip, Table, Tag, Toast, cx, fmtTime, inputCls, textareaCls, type Col } from '../ui/kit';

const CATS = Object.keys(HAZARD_LABEL) as HazardCategory[];
const SOURCES = Object.keys(SOURCE_LABEL).filter((s) => s !== 'sensor') as SourceType[];
const toLocal = (t: number) => { const d = new Date(t - new Date(t).getTimezoneOffset() * 60000); return d.toISOString().slice(0, 16); };

const blank = (segment: string, now: number): ReportInput => ({
  category: 'flooded_road', segmentRef: segment, description: '', observedAt: now, severity: 'moderate', condition: 'hazard',
  sourceType: 'public_identified', sourceName: '', vehicleAccess: 'unknown',
});

export default function Hazards() {
  const { state, update, assessments } = useStore();
  const [, params] = useRoute();
  const [f, setF] = useState<ReportInput>(() => blank(params.get('segment') ?? 'S01', state.now));
  const [customRef, setCustomRef] = useState('');
  const [water, setWater] = useState('');
  const [wantContact, setWantContact] = useState(false);
  const [contact, setContact] = useState({ value: '', consent: false });
  const [imgErr, setImgErr] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'crit' } | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<'all' | HazardCategory>('all');
  const [st, setSt] = useState<'all' | HazardReport['status']>('all');
  const [src, setSrc] = useState<'all' | SourceType>('all');
  const [sel, setSel] = useState<string | null>(null);
  const canReport = can(state.role, 'report');

  const input = (): ReportInput => ({
    ...f,
    segmentRef: customRef.trim() || f.segmentRef,
    sourceName: f.sourceType === 'public_anonymous' ? 'Anonymous' : f.sourceName,
    waterLevelCm: water === '' ? undefined : Number(water),
    contact: wantContact && contact.value.trim() ? contact : undefined,
  });

  const onImage = (file?: File) => {
    setImgErr('');
    if (!file) return setF({ ...f, image: undefined });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return setImgErr('Only JPEG, PNG or WebP images are accepted.');
    if (file.size > 2 * 1024 * 1024) return setImgErr('Image must be 2 MB or smaller.');
    const meta = { name: file.name, type: file.type, sizeKb: Math.round(file.size / 1024), note: 'Image does not prove location or time; not validated.' };
    if (file.size > 200 * 1024) return setF({ ...f, image: { ...meta, note: meta.note + ' Stored as metadata only (over 200 KB).' } });
    const r = new FileReader();
    r.onload = () => setF((p) => ({ ...p, image: { ...meta, dataUrl: String(r.result) } }));
    r.onerror = () => setImgErr('Could not read the image file.');
    r.readAsDataURL(file);
  };

  const doPreview = () => {
    const errs = validateReport(state, input());
    setErrors(errs);
    if (!errs.length) setPreview(true);
  };

  const submit = () => {
    if (busy) return;
    setBusy(true);
    let res: [string | null, string[]] = [null, []];
    update((s) => { const [n, id, errs] = submitReport(s, input()); res = [id, errs]; return n; });
    setTimeout(() => {
      const [id, errs] = res;
      setBusy(false);
      setPreview(false);
      if (errs.length) { setErrors(errs); setToast({ text: errs[0], tone: 'crit' }); return; }
      setErrors([]);
      setToast({ text: state.offline.online ? `Report ${id} saved. Road status re-evaluated.` : `Report ${id} queued offline. It will be applied on sync.` });
      setF(blank(f.segmentRef, state.now)); setCustomRef(''); setWater(''); setContact({ value: '', consent: false }); setWantContact(false);
    }, 0);
  };

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return [...state.reports, ...state.offline.queue]
      .filter((r) => cat === 'all' || r.category === cat)
      .filter((r) => st === 'all' || r.status === st)
      .filter((r) => src === 'all' || r.sourceType === src)
      .filter((r) => !t || `${r.id} ${r.segmentId} ${r.description} ${r.sourceName}`.toLowerCase().includes(t))
      .sort((a, b) => b.submittedAt - a.submittedAt);
  }, [state.reports, state.offline.queue, q, cat, st, src]);

  const statusTone = (s: HazardReport['status']) => (s === 'verified' ? 'ok' : s === 'rejected' ? 'crit' : s === 'queued_offline' ? 'warn' : 'neutral');
  const cols: Col<HazardReport>[] = [
    { key: 'id', header: 'ID', cell: (r) => <Mono>{r.id}</Mono> },
    { key: 'cat', header: 'Category', cell: (r) => HAZARD_LABEL[r.category] },
    { key: 'seg', header: 'Segment', cell: (r) => <Mono>{r.segmentId}</Mono> },
    { key: 'cond', header: 'Claim', cell: (r) => r.condition },
    { key: 'src', header: 'Source', cell: (r) => <span className="text-muted">{SOURCE_LABEL[r.sourceType]}</span> },
    { key: 'st', header: 'Status', cell: (r) => <Tag tone={statusTone(r.status)}>{r.status.replace('_', ' ')}</Tag> },
    { key: 'at', header: 'Observed', cell: (r) => <span className="whitespace-nowrap text-muted">{fmtTime(r.observedAt)}</span> },
  ];
  const selR = rows.find((r) => r.id === sel);
  const selEv = selR?.evidenceId ? state.evidence.find((e) => e.id === selR.evidenceId) : undefined;
  const preview_ = input();

  return (
    <div>
      <PageHeader title="Hazard reports" desc="Report a road condition. Anonymous and public reports stay unverified until a field verifier or authority confirms them. A report never marks a road passable by itself." />
      <div className="grid gap-4 border-t border-line pt-3 xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
        <section className="min-w-0 py-1 xl:pr-5"><h2 className="text-[14px] font-semibold">New report</h2><p className="mb-3 text-[12px] text-muted">{state.offline.online ? 'Applied immediately to the evidence engine' : 'Offline: report will be queued'}</p>
          <fieldset disabled={!canReport} title={canReport ? undefined : `Not permitted for ${ROLE_LABEL[state.role]}`} className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2 border-t border-line pt-3 first:border-0 first:pt-0"><h3 className="text-[13px] font-semibold">What</h3><p className="text-[12px] text-muted">Choose the hazard and what you saw.</p></div>
            <Field label="Hazard category" required><Select value={f.category} onChange={(v) => setF({ ...f, category: v })} options={CATS.map((c) => ({ value: c, label: HAZARD_LABEL[c] }))} /></Field>
            <Field label="Condition observed" required><Select<ObservedCondition> value={f.condition} onChange={(v) => setF({ ...f, condition: v })} options={[{ value: 'hazard', label: 'Hazard present (passable with care?)' }, { value: 'blocked', label: 'Blocked / impassable' }, { value: 'passable', label: 'Passable / cleared' }]} /></Field>
            <div className="sm:col-span-2 border-t border-line pt-3 first:border-0 first:pt-0"><h3 className="text-[13px] font-semibold">Where</h3><p className="text-[12px] text-muted">Pick a segment or enter its ID.</p></div>
            <Field label="Road segment" required><Select value={f.segmentRef} onChange={(v) => setF({ ...f, segmentRef: v })} options={state.segments.map((s) => ({ value: s.id, label: `${s.id} — ${s.name}` }))} /></Field>
            <Field label="Or enter segment ID" hint="Legacy IDs (e.g. R7-OLD-03) are mapped and flagged"><input className={inputCls} value={customRef} onChange={(e) => setCustomRef(e.target.value)} placeholder="Optional" /></Field>
            <div className="sm:col-span-2"><Field label="Description" required><textarea className={textareaCls} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What did you observe? Where exactly on the segment?" /></Field></div>
            <div className="sm:col-span-2 border-t border-line pt-3 first:border-0 first:pt-0"><h3 className="text-[13px] font-semibold">When</h3><p className="text-[12px] text-muted">Use the simulated clock time of the observation.</p></div>
            <Field label="Observed at (sim clock)" required><input type="datetime-local" className={inputCls} value={toLocal(f.observedAt)} onChange={(e) => setF({ ...f, observedAt: new Date(e.target.value).getTime() })} /></Field>
            <Field label="Severity" required><Select value={f.severity} onChange={(v) => setF({ ...f, severity: v })} options={(['low', 'moderate', 'high', 'critical'] as const).map((v) => ({ value: v, label: v }))} /></Field>
            <div className="sm:col-span-2 border-t border-line pt-3 first:border-0 first:pt-0"><h3 className="text-[13px] font-semibold">Source</h3><p className="text-[12px] text-muted">Who is reporting. Anonymous reports stay unverified.</p></div>
            <Field label="Source type" required><Select value={f.sourceType} onChange={(v) => setF({ ...f, sourceType: v })} options={SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))} /></Field>
            <Field label="Source name" required={f.sourceType !== 'public_anonymous'}><input className={inputCls} disabled={f.sourceType === 'public_anonymous'} value={f.sourceType === 'public_anonymous' ? 'Anonymous' : f.sourceName} onChange={(e) => setF({ ...f, sourceName: e.target.value })} placeholder="Synthetic name or unit" /></Field>
            <Field label="Vehicle accessibility"><Select value={f.vehicleAccess} onChange={(v) => setF({ ...f, vehicleAccess: v })} options={[{ value: 'unknown', label: 'Unknown' }, { value: 'all', label: 'All vehicles' }, { value: 'high_clearance_only', label: 'High-clearance (4x4) only' }, { value: 'two_wheeler_only', label: 'Two-wheeler only' }, { value: 'none', label: 'No vehicles' }]} /></Field>
            <Field label="Water level (cm, optional)"><input type="number" min={0} className={inputCls} value={water} onChange={(e) => setWater(e.target.value)} /></Field>
            <div className="sm:col-span-2 border-t border-line pt-3 first:border-0 first:pt-0"><h3 className="text-[13px] font-semibold">Optional evidence</h3><p className="text-[12px] text-muted">Water level, vehicle access and a photo help verifiers.</p></div>
            <div className="sm:col-span-2"><Field label="Image (optional)" hint="JPEG/PNG/WebP, ≤ 2 MB. An image does not prove location or time." error={imgErr}><input type="file" accept="image/jpeg,image/png,image/webp" className="text-[13px] text-muted file:mr-3 file:h-8 file:border file:border-line-strong file:bg-surface-2 file:px-3 file:text-ink" onChange={(e) => onImage(e.target.files?.[0])} /></Field></div>
            <div className="sm:col-span-2 border-t border-line pt-3"><h3 className="text-[13px] font-semibold">Contact (opt-in)</h3><p className="text-[12px] text-muted">Only stored with your consent, for follow-up on this report.</p></div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={wantContact} onChange={(e) => setWantContact(e.target.checked)} /> Add contact details for follow-up (optional)</label>
              {wantContact && (
                <div className="mt-2 grid gap-2 border-l border-line pl-3">
                  <input className={inputCls} placeholder="Phone or email" value={contact.value} onChange={(e) => setContact({ ...contact, value: e.target.value })} />
                  <label className="flex items-start gap-2 text-[12.5px] text-muted"><input type="checkbox" className="mt-0.5" checked={contact.consent} onChange={(e) => setContact({ ...contact, consent: e.target.checked })} /> I consent to this contact being stored only to verify this report. It is not shown on the public map.</label>
                </div>
              )}
            </div>
          </fieldset>
          {errors.length > 0 && <div className="mt-3"><Notice tone="crit"><ul className="list-disc pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul></Notice></div>}
          <div className="mt-4 flex justify-end gap-2">
            <Button icon={<Eye size={14} />} disabled={!canReport} onClick={doPreview}>Preview</Button>
            <Button variant="primary" icon={<Send size={14} />} disabled={!canReport || busy} title={canReport ? undefined : `Not permitted for ${ROLE_LABEL[state.role]}`} onClick={() => { const e = validateReport(state, input()); setErrors(e); if (!e.length) submit(); }}>{busy ? 'Submitting…' : 'Submit report'}</Button>
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-4 xl:border-l xl:border-line xl:pl-5">
          <section className="min-w-0"><div className="mb-2 flex flex-wrap items-center gap-1.5"><h2 className="mr-auto text-[14px] font-semibold">Reports <span className="num text-muted">({rows.length})</span></h2>
              <input aria-label="Search reports" placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className={cx(inputCls, 'h-8 w-32')} />
              <Select ariaLabel="Category" className="h-8 w-36" value={cat} onChange={setCat} options={[{ value: 'all', label: 'All categories' }, ...CATS.map((c) => ({ value: c, label: HAZARD_LABEL[c] }))]} />
              <Select ariaLabel="Status" className="h-8 w-32" value={st} onChange={setSt} options={[{ value: 'all', label: 'All statuses' }, ...(['unverified', 'verified', 'rejected', 'queued_offline'] as const).map((s) => ({ value: s, label: s.replace('_', ' ') }))]} />
              <Select ariaLabel="Source" className="h-8 w-36" value={src} onChange={setSrc} options={[{ value: 'all', label: 'All sources' }, ...SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))]} />
            </div>
            <Table rows={rows} cols={cols} rowKey={(r) => r.id} onRow={(r) => setSel(r.id)} selected={sel ?? undefined} empty="No reports match the filters." />
          </section>
          {selR && (
            <Panel title={<span className="flex items-center gap-2"><Mono>{selR.id}</Mono> {HAZARD_LABEL[selR.category]}</span>} actions={assessments.get(selR.segmentId) && <StatusChip status={assessments.get(selR.segmentId)!.status} />}>
              <KV items={[
                ['Segment', <span><Mono>{selR.segmentId}</Mono>{selR.submittedSegmentRef.toUpperCase() !== selR.segmentId && <span className="text-warn"> (submitted as {selR.submittedSegmentRef})</span>}</span>],
                ['Claim', `${selR.condition} · severity ${selR.severity}`],
                ['Description', selR.description],
                ['Source', `${SOURCE_LABEL[selR.sourceType]} — ${selR.sourceName}`],
                ['Observed / submitted', `${fmtTime(selR.observedAt)} / ${fmtTime(selR.submittedAt)}`],
                ['Vehicle access', selR.vehicleAccess.replace(/_/g, ' ')],
                ['Water level', selR.waterLevelCm !== undefined ? `${selR.waterLevelCm} cm` : '—'],
                ['Image', selR.image ? `${selR.image.name} (${selR.image.sizeKb} KB) — ${selR.image.note}` : '—'],
                ['Contact', selR.contact ? (state.role === 'observer' ? 'Restricted' : 'Provided with consent (hidden)') : '—'],
                ['Linked evidence', selEv ? <span><Mono>{selEv.id}</Mono> · {selEv.verification}{selEv.legacyIdMatch ? ` · legacy ID ${selEv.legacyIdMatch}` : ''}</span> : 'Not yet applied (queued)'],
                ['Origin', selR.origin],
              ]} />
              {selR.image?.dataUrl && <img src={selR.image.dataUrl} alt={`Attachment for ${selR.id}`} className="mt-3 max-h-48 border border-line" />}
            </Panel>
          )}
        </div>
      </div>

      <Modal open={preview} onClose={() => setPreview(false)} title="Preview report" wide footer={<><Button onClick={() => setPreview(false)}>Edit</Button><Button variant="primary" disabled={busy} onClick={submit}>{busy ? 'Submitting…' : state.offline.online ? 'Submit report' : 'Queue report'}</Button></>}>
        <KV items={[
          ['Category', HAZARD_LABEL[preview_.category]],
          ['Segment reference', <Mono>{preview_.segmentRef}</Mono>],
          ['Condition', preview_.condition],
          ['Description', preview_.description],
          ['Observed at', fmtTime(preview_.observedAt)],
          ['Severity', preview_.severity],
          ['Source', `${SOURCE_LABEL[preview_.sourceType]} — ${preview_.sourceName}`],
          ['Vehicle access', preview_.vehicleAccess.replace(/_/g, ' ')],
          ['Water level', preview_.waterLevelCm !== undefined ? `${preview_.waterLevelCm} cm` : '—'],
          ['Image', preview_.image ? `${preview_.image.name} (${preview_.image.sizeKb} KB)` : '—'],
          ['Contact', preview_.contact ? 'Included (with consent)' : 'None'],
        ]} />
        <div className="mt-3"><Notice tone="warn">This report will be stored as <b>unverified</b> evidence{preview_.sourceType === 'public_anonymous' ? ' from an anonymous source' : ''}. It cannot confirm a road as passable or blocked until verified.</Notice></div>
      </Modal>
      <Toast msg={toast} onDone={() => setToast(null)} />
    </div>
  );
}
