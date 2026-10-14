import type { RouteResult } from '../types';
import { MODE_LABEL, VEHICLE_LABEL } from '../types';
import { fmtAge } from '../engine/evidence';
import { useStore } from '../state/store';
import { cx, Mono, StatusChip, Tag } from './kit';

export function RouteResultView({ result, altIndex = 0, onAltIndex }: { result: RouteResult; altIndex?: number; onAltIndex?: (i: number) => void }) {
  const { state, assessments } = useStore();
  const jn = (id: string) => state.junctions.find((j) => j.id === id)?.name ?? id;
  const sn = (id: string) => state.segments.find((s) => s.id === id)?.name ?? id;
  const paths = result.best ? [result.best, ...result.alternatives] : [];
  const p = paths[altIndex] ?? result.best;

  return (
    <div className="space-y-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-1.5 text-muted">
        <Tag tone="accent">{MODE_LABEL[result.mode]}</Tag>
        <Tag>{VEHICLE_LABEL[result.vehicle]}</Tag>
        <span className="text-[12px]">{jn(result.from)} → {jn(result.to)}</span>
        <span className="ml-auto font-mono text-[11px] text-faint">{result.computeMs} ms</span>
      </div>

      {result.found && p ? (
        <>
          {paths.length > 1 && (
            <div className="flex flex-wrap gap-1" role="tablist" aria-label="Route options">
              {paths.map((x, i) => (
                <button
                  key={i}
                  role="tab"
                  aria-selected={i === altIndex}
                  onClick={() => onAltIndex?.(i)}
                  className={cx('border px-2 py-1 text-[12px]', i === altIndex ? 'border-accent text-ink' : 'border-line text-muted hover:text-ink')}
                >
                  {i === 0 ? 'Recommended' : `Alternative ${i}`} · <span className="font-mono">{x.lengthKm} km</span>
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-px border border-line bg-line sm:grid-cols-4">
            {[
              ['Length', `${p.lengthKm} km`],
              ['Est. time', `${p.estMinutes} min`],
              ['Blocked avoided', String(result.blockedAvoided.length)],
              ['Uncertain segs', String(p.uncertainSegments.length)],
            ].map(([k, v]) => (
              <div key={k} className="bg-surface px-2.5 py-2">
                <div className="label-caps text-[10px]">{k}</div>
                <div className={cx('font-mono text-[17px]', k === 'Uncertain segs' && p.uncertainSegments.length > 0 && 'text-warn')}>{v}</div>
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-faint">Time is an estimate from simulated configured road speeds. Evidence age along route: newest {fmtAge(p.newestEvidenceMin)}, oldest {fmtAge(p.oldestEvidenceMin)}.</p>
          <ol className="divide-y divide-line/60 border border-line">
            {p.segments.map((id, i) => (
              <li key={id} className="flex items-center gap-2 px-2.5 py-1.5">
                <span className="w-4 text-right font-mono text-[11px] text-faint">{i + 1}</span>
                <Mono>{id}</Mono>
                <span className="min-w-0 flex-1 truncate">{sn(id)}</span>
                <StatusChip status={assessments.get(id)!.status} compact />
              </li>
            ))}
          </ol>
          {p.restrictions.length > 0 && (
            <div>
              <div className="label-caps mb-1">Restrictions on route</div>
              <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-muted">{p.restrictions.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
        </>
      ) : (
        <div role="alert" className="border border-crit/60 bg-crit/8 p-3">
          <div className="font-mono text-[14px] font-semibold tracking-wide text-crit">NO ADEQUATELY VERIFIED ROUTE FOUND</div>
          <p className="mt-1 text-[12.5px] text-muted">No route is shown because none meets the {MODE_LABEL[result.mode].toLowerCase()} rules for this vehicle. The system does not invent a safe alternative.</p>
          {result.excluded.length > 0 && (
            <div className="mt-2.5">
              <div className="label-caps mb-1">Segments preventing access</div>
              <ul className="space-y-0.5 text-[12.5px]">
                {result.excluded.map((x) => (
                  <li key={x.segmentId} className="flex flex-wrap items-center gap-1.5">
                    <Mono>{x.segmentId}</Mono> <span>{sn(x.segmentId)}</span> <StatusChip status={assessments.get(x.segmentId)!.status} compact /> <span className="text-muted">— {x.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!result.found && result.lastMile.length > 0 && (
        <div>
          <div className="label-caps mb-1.5">Last-mile: nearest reachable access points</div>
          <ul className="space-y-2">
            {result.lastMile.map((o, i) => (
              <li key={o.nodeId} className={cx('border p-2.5', i === 0 ? 'border-ok/50' : 'border-line')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{jn(o.nodeId)}</span>
                  <Mono className="text-muted">{o.nodeId}</Mono>
                  <span className="ml-auto font-mono text-[12px]">{o.remainingKm} km to destination (straight-line)</span>
                </div>
                <div className="mt-1 text-[12.5px] text-muted">{o.evidenceSummary} Access route {o.path.lengthKm} km, ~{o.path.estMinutes} min est.</div>
                {o.blockingSegments.length > 0 && (
                  <div className="mt-1 text-[12px]">Further access prevented by: {o.blockingSegments.map((b) => `${b.segmentId} (${b.reason})`).join('; ')}</div>
                )}
                <div className="mt-1.5 text-[11.5px] font-medium text-warn">Requires human confirmation before operational use. Not labelled safe.</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <div className="label-caps mb-1">Explanation</div>
        <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-muted">{result.explanation.map((e, i) => <li key={i}>{e}</li>)}</ul>
      </div>
      <p className="border-t border-line pt-2 text-[11.5px] text-faint">
        Decision support only. Never drive or wade through floodwater. Qualified emergency professionals remain responsible for operational decisions.
      </p>
    </div>
  );
}
