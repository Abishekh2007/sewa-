// Interactive SVG map of the fictional Sector R-7 road network (no real geography).
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import type { RouteResult, SegmentStatus } from '../types';
import { INCIDENT_LABEL } from '../types';
import { STATUS_LABEL } from '../engine/evidence';
import { useStore } from '../state/store';
import { cx, STATUS_STYLE } from './kit';

const VB = { x: 0, y: 40, w: 1060, h: 560 };

export interface NetworkMapProps {
  route?: RouteResult | null;
  altIndex?: number;
  selectedSegment?: string | null;
  selectedNode?: string | null;
  onSelectSegment?: (id: string) => void;
  onSelectNode?: (id: string) => void;
  height?: number | string;
  showIncidents?: boolean;
  highlightSegments?: string[];
}

type Layer = 'labels' | 'incidents' | 'sensors' | 'meeting';

export function NetworkMap({ route, altIndex = 0, selectedSegment, selectedNode, onSelectSegment, onSelectNode, height = 520, showIncidents = true, highlightSegments }: NetworkMapProps) {
  const { state, assessments } = useStore();
  const [vb, setVb] = useState(VB);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ labels: true, incidents: showIncidents, sensors: true, meeting: true });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vb: typeof VB; moved: boolean } | null>(null);
  const jMap = useMemo(() => new Map(state.junctions.map((j) => [j.id, j])), [state.junctions]);
  const observer = state.role === 'observer';

  const path = route?.found ? (altIndex > 0 ? route.alternatives[altIndex - 1] : route.best) : undefined;
  const routeSegs = new Set(path?.segments ?? []);
  const meetingNode = route && !route.found ? route.lastMile[0]?.nodeId : undefined;
  const hl = new Set(highlightSegments ?? []);
  const excluded = new Set(route && !route.found ? route.excluded.map((e) => e.segmentId) : []);

  const zoom = (f: number, cx0?: number, cy0?: number) =>
    setVb((v) => {
      const w = Math.min(VB.w * 1.5, Math.max(200, v.w * f));
      const h = (w / v.w) * v.h;
      const px = cx0 ?? v.x + v.w / 2;
      const py = cy0 ?? v.y + v.h / 2;
      return { x: px - ((px - v.x) * w) / v.w, y: py - ((py - v.y) * h) / v.h, w, h };
    });

  const toSvg = (clientX: number, clientY: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: vb.x + ((clientX - r.left) / r.width) * vb.w, y: vb.y + ((clientY - r.top) / r.height) * vb.h };
  };
  const onWheel = (e: RWheelEvent) => {
    const p = toSvg(e.clientX, e.clientY);
    zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  };
  const onDown = (e: RPointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, vb, moved: false };
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const r = svgRef.current!.getBoundingClientRect();
    const dx = ((e.clientX - d.x) / r.width) * d.vb.w;
    const dy = ((e.clientY - d.y) / r.height) * d.vb.h;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) setVb({ ...d.vb, x: d.vb.x - dx, y: d.vb.y - dy });
  };
  const onUp = () => { setTimeout(() => (drag.current = null), 0); };
  const clickable = () => !drag.current?.moved;

  const nodeShape = (kind: string, x: number, y: number, sel: boolean) => {
    const stroke = sel ? 'var(--color-accent)' : 'var(--color-ink)';
    const sw = sel ? 2.5 : 1.25;
    const fill = 'var(--color-surface)';
    switch (kind) {
      case 'hospital':
        return <g><rect x={x - 11} y={y - 11} width={22} height={22} fill={fill} stroke={stroke} strokeWidth={sw} /><path d={`M${x - 6} ${y}h12M${x} ${y - 6}v12`} stroke="var(--color-crit)" strokeWidth={3} /></g>;
      case 'station':
        return <g><rect x={x - 11} y={y - 11} width={22} height={22} fill={fill} stroke={stroke} strokeWidth={sw} /><text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--color-accent)" fontFamily="var(--font-mono)">ER</text></g>;
      case 'shelter':
        return <path d={`M${x} ${y - 12}L${x + 12} ${y + 9}H${x - 12}Z`} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case 'residential':
      case 'school':
      case 'depot':
        return <rect x={x - 6} y={y - 6} width={12} height={12} fill={fill} stroke={stroke} strokeWidth={sw} />;
      default:
        return <circle cx={x} cy={y} r={5} fill={fill} stroke={stroke} strokeWidth={sw} />;
    }
  };

  const legend: SegmentStatus[] = ['VERIFIED_PASSABLE', 'POTENTIAL_HAZARD', 'BLOCKED', 'UNKNOWN', 'STALE_EVIDENCE', 'CONFLICTING_EVIDENCE'];

  return (
    <div className="relative flex min-w-0 flex-col border border-line bg-bg" style={{ height }}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface px-2.5 py-1.5 text-[12px]">
        {(['labels', 'incidents', 'sensors', 'meeting'] as Layer[]).map((l) => (
          <label key={l} className="flex cursor-pointer items-center gap-1.5 text-muted">
            <input type="checkbox" checked={layers[l]} onChange={(e) => setLayers({ ...layers, [l]: e.target.checked })} className="accent-[var(--color-accent)]" />
            {l === 'meeting' ? 'Meeting points' : l[0].toUpperCase() + l.slice(1)}
          </label>
        ))}
        <div className="ml-auto flex items-center gap-1">
          <button aria-label="Zoom in" onClick={() => zoom(1 / 1.3)} className="grid h-6 w-6 place-items-center border border-line-strong text-muted hover:text-ink"><Plus size={13} /></button>
          <button aria-label="Zoom out" onClick={() => zoom(1.3)} className="grid h-6 w-6 place-items-center border border-line-strong text-muted hover:text-ink"><Minus size={13} /></button>
          <button aria-label="Reset view" onClick={() => setVb(VB)} className="grid h-6 w-6 place-items-center border border-line-strong text-muted hover:text-ink"><RotateCcw size={12} /></button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        <svg
          ref={svgRef}
          role="img"
          aria-label="Simulated road network map of fictional Sector R-7"
          viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
          className="h-full w-full touch-none select-none"
          style={{ cursor: drag.current?.moved ? 'grabbing' : 'grab' }}
          onWheel={onWheel}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
        >
          <defs>
            <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M50 0H0V50" fill="none" stroke="var(--color-line)" strokeWidth={0.5} opacity={0.5} />
            </pattern>
          </defs>
          <rect x={-600} y={-600} width={2300} height={1900} fill="var(--color-land)" />
          {/* River (fictional) */}
          <path d="M470 20 C 500 140, 470 220, 495 300 S 510 470, 498 640" fill="none" stroke="var(--color-water)" strokeWidth={56} strokeLinecap="round" />
          <text x={505} y={200} fontSize={11} fill="var(--color-accent)" opacity={0.55} transform="rotate(80 505 200)" fontStyle="italic">River (fictional)</text>

          {/* Segments */}
          {state.segments.map((s) => {
            const a = jMap.get(s.from)!;
            const b = jMap.get(s.to)!;
            const as = assessments.get(s.id)!;
            const st = STATUS_STYLE[as.status];
            const sel = selectedSegment === s.id;
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const onRoute = routeSegs.has(s.id);
            return (
              <g
                key={s.id}
                role="button"
                tabIndex={0}
                aria-label={`${s.id} ${s.name}: ${STATUS_LABEL[as.status]}`}
                className="cursor-pointer focus:outline-none"
                onClick={() => clickable() && onSelectSegment?.(s.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectSegment?.(s.id); } }}
              >
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={18} />
                {(sel || hl.has(s.id)) && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-ink)" strokeOpacity={0.25} strokeWidth={14} strokeLinecap="round" />}
                {onRoute && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-accent)" strokeWidth={11} strokeLinecap="round" strokeOpacity={0.55} />}
                {excluded.has(s.id) && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-crit)" strokeWidth={12} strokeOpacity={0.18} />}
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-bg)" strokeWidth={s.roadType === 'arterial' || s.roadType === 'bridge' ? 9 : 6.5} strokeLinecap="round" />
                <line
                  x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                  stroke={st.color}
                  strokeOpacity={as.status === 'VERIFIED_PASSABLE' ? 0.75 : 1}
                  strokeWidth={s.roadType === 'arterial' || s.roadType === 'bridge' ? 5 : s.roadType === 'track' ? 2.5 : 3.5}
                  strokeDasharray={st.dash}
                  strokeLinecap="butt"
                />
                {as.status === 'BLOCKED' && (
                  <g>
                    <rect x={mx - 8} y={my - 8} width={16} height={16} fill="var(--color-bg)" stroke="var(--color-crit)" strokeWidth={1.5} />
                    <path d={`M${mx - 4} ${my - 4}L${mx + 4} ${my + 4}M${mx + 4} ${my - 4}L${mx - 4} ${my + 4}`} stroke="var(--color-crit)" strokeWidth={2} />
                  </g>
                )}
                {as.status === 'CONFLICTING_EVIDENCE' && <text x={mx} y={my + 4} textAnchor="middle" fontSize={12} fill="var(--color-conf)">◆</text>}
                {as.status === 'POTENTIAL_HAZARD' && <text x={mx} y={my + 4} textAnchor="middle" fontSize={12} fill="var(--color-warn)">▲</text>}
                {layers.labels && (sel || onRoute || hl.has(s.id) || as.status !== 'VERIFIED_PASSABLE' || vb.w < 700) && (
                  <text x={mx} y={my - 9} textAnchor="middle" fontSize={9.5} fontFamily="var(--font-mono)" fill={sel ? 'var(--color-ink)' : 'var(--color-faint)'} paintOrder="stroke" stroke="var(--color-bg)" strokeWidth={3}>
                    {s.id}
                  </text>
                )}
              </g>
            );
          })}

          {/* Junctions */}
          {state.junctions.map((j) => {
            const sel = selectedNode === j.id;
            const isMeet = meetingNode === j.id;
            return (
              <g
                key={j.id}
                role="button"
                tabIndex={0}
                aria-label={`${j.id} ${j.name}${j.meetingPoint ? ', candidate meeting point' : ''}`}
                className="cursor-pointer focus:outline-none"
                onClick={() => clickable() && onSelectNode?.(j.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') onSelectNode?.(j.id); }}
              >
                {isMeet && <circle cx={j.x} cy={j.y} r={20} fill="none" stroke="var(--color-ok)" strokeWidth={2} strokeDasharray="4 3" />}
                {layers.meeting && j.meetingPoint && <circle cx={j.x} cy={j.y} r={13} fill="none" stroke="var(--color-ok)" strokeOpacity={0.6} strokeWidth={1} />}
                {nodeShape(j.kind, j.x, j.y, sel)}
                {route && (route.from === j.id || route.to === j.id) && (
                  <text x={j.x - 14} y={j.y - 14} fontSize={10} fontWeight={600} fill="var(--color-accent)" fontFamily="var(--font-mono)">{route.from === j.id ? 'A' : 'B'}</text>
                )}
                {layers.labels && (j.kind !== 'junction' || sel) && (
                  <text x={j.x} y={j.y + 24} textAnchor="middle" fontSize={10.5} fill="var(--color-muted)" paintOrder="stroke" stroke="var(--color-bg)" strokeWidth={3}>{j.name}</text>
                )}
              </g>
            );
          })}

          {/* Sensors */}
          {layers.sensors && state.sensors.map((sn) => {
            const seg = state.segments.find((s) => s.id === sn.segmentId);
            if (!seg) return null;
            const a = jMap.get(seg.from)!, b = jMap.get(seg.to)!;
            const x = a.x + (b.x - a.x) * 0.3 + 12, y = a.y + (b.y - a.y) * 0.3 + 12;
            const last = state.readings.filter((r) => r.sensorId === sn.id).at(-1);
            const c = !sn.connected ? 'var(--color-unk)' : last?.flag === 'critical' ? 'var(--color-crit)' : last?.flag === 'warn' ? 'var(--color-warn)' : 'var(--color-accent)';
            return (
              <g key={sn.id} aria-label={`Sensor ${sn.id} ${sn.connected ? '' : 'disconnected'}`}>
                <title>{`${sn.id} ${sn.name} (simulated) — ${sn.connected ? `${last?.valueCm ?? '—'} cm` : 'disconnected'}`}</title>
                <path d={`M${x} ${y - 7}L${x + 6} ${y + 5}H${x - 6}Z`} fill="var(--color-bg)" stroke={c} strokeWidth={1.5} />
                <text x={x + 9} y={y + 4} fontSize={9} fontFamily="var(--font-mono)" fill={c}>{sn.id}</text>
              </g>
            );
          })}

          {/* Incidents */}
          {layers.incidents && state.incidents.filter((i) => i.status !== 'Closed' && i.status !== 'Resolved').map((inc, k) => {
            const j = jMap.get(inc.nodeId);
            if (!j) return null;
            const x = j.x + 14 + (k % 2) * 4, y = j.y - 16;
            return (
              <g key={inc.id}>
                <title>{observer ? 'Active incident (details restricted)' : `${inc.id} ${INCIDENT_LABEL[inc.category]} · ${inc.priority} · ${inc.status} (simulated)`}</title>
                <path d={`M${x} ${y - 9}L${x + 9} ${y}L${x} ${y + 9}L${x - 9} ${y}Z`} fill="var(--color-crit)" fillOpacity={0.9} stroke="var(--color-bg)" strokeWidth={1.5} />
                <text x={x} y={y + 3.5} textAnchor="middle" fontSize={9} fontWeight={700} fill="#fff">!</text>
                {!observer && layers.labels && <text x={x + 12} y={y + 3} fontSize={9.5} fontFamily="var(--font-mono)" fill="var(--color-crit)" paintOrder="stroke" stroke="var(--color-bg)" strokeWidth={3}>{inc.id}</text>}
              </g>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute left-3 top-2 text-[11.5px] text-faint">
          Simulated network · fictional Sector R-7 · not a real map
        </div>
        <div className="absolute bottom-2 left-2 border border-line bg-surface/95 px-2.5 py-2 text-[11px]">
          <div className="label-caps mb-1 text-[10px]">Road status</div>
          <ul className="grid grid-cols-2 gap-x-3 gap-y-0.5">
            {legend.map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <svg width="22" height="8" aria-hidden><line x1="0" y1="4" x2="22" y2="4" stroke={STATUS_STYLE[s].color} strokeWidth={3} strokeDasharray={STATUS_STYLE[s].dash} /></svg>
                <span style={{ color: STATUS_STYLE[s].color }}>{STATUS_STYLE[s].glyph}</span>
                <span className="text-muted">{STATUS_LABEL[s]}</span>
              </li>
            ))}
          </ul>
          <div className={cx('mt-1.5 flex flex-wrap gap-x-3 text-faint')}>
            <span><span className="text-accent">━</span> Route</span>
            <span><span className="text-ok">◯</span> Meeting point</span>
            <span><span className="text-crit">◆</span> Incident</span>
            <span><span className="text-accent">△</span> Sensor</span>
          </div>
        </div>
      </div>
    </div>
  );
}
