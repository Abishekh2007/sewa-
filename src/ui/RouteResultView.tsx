import type { ReactNode } from 'react';
import type { RouteResult } from '../types';
import { MODE_LABEL, VEHICLE_LABEL } from '../types';
import { fmtAge } from '../engine/evidence';
import { useStore } from '../state/store';
import { cx, Mono, StatusChip } from './kit';

const H = ({ children }: { children: ReactNode }) => <h4 className="mb-1.5 text-[13px] font-semibold text-ink">{children}</h4>;

export function RouteResultView({ result, altIndex = 0, onAltIndex }: { result: RouteResult; altIndex?: number; onAltIndex?: (i: number) => void }) {
  const { state, assessments } = useStore();
  const jn = (id: string) => state.junctions.find((j) => j.id === id)?.name ?? id;
  const sn = (id: string) => state.segments.find((s) => s.id === id)?.name ?? id;
  const paths = result.best ? [result.best, ...result.alternatives] : [];
  const p = paths[altIndex] ?? result.best;

  return (
    <div className="space-y-4 border-t border-line pt-3 text-[13px]">
      <div className="flex flex-wrap items-baseline gap-x-2 text-muted">
        <span className="font-medium text-ink">{jn(result.from)} → {jn(result.to)}</span>
        <span className="text-[12px]">{MODE_LABEL[result.mode]} · {VEHICLE_LABEL[result.vehicle]}</span>
        <span className="ml-auto font-mono text-[11px] text-faint">{result.computeMs} ms</span>
      </div>

      {result.found && p ? (
        <>
          <dl className="grid grid-cols-4 gap-3">
            {([
              ['Length', `${p.lengthKm} km`],
              ['Est. time', `${p.estMinutes} min`],
              ['Uncertain', String(p.uncertainSegments.length)],
              ['Blocked avoided', String(result.blockedAvoided.length)],
            ] as const).map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11.5px] text-muted">{k}</dt>
                <dd className="num text-[16px] font-semibold text-ink">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[11.5px] text-muted">Time is an estimate from simulated configured road speeds. Evidence age along route: newest {fmtAge(p.newestEvidenceMin)}, oldest {fmtAge(p.oldestEvidenceMin)}.</p>

          <div>
            <H>Itinerary</H>
            <ol className="relative ml-1.5 border-l border-line-strong">
              {p.segments.map((id, i) => {
                const a = assessments.get(id)!;
                return (
                  <li key={id} className="relative py-1.5 pl-4">
                    <span className="absolute -left-[4px] top-[13px] h-[7px] w-[7px] rounded-full bg-line-strong" aria-hidden />
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className="num w-4 text-[11px] text-faint">{i + 1}</span>
                      <Mono>{id}</Mono>
                      <span className="min-w-0 flex-1 truncate">{sn(id)}</span>
                      <StatusChip status={a.status} compact />
                      <span className="num w-14 text-right text-[11.5px] text-muted">{fmtAge(a.latestAgeMin)}</span>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          {p.restrictions.length > 0 && (
            <div>
              <H>Restrictions on route</H>
              <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-muted">{p.restrictions.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}

          {paths.length > 1 && (
            <div>
              <H>Options</H>
              <div role="radiogroup" aria-label="Route options" className="divide-y divide-line border-y border-line">
                {paths.map((x, i) => (
                  <button
                    key={i}
                    role="radio"
                    aria-checked={i === altIndex}
                    onClick={() => onAltIndex?.(i)}
                    className={cx('flex min-h-8 w-full items-center gap-3 border-l-2 px-2 py-1.5 text-left text-[12.5px] hover:bg-surface-2', i === altIndex ? 'border-accent bg-surface-2 text-ink' : 'border-transparent text-muted')}
                  >
                    <span className="flex-1">{i === 0 ? 'Recommended' : `Alternative ${i}`}</span>
                    <span className="num">{x.lengthKm} km</span>
                    <span className="num">{x.estMinutes} min</span>
                    <span className="num w-20 text-right">{x.uncertainSegments.length} uncertain</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div role="alert" className="border-l-2 border-crit bg-surface-2 px-3 py-2.5">
          <div className="text-[14px] font-semibold text-crit">NO ADEQUATELY VERIFIED ROUTE FOUND</div>
          <p className="mt-1 text-[12.5px] text-muted">No route is shown because none meets the {MODE_LABEL[result.mode].toLowerCase()} rules for this vehicle. The system does not invent a safe alternative.</p>
          {result.excluded.length > 0 && (
            <div className="mt-3">
              <H>Segments preventing access</H>
              <ul className="space-y-1 text-[12.5px]">
                {result.excluded.map((x) => (
                  <li key={x.segmentId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <Mono>{x.segmentId}</Mono> <span>{sn(x.segmentId)}</span> <StatusChip status={assessments.get(x.segmentId)!.status} compact /> <span className="text-muted">{x.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!result.found && result.lastMile.length > 0 && (
        <div>
          <H>Last mile: nearest reachable access points</H>
          <ul className="divide-y divide-line border-y border-line">
            {result.lastMile.map((o) => (
              <li key={o.nodeId} className="py-2">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium">{jn(o.nodeId)}</span>
                  <Mono className="text-muted">{o.nodeId}</Mono>
                  <span className="num ml-auto text-[12px]">{o.remainingKm} km to destination (straight-line)</span>
                </div>
                <div className="mt-1 text-[12.5px] text-muted">{o.evidenceSummary} Access route {o.path.lengthKm} km, ~{o.path.estMinutes} min est.</div>
                {o.blockingSegments.length > 0 && (
                  <div className="mt-1 text-[12px] text-muted">Further access prevented by: {o.blockingSegments.map((b) => `${b.segmentId} (${b.reason})`).join('; ')}</div>
                )}
                <div className="mt-1 text-[12px] font-medium text-warn">Requires human confirmation before operational use. Not labelled safe.</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <H>Explanation</H>
        <ul className="list-disc space-y-0.5 pl-4 text-[12.5px] text-muted">{result.explanation.map((e, i) => <li key={i}>{e}</li>)}</ul>
      </div>
      <p className="border-t border-line pt-2 text-[11.5px] text-faint">
        Decision support only. Never drive or wade through floodwater. Qualified emergency professionals remain responsible for operational decisions.
      </p>
    </div>
  );
}
