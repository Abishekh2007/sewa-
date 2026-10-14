import { useMemo, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useStore } from '../state/store';
import { addSensorReading, audit, can, sensorHealth, setSensorConnected, simulateSensorStep } from '../engine/actions';
import type { SensorDevice } from '../types';
import { Button, Field, fmtClock, fmtTime, inputCls, KV, Mono, Notice, PageHeader, Panel, Select, StatusChip, Table, Tag, Toast } from '../ui/kit';

export default function Sensors() {
  const { state, assessments, update } = useStore();
  const [sel, setSel] = useState(state.sensors[0]?.id ?? '');
  const [manual, setManual] = useState('');
  const [manualErr, setManualErr] = useState('');
  const [toast, setToast] = useState<{ text: string; tone?: 'ok' | 'crit' } | null>(null);
  const allowed = can(state.role, 'sensor');
  const denied = allowed ? undefined : 'Your demo role cannot operate sensors';
  const sensor = state.sensors.find((s) => s.id === sel);
  const readings = useMemo(() => state.readings.filter((r) => r.sensorId === sel), [state.readings, sel]);

  const submitManual = () => {
    const v = Number(manual);
    if (manual.trim() === '' || !isFinite(v)) return setManualErr('Enter a numeric value in cm.');
    setManualErr('');
    update((s) => addSensorReading(s, sel, v));
    setManual('');
    setToast({ text: `Reading ${v} cm recorded for ${sel} (simulated feed).` });
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Sensors"
        desc="Water-level sensor adapter. All feeds in this build are simulated; no physical hardware is connected."
      />
      <Notice tone="warn">
        A water-level reading alone does not establish passability. Readings depend on sensor placement, calibration, road geometry and vehicle type. Alerts open a verification task; they never mark a road passable or blocked on their own.
      </Notice>

      <Panel title="Registered sensors" bodyClass="p-0">
        <Table
          rows={state.sensors}
          rowKey={(s) => s.id}
          selected={sel}
          onRow={(s) => setSel(s.id)}
          cols={[
            { key: 'id', header: 'ID', cell: (s) => <Mono>{s.id}</Mono> },
            { key: 'name', header: 'Name', cell: (s) => s.name },
            { key: 'seg', header: 'Segment', cell: (s) => <span className="flex items-center gap-2"><Mono>{s.segmentId}</Mono>{assessments.get(s.segmentId) && <StatusChip compact status={assessments.get(s.segmentId)!.status} />}</span> },
            { key: 'thr', header: 'Warn / critical', cell: (s) => <Mono>{s.warnCm} / {s.criticalCm} cm</Mono> },
            { key: 'health', header: 'Health', cell: (s) => <HealthTag s={s} /> },
            {
              key: 'last', header: 'Last reading', cell: (s) => {
                const h = sensorHealth(state, s.id);
                const last = state.readings.filter((r) => r.sensorId === s.id).at(-1);
                return last ? <span><Mono>{last.valueCm} cm</Mono> <span className="text-faint">· {h.lastAt ? fmtClock(h.lastAt) : ''}</span></span> : <span className="text-faint">none</span>;
              },
            },
            { key: 'hw', header: 'Hardware', cell: (s) => <Tag tone="sim">{s.hardware}</Tag> },
          ]}
        />
      </Panel>

      {sensor && (
        <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
          <Panel title={`${sensor.id} · ${sensor.name}`} sub={`Segment ${sensor.segmentId} · readings labelled "simulated feed"`}>
            <div className="h-56">
              {readings.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={readings.map((r) => ({ t: fmtClock(r.at), v: r.valueCm }))} margin={{ top: 8, right: 16, bottom: 0, left: -12 }}>
                    <CartesianGrid stroke="var(--color-line)" strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="t" tick={{ fill: 'var(--color-muted)', fontSize: 11 }} stroke="var(--color-line)" />
                    <YAxis tick={{ fill: 'var(--color-muted)', fontSize: 11 }} stroke="var(--color-line)" unit=" cm" width={64} />
                    <Tooltip contentStyle={{ background: 'var(--color-raised)', border: '1px solid var(--color-line-strong)', fontSize: 12 }} />
                    <ReferenceLine y={sensor.warnCm} stroke="var(--color-warn)" strokeDasharray="4 4" label={{ value: 'warn', fill: 'var(--color-warn)', fontSize: 11, position: 'insideTopRight' }} />
                    <ReferenceLine y={sensor.criticalCm} stroke="var(--color-crit)" strokeDasharray="4 4" label={{ value: 'critical', fill: 'var(--color-crit)', fontSize: 11, position: 'insideTopRight' }} />
                    <Line type="monotone" dataKey="v" stroke="var(--color-accent)" strokeWidth={1.5} dot={{ r: 2 }} isAnimationActive={false} name="Water level" />
                  </LineChart>
                </ResponsiveContainer>
              ) : <div className="grid h-full place-items-center text-muted">No readings yet.</div>}
            </div>
            <div className="mt-3 max-h-64 overflow-y-auto border-t border-line">
              <Table
                rows={[...readings].reverse()}
                rowKey={(r) => r.id}
                cols={[
                  { key: 'id', header: 'Reading', cell: (r) => <Mono>{r.id}</Mono> },
                  { key: 'at', header: 'Sim time', cell: (r) => fmtTime(r.at) },
                  { key: 'v', header: 'Value', cell: (r) => <Mono>{r.valueCm} cm</Mono> },
                  { key: 'f', header: 'Flag', cell: (r) => <Tag tone={r.flag === 'ok' ? 'ok' : r.flag === 'warn' ? 'warn' : 'crit'}>{r.flag.replace('_', ' ')}</Tag> },
                  { key: 'o', header: 'Origin', cell: () => <span className="text-faint">simulated feed</span> },
                ]}
              />
            </div>
          </Panel>

          <div className="space-y-4">
            <Panel title="Controls">
              <div className="space-y-3">
                <Button variant="primary" className="w-full" disabled={!allowed || !sensor.connected} title={denied ?? (!sensor.connected ? 'Sensor disconnected' : undefined)}
                  onClick={() => { update((s) => simulateSensorStep(s, sensor.id)); setToast({ text: `Deterministic simulated reading generated for ${sensor.id}.` }); }}>
                  Simulate next reading
                </Button>
                <div className="flex items-end gap-2">
                  <Field label="Manual reading (cm)" error={manualErr}>
                    <input className={inputCls} inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} disabled={!allowed || !sensor.connected} placeholder="e.g. 32" />
                  </Field>
                  <Button onClick={submitManual} disabled={!allowed || !sensor.connected} title={denied}>Record</Button>
                </div>
                <Button className="w-full" variant={sensor.connected ? 'danger' : 'secondary'} disabled={!allowed} title={denied}
                  onClick={() => update((s) => setSensorConnected(s, sensor.id, !sensor.connected))}>
                  {sensor.connected ? 'Simulate disconnection' : 'Reconnect sensor'}
                </Button>
              </div>
            </Panel>
            <Panel title="Calibration & thresholds">
              <KV items={[
                ['Warn', `${sensor.warnCm} cm`],
                ['Critical', `${sensor.criticalCm} cm`],
                ['Plausible max', `${sensor.maxPlausibleCm} cm`],
                ['Interval', `${sensor.expectedIntervalMin} min`],
                ['Calibration', sensor.calibrationNote],
              ]} />
            </Panel>
          </div>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        <RegisterSensor disabled={!allowed} />
        <Panel title="ESP32 adapter (future hardware)" sub="Not connected in this build">
          <p className="text-[13px] text-muted">A future ESP32 node with a water-level sensor would POST readings over Wi-Fi (or serial bridge) to the adapter. Expected payload:</p>
          <pre className="mt-2 overflow-x-auto border border-line bg-bg p-3 font-mono text-[12.5px]">{`{
  "sensorId": "WL-01",
  "valueCm": 34.5,
  "ts": "2026-10-14T08:45:00+05:30"
}`}</pre>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-[13px] text-muted">
            <li>Readings outside 0–max plausible are flagged out-of-range and ignored.</li>
            <li>Missing data is flagged when no reading arrives within 3× the expected interval.</li>
            <li>Hardware readings would carry origin <Mono>esp32</Mono>; simulated readings are always labelled <Mono>sensor-sim</Mono>.</li>
          </ul>
        </Panel>
      </div>
      <Toast msg={toast} onDone={() => setToast(null)} />
    </div>
  );

  function HealthTag({ s }: { s: SensorDevice }) {
    const h = sensorHealth(state, s.id);
    return h.state === 'ok' ? <Tag tone="ok">● reporting</Tag> : h.state === 'disconnected' ? <Tag tone="crit">■ disconnected</Tag> : <Tag tone="warn">▲ missing data</Tag>;
  }
}

function RegisterSensor({ disabled }: { disabled: boolean }) {
  const { state, update } = useStore();
  const [f, setF] = useState({ id: '', name: '', segmentId: state.segments[0].id, warn: '30', critical: '50' });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const submit = () => {
    const id = f.id.trim().toUpperCase();
    const warn = Number(f.warn), critical = Number(f.critical);
    if (!/^[A-Z0-9-]{3,12}$/.test(id)) return setErr('ID must be 3–12 letters, digits or dashes.');
    if (state.sensors.some((s) => s.id === id)) return setErr(`Sensor ${id} already exists.`);
    if (!f.name.trim()) return setErr('Name is required.');
    if (!(warn > 0 && critical > warn)) return setErr('Thresholds must be positive and critical > warn.');
    setErr('');
    update((s) => {
      const n = structuredClone(s);
      n.sensors.push({ id, name: f.name.trim(), segmentId: f.segmentId, kind: 'water_level', warnCm: warn, criticalCm: critical, maxPlausibleCm: 300, expectedIntervalMin: 15, connected: true, hardware: 'simulated', calibrationNote: 'Registered in demo; calibration not performed.' });
      audit(n, 'system', id, `Sensor ${id} registered on ${f.segmentId} (simulated)`);
      return n;
    });
    setOk(`Sensor ${id} registered.`);
    setF({ ...f, id: '', name: '' });
  };
  return (
    <Panel title="Register sensor">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Sensor ID" required><input className={inputCls} value={f.id} onChange={(e) => setF({ ...f, id: e.target.value })} placeholder="WL-04" disabled={disabled} /></Field>
        <Field label="Name" required><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Culvert gauge" disabled={disabled} /></Field>
        <Field label="Road segment">
          <Select value={f.segmentId} onChange={(v) => setF({ ...f, segmentId: v })} options={state.segments.map((s) => ({ value: s.id, label: `${s.id} ${s.name}` }))} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Warn cm"><input className={inputCls} value={f.warn} onChange={(e) => setF({ ...f, warn: e.target.value })} disabled={disabled} /></Field>
          <Field label="Critical cm"><input className={inputCls} value={f.critical} onChange={(e) => setF({ ...f, critical: e.target.value })} disabled={disabled} /></Field>
        </div>
      </div>
      {err && <p className="mt-2 text-[12.5px] text-crit">{err}</p>}
      {ok && !err && <p className="mt-2 text-[12.5px] text-ok">{ok}</p>}
      <div className="mt-3"><Button variant="primary" onClick={submit} disabled={disabled} title={disabled ? 'Your demo role cannot register sensors' : undefined}>Register</Button></div>
    </Panel>
  );
}
