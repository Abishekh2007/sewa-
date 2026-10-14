import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react';
import { useRoute, useStore } from '../state/store';
import { fmtAge, STATUS_LABEL, TIER_LABEL, trustTier } from '../engine/evidence';
import { can } from '../engine/actions';
import { HAZARD_LABEL, SOURCE_LABEL, VEHICLE_LABEL } from '../types';
import { Button, ConfidenceTag, Empty, fmtTime, KV, Mono, StatusChip, Tag } from './kit';

export function SegmentDetail({ segmentId }: { segmentId: string }) {
  const { state, assessments } = useStore();
  const [, , go] = useRoute();
  const [open, setOpen] = useState(true);
  const seg = state.segments.find((s) => s.id === segmentId);
  const a = assessments.get(segmentId);
  if (!seg || !a) return <Empty text="Select a road segment on the map or in the list." />;
  const j = (id: string) => state.junctions.find((x) => x.id === id)?.name ?? id;
  const evs = state.evidence.filter((e) => e.segmentId === seg.id).sort((x, y) => y.observedAt - x.observedAt);
  const sensors = state.sensors.filter((s) => s.segmentId === seg.id);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Mono className="text-muted">{seg.id}</Mono>
          <h3 className="text-[15px] font-semibold">{seg.name}</h3>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <StatusChip status={a.status} />
          <ConfidenceTag c={a.confidence} />
          {seg.floodProne && <Tag tone="warn">Flood-prone</Tag>}
        </div>
      </div>

      <KV
        items={[
          ['From → to', `${j(seg.from)} → ${j(seg.to)}`],
          ['Road type', seg.roadType],
          ['Length', <Mono key="l">{seg.lengthKm.toFixed(2)} km</Mono>],
          ['Configured speed', <Mono key="s">{seg.speedKmh} km/h (simulated)</Mono>],
          ['Vehicles', seg.allowedVehicles.map((v) => VEHICLE_LABEL[v]).join(', ')],
          ...(seg.restrictionNote ? [['Restriction', seg.restrictionNote] as [string, string]] : []),
          ...(a.vehicleLimits ? [['Evidence limit', a.vehicleLimits.map((v) => VEHICLE_LABEL[v]).join(', ')] as [string, string]] : []),
          ['Latest evidence', a.latest ? `${fmtTime(a.latest.observedAt)} · ${fmtAge(a.latestAgeMin)} ago · ${SOURCE_LABEL[a.latest.sourceType]}` : 'None on record'],
          ...(sensors.length ? [['Sensors', sensors.map((s) => `${s.id} (${s.connected ? 'connected' : 'disconnected'})`).join(', ')] as [string, string]] : []),
        ]}
      />

      {can(state.role, 'report') && (
        <Button size="sm" icon={<AlertTriangle size={13} />} onClick={() => go('hazards', { segment: seg.id })}>Report hazard on this segment</Button>
      )}

      <div className="border border-line">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-1.5 bg-surface-2 px-3 py-2 text-left text-[13px] font-semibold">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />} Why this status?
        </button>
        {open && (
          <div className="space-y-3 p-3">
            <ol className="list-decimal space-y-1 pl-4 text-[13px]">
              {a.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ol>
            {(a.duplicates.length > 0 || a.staleIds.length > 0) && (
              <div className="text-[12px] text-muted">
                {a.duplicates.length > 0 && <div>Duplicates: <Mono>{a.duplicates.join(', ')}</Mono></div>}
                {a.staleIds.length > 0 && <div>Expired: <Mono>{a.staleIds.join(', ')}</Mono></div>}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr className="border-b border-line">
                    {['ID', 'Claim', 'Source', 'Trust', 'Age', 'State', 'Origin'].map((h) => <th key={h} className="label-caps px-1.5 py-1 text-[10px]">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {evs.map((e) => {
                    const stale = a.staleIds.includes(e.id);
                    return (
                      <tr key={e.id} className="border-b border-line/50 last:border-0" style={{ opacity: stale || e.verification === 'rejected' ? 0.55 : 1 }}>
                        <td className="px-1.5 py-1"><Mono>{e.id}</Mono></td>
                        <td className="px-1.5 py-1">{e.condition}{e.category ? ` · ${HAZARD_LABEL[e.category]}` : ''}{e.waterLevelCm !== undefined ? ` · ${e.waterLevelCm} cm` : ''}</td>
                        <td className="px-1.5 py-1">{e.sourceName}</td>
                        <td className="px-1.5 py-1">{TIER_LABEL[trustTier(e)]}</td>
                        <td className="px-1.5 py-1 font-mono">{fmtAge((state.now - e.observedAt) / 60000)}{stale ? ' (expired)' : ''}</td>
                        <td className="px-1.5 py-1">{e.verification}</td>
                        <td className="px-1.5 py-1 text-faint">{e.origin}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!evs.length && <p className="py-2 text-[12px] text-muted">No observations. Unknown is not the same as passable.</p>}
            </div>
          </div>
        )}
      </div>

      <div>
        <div className="label-caps mb-1.5">Status history</div>
        <ol className="space-y-1.5 border-l border-line pl-3 text-[12.5px]">
          {[...seg.history].reverse().slice(0, 10).map((h, i) => (
            <li key={i}>
              <span className="font-mono text-faint">{fmtTime(h.at)}</span>{' '}
              {h.from ? `${STATUS_LABEL[h.from]} → ` : ''}<span className="font-medium">{STATUS_LABEL[h.to]}</span>
              <div className="text-[12px] text-muted">{h.reason}</div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
