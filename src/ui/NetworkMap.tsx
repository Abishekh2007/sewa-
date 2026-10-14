// Interactive cartographic SVG map of the fictional Sector R-7 road network (no real geography).
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type WheelEvent as RWheelEvent } from 'react';
import { ChevronDown, ChevronUp, Minus, Plus, RotateCcw } from 'lucide-react';
import type { RoadType, RouteResult, SegmentStatus } from '../types';
import { INCIDENT_LABEL } from '../types';
import { STATUS_LABEL } from '../engine/evidence';
import { useStore } from '../state/store';
import { cx, STATUS_STYLE } from './kit';

const VB = { x: 0, y: 40, w: 1060, h: 560 };
const UNITS_PER_KM = 100;

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
const LAYER_LABEL: Record<Layer, string> = { labels: 'Labels', incidents: 'Incidents', sensors: 'Sensors', meeting: 'Meeting points' };

const ROAD_W: Record<RoadType, number> = { arterial: 6, bridge: 6, causeway: 5, collector: 4.5, hill: 3.6, local: 3.6, residential: 3.2, track: 2.2 };
const OK_ROAD = 'color-mix(in srgb, var(--color-ok) 55%, var(--color-muted))';

// Fictional terrain: river polygon (banks), built-up blocks and parks.
const RIVER = 'M452 0 C 482 90, 446 170, 470 240 C 488 300, 476 380, 488 450 C 498 520, 472 580, 486 700 L 534 700 C 520 590, 546 520, 534 450 C 522 380, 532 300, 516 240 C 494 170, 530 90, 500 0 Z';
const BLOCKS: { x: number; y: number; w: number; h: number; park?: boolean }[] = [
  { x: 670, y: 112, w: 26, h: 18 }, { x: 724, y: 118, w: 22, h: 16 }, { x: 680, y: 170, w: 20, h: 22 }, { x: 728, y: 168, w: 28, h: 18 },
  { x: 676, y: 422, w: 24, h: 18 }, { x: 726, y: 426, w: 26, h: 16 }, { x: 684, y: 476, w: 20, h: 20 }, { x: 732, y: 478, w: 22, h: 22 },
  { x: 820, y: 478, w: 22, h: 18 }, { x: 868, y: 476, w: 26, h: 18 }, { x: 82, y: 494, w: 22, h: 18 }, { x: 124, y: 500, w: 24, h: 16 },
  { x: 226, y: 316, w: 18, h: 16 }, { x: 262, y: 270, w: 20, h: 16 }, { x: 222, y: 272, w: 18, h: 14 },
  { x: 820, y: 228, w: 60, h: 40, park: true }, { x: 900, y: 160, w: 70, h: 48, park: true }, { x: 300, y: 360, w: 70, h: 50, park: true },
];

export function NetworkMap({ route, altIndex = 0, selectedSegment, selectedNode, onSelectSegment, onSelectNode, height = 520, showIncidents = true, highlightSegments }: NetworkMapProps) {
  const { state, assessments } = useStore();
  const [vb, setVb] = useState(VB);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ labels: true, incidents: showIncidents, sensors: true, meeting: true });
  const [legendOpen, setLegendOpen] = useState(true);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [size, setSize] = useState({ w: 1, h: 1 });
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; vb: typeof VB; moved: boolean } | null>(null);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const jMap = useMemo(() => new Map(state.junctions.map((j) => [j.id, j])), [state.junctions]);
  const segMap = useMemo(() => new Map(state.segments.map((s) => [s.id, s])), [state.segments]);
  const observer = state.role === 'observer';
  const k = vb.w / VB.w; // keeps labels/symbols constant on screen
  const km = Math.min(1, Math.max(0.7, k));
  const reduceMotion = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

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
    if (r.width !== size.w || r.height !== size.h) setSize({ w: r.width, h: r.height });
    const s = Math.max(vb.w / r.width, vb.h / r.height); // preserveAspectRatio meet
    const ox = (r.width * s - vb.w) / 2, oy = (r.height * s - vb.h) / 2;
    return { x: vb.x - ox + (clientX - r.left) * s, y: vb.y - oy + (clientY - r.top) * s };
  };
  const onWheel = (e: RWheelEvent) => {
    const p = toSvg(e.clientX, e.clientY);
    zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  };
  const onDown = (e: RPointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, vb, moved: false }; };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const r = svgRef.current!.getBoundingClientRect();
    const s = Math.max(d.vb.w / r.width, d.vb.h / r.height);
    const dx = (e.clientX - d.x) * s;
    const dy = (e.clientY - d.y) * s;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.moved) { setHover(null); setVb({ ...d.vb, x: d.vb.x - dx, y: d.vb.y - dy }); }
  };
  const onUp = () => { setTimeout(() => (drag.current = null), 0); };
  const clickable = () => !drag.current?.moved;

  // Scale bar: nice distance >= ~70px on screen; correct at any zoom.
  const pxPerUnit = size.w > 1 ? Math.min(size.w / vb.w, size.h / vb.h) : 600 / VB.w / k;
  const niceKm = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5].find((d) => d * UNITS_PER_KM * pxPerUnit >= 70) ?? 5;
  const barPx = niceKm * UNITS_PER_KM * pxPerUnit;

  const icon = (kind: string, x: number, y: number, sel: boolean) => {
    const r = 8 * km;
    const ring = sel ? 'var(--color-accent)' : 'var(--color-ink)';
    const sw = (sel ? 2.2 : 1.1) * km;
    const fill = 'var(--color-surface)';
    switch (kind) {
      case 'hospital':
        return <g><rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={2 * km} fill={fill} stroke={ring} strokeWidth={sw} /><path d={`M${x - r * 0.55} ${y}h${r * 1.1}M${x} ${y - r * 0.55}v${r * 1.1}`} stroke="var(--color-crit)" strokeWidth={2.4 * km} /></g>;
      case 'station':
        return <g><circle cx={x} cy={y} r={r} fill="var(--color-accent)" stroke={sel ? 'var(--color-ink)' : 'var(--color-bg)'} strokeWidth={sw + 0.5} /><path d={`M${x} ${y - r * 0.55}L${x + r * 0.5} ${y + r * 0.45}H${x - r * 0.5}Z`} fill="var(--color-bg)" /></g>;
      case 'shelter':
        return <g><path d={`M${x} ${y - r * 1.1}L${x + r} ${y - r * 0.1}V${y + r * 0.8}H${x - r}V${y - r * 0.1}Z`} fill={fill} stroke={ring} strokeWidth={sw} strokeLinejoin="round" /><rect x={x - r * 0.25} y={y + r * 0.15} width={r * 0.5} height={r * 0.65} fill="var(--color-ok)" /></g>;
      case 'school':
        return <g><rect x={x - r} y={y - r * 0.7} width={2 * r} height={r * 1.4} fill={fill} stroke={ring} strokeWidth={sw} /><path d={`M${x - r * 0.6} ${y - r * 0.1}L${x} ${y - r * 0.5}L${x + r * 0.6} ${y - r * 0.1}`} fill="none" stroke="var(--color-ink)" strokeWidth={1.2 * km} /></g>;
      case 'residential':
        return <path d={`M${x} ${y - r * 0.9}L${x + r * 0.85} ${y - r * 0.1}V${y + r * 0.75}H${x - r * 0.85}V${y - r * 0.1}Z`} fill={fill} stroke={ring} strokeWidth={sw} strokeLinejoin="round" />;
      case 'depot':
        return <g><rect x={x - r * 0.9} y={y - r * 0.9} width={r * 1.8} height={r * 1.8} fill={fill} stroke={ring} strokeWidth={sw} /><path d={`M${x - r * 0.9} ${y}H${x + r * 0.9}`} stroke="var(--color-muted)" strokeWidth={1.1 * km} /></g>;
      default:
        return <circle cx={x} cy={y} r={3.6 * km} fill="var(--color-surface)" stroke={sel ? 'var(--color-accent)' : 'var(--color-muted)'} strokeWidth={(sel ? 2 : 1.1) * km} />;
    }
  };

  const legend: SegmentStatus[] = ['VERIFIED_PASSABLE', 'POTENTIAL_HAZARD', 'BLOCKED', 'UNKNOWN', 'STALE_EVIDENCE', 'CONFLICTING_EVIDENCE'];
  const fs = (px: number) => px * k;
  const halo = { paintOrder: 'stroke' as const, stroke: 'var(--color-land)', strokeWidth: 3 * k, strokeLinejoin: 'round' as const };
  const hoverSeg = hover ? segMap.get(hover.id) : undefined;
  const hoverAs = hover ? assessments.get(hover.id) : undefined;

  // Quiet verified roads first; problem roads drawn on top.
  const segs = [...state.segments].sort((a, b) => Number(assessments.get(a.id)?.status !== 'VERIFIED_PASSABLE') - Number(assessments.get(b.id)?.status !== 'VERIFIED_PASSABLE'));

  return (
    <div className="relative min-w-0 overflow-hidden border border-line bg-[var(--color-land)]" style={{ height }}>
      <svg
        ref={svgRef}
        role="img"
        aria-label="Simulated road network map of fictional Sector R-7"
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor: drag.current?.moved ? 'grabbing' : 'grab' }}
        onWheel={onWheel}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerLeave={() => { onUp(); setHover(null); }}
        onPointerEnter={(e) => toSvg(e.clientX, e.clientY)}
      >
        <style>{`.rp-route{stroke-dasharray:14 10;animation:rp-dash 1.6s linear infinite}@keyframes rp-dash{to{stroke-dashoffset:-24}}@media (prefers-reduced-motion: reduce){.rp-route{animation:none}}.rp-hit:focus-visible .rp-focus{stroke:var(--color-accent);stroke-opacity:.6}`}</style>
        <rect x={-1200} y={-1200} width={3500} height={3000} fill="var(--color-land)" />

        {/* Terrain */}
        <g aria-hidden>
          {BLOCKS.map((b, i) => (
            <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx={b.park ? 10 : 1.5} fill={b.park ? 'var(--color-ok)' : 'var(--color-ink)'} fillOpacity={b.park ? 0.07 : 0.05} />
          ))}
          <path d={RIVER} fill="var(--color-water)" stroke="var(--color-water)" strokeWidth={10} strokeOpacity={0.45} strokeLinejoin="round" />
          <path d={RIVER} fill="var(--color-water)" />
          <text x={498} y={205} fontSize={fs(11)} fontStyle="italic" letterSpacing={1} fill="var(--color-accent)" fillOpacity={0.65} transform="rotate(82 498 205)">River (fictional)</text>
        </g>

        {/* Route casing beneath roads */}
        {path && path.segments.map((id) => {
          const s = segMap.get(id);
          if (!s) return null;
          const a = jMap.get(s.from)!, b = jMap.get(s.to)!;
          return <line key={`rc-${id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-bg)" strokeWidth={ROAD_W[s.roadType] + 9} strokeLinecap="round" />;
        })}

        {/* Road casings */}
        {segs.map((s) => {
          const a = jMap.get(s.from)!, b = jMap.get(s.to)!;
          const track = s.roadType === 'track';
          return <line key={`c-${s.id}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-bg)" strokeOpacity={0.85} strokeWidth={ROAD_W[s.roadType] + 3} strokeLinecap={track ? 'butt' : 'round'} strokeDasharray={track ? '7 3' : undefined} />;
        })}

        {/* Roads (interactive) */}
        {segs.map((s) => {
          const a = jMap.get(s.from)!, b = jMap.get(s.to)!;
          const as = assessments.get(s.id)!;
          const st = STATUS_STYLE[as.status];
          const ok = as.status === 'VERIFIED_PASSABLE';
          const sel = selectedSegment === s.id;
          const onRoute = routeSegs.has(s.id);
          const w = ROAD_W[s.roadType];
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          const ang = Math.atan2(b.y - a.y, b.x - a.x);
          const nx = -Math.sin(ang), ny = Math.cos(ang);
          const ux = Math.cos(ang), uy = Math.sin(ang);
          const isBridge = s.roadType === 'bridge' || s.roadType === 'causeway';
          const m = 7 * km;
          const off = w / 2 + 3;
          return (
            <g
              key={s.id}
              role="button"
              tabIndex={0}
              aria-label={`${s.id} ${s.name}: ${STATUS_LABEL[as.status]}${onRoute ? ', on route' : ''}${excluded.has(s.id) ? ', excluded from routing' : ''}`}
              className="rp-hit cursor-pointer focus:outline-none"
              onClick={() => clickable() && onSelectSegment?.(s.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectSegment?.(s.id); } }}
              onPointerMove={(e) => { if (!drag.current?.moved) { const p = toSvg(e.clientX, e.clientY); setHover({ id: s.id, x: p.x, y: p.y }); } }}
              onPointerLeave={() => setHover((h) => (h?.id === s.id ? null : h))}
            >
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={Math.max(16, 16 * k)} />
              <line className="rp-focus" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={w + 12} strokeLinecap="round" />
              {(sel || hl.has(s.id)) && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={sel ? 'var(--color-accent)' : 'var(--color-ink)'} strokeOpacity={sel ? 0.35 : 0.2} strokeWidth={w + 12} strokeLinecap="round" />}
              {excluded.has(s.id) && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-crit)" strokeOpacity={0.16} strokeWidth={w + 10} strokeLinecap="round" />}
              {hover?.id === s.id && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-ink)" strokeOpacity={0.12} strokeWidth={w + 8} strokeLinecap="round" />}
              {isBridge && [-1, 1].map((sd) => {
                const ox = nx * sd * off, oy = ny * sd * off;
                const t0 = 0.22, t1 = 0.78;
                const p0 = { x: a.x + (b.x - a.x) * t0 + ox, y: a.y + (b.y - a.y) * t0 + oy };
                const p1 = { x: a.x + (b.x - a.x) * t1 + ox, y: a.y + (b.y - a.y) * t1 + oy };
                return (
                  <path key={sd} d={`M${p0.x - ux * 4 + nx * sd * 4} ${p0.y - uy * 4 + ny * sd * 4}L${p0.x} ${p0.y}L${p1.x} ${p1.y}L${p1.x + ux * 4 + nx * sd * 4} ${p1.y + uy * 4 + ny * sd * 4}`} fill="none" stroke="var(--color-muted)" strokeWidth={1.1} strokeOpacity={0.8} />
                );
              })}
              <line
                x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={ok ? OK_ROAD : st.color}
                strokeOpacity={ok ? 0.8 : 1}
                strokeWidth={ok ? w : w + 0.8}
                strokeDasharray={ok ? (s.roadType === 'track' ? '5 3' : undefined) : st.dash}
                strokeLinecap={!ok && st.dash ? 'butt' : 'round'}
              />
              {onRoute && <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-accent)" strokeWidth={w * 0.55 + 1.5} strokeLinecap="round" />}
              {onRoute && !reduceMotion && <line className="rp-route" x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--color-bg)" strokeOpacity={0.45} strokeWidth={1.2} />}
              {as.status === 'BLOCKED' && (
                <g>
                  <rect x={mx - m} y={my - m} width={2 * m} height={2 * m} rx={1.5} fill="var(--color-crit)" stroke="var(--color-bg)" strokeWidth={1.5} />
                  <path d={`M${mx - m * 0.45} ${my - m * 0.45}L${mx + m * 0.45} ${my + m * 0.45}M${mx + m * 0.45} ${my - m * 0.45}L${mx - m * 0.45} ${my + m * 0.45}`} stroke="var(--color-bg)" strokeWidth={1.8} strokeLinecap="round" />
                </g>
              )}
              {as.status === 'POTENTIAL_HAZARD' && <path d={`M${mx} ${my - m}L${mx + m} ${my + m * 0.75}H${mx - m}Z`} fill="var(--color-warn)" stroke="var(--color-bg)" strokeWidth={1.4} strokeLinejoin="round" />}
              {as.status === 'CONFLICTING_EVIDENCE' && <path d={`M${mx} ${my - m}L${mx + m} ${my}L${mx} ${my + m}L${mx - m} ${my}Z`} fill="var(--color-conf)" stroke="var(--color-bg)" strokeWidth={1.4} />}
              {(as.status === 'UNKNOWN' || as.status === 'STALE_EVIDENCE') && <circle cx={mx} cy={my} r={m * 0.7} fill="var(--color-bg)" stroke={st.color} strokeWidth={1.6} strokeDasharray={as.status === 'STALE_EVIDENCE' ? '2 2' : undefined} />}
              {layers.labels && (sel || onRoute || hl.has(s.id) || !ok || vb.w < 650) && (
                <text x={mx + nx * 14 * k} y={my + ny * 14 * k + fs(3)} textAnchor="middle" fontSize={fs(9.5)} fontFamily="var(--font-mono)" fill={sel ? 'var(--color-ink)' : 'var(--color-muted)'} {...halo}>
                  {s.id}
                </text>
              )}
            </g>
          );
        })}

        {/* Junctions & places */}
        {state.junctions.map((j) => {
          const sel = selectedNode === j.id;
          const isMeet = meetingNode === j.id;
          const isEnd = !!route && (route.from === j.id || route.to === j.id);
          return (
            <g
              key={j.id}
              role="button"
              tabIndex={0}
              aria-label={`${j.id} ${j.name}${j.meetingPoint ? ', candidate meeting point' : ''}${isMeet ? ', suggested last-mile meeting point' : ''}`}
              className="rp-hit cursor-pointer focus:outline-none"
              onClick={() => clickable() && onSelectNode?.(j.id)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectNode?.(j.id); } }}
            >
              <circle className="rp-focus" cx={j.x} cy={j.y} r={14 * km} fill="transparent" stroke="transparent" strokeWidth={3} />
              {isMeet && <circle cx={j.x} cy={j.y} r={20 * km} fill="var(--color-ok)" fillOpacity={0.12} stroke="var(--color-ok)" strokeWidth={2} strokeDasharray="4 3" />}
              {layers.meeting && j.meetingPoint && <circle cx={j.x} cy={j.y} r={13 * km} fill="none" stroke="var(--color-ok)" strokeOpacity={0.75} strokeWidth={1.4} />}
              {sel && <circle cx={j.x} cy={j.y} r={12 * km} fill="none" stroke="var(--color-accent)" strokeWidth={2} />}
              {icon(j.kind, j.x, j.y, sel)}
              {isEnd && route && (
                <g>
                  <circle cx={j.x - 15 * k} cy={j.y - 15 * k} r={7 * k} fill="var(--color-accent)" stroke="var(--color-bg)" strokeWidth={1.2} />
                  <text x={j.x - 15 * k} y={j.y - 15 * k + fs(3.4)} textAnchor="middle" fontSize={fs(9)} fontWeight={700} fill="var(--color-bg)" fontFamily="var(--font-mono)">{route.from === j.id ? 'A' : 'B'}</text>
                </g>
              )}
              {layers.labels && (j.kind !== 'junction' || sel || vb.w < 650) && (
                <text x={j.x} y={j.y + 20 * k} textAnchor="middle" fontSize={fs(j.kind === 'junction' ? 10 : 11)} fontWeight={j.kind === 'junction' ? 400 : 500} fill={sel ? 'var(--color-ink)' : j.kind === 'junction' ? 'var(--color-muted)' : 'var(--color-ink)'} fillOpacity={0.9} {...halo}>{j.name}</text>
              )}
            </g>
          );
        })}

        {/* Sensors */}
        {layers.sensors && state.sensors.map((sn) => {
          const seg = segMap.get(sn.segmentId);
          if (!seg) return null;
          const a = jMap.get(seg.from)!, b = jMap.get(seg.to)!;
          const x = a.x + (b.x - a.x) * 0.3 + 10, y = a.y + (b.y - a.y) * 0.3 + 10;
          const last = state.readings.filter((r) => r.sensorId === sn.id).at(-1);
          const c = !sn.connected ? 'var(--color-unk)' : last?.flag === 'critical' ? 'var(--color-crit)' : last?.flag === 'warn' ? 'var(--color-warn)' : last?.flag === 'out_of_range' ? 'var(--color-stale)' : 'var(--color-accent)';
          const r = 5.5 * km;
          return (
            <g key={sn.id} aria-label={`Sensor ${sn.id}${sn.connected ? '' : ' disconnected'}`}>
              <title>{`${sn.id} ${sn.name} (simulated) — ${sn.connected ? `${last?.valueCm ?? '—'} cm` : 'disconnected'}`}</title>
              <path d={`M${x} ${y - r}L${x + r} ${y + r * 0.8}H${x - r}Z`} fill={c} fillOpacity={0.9} stroke="var(--color-bg)" strokeWidth={1.2} strokeLinejoin="round" />
              {layers.labels && <text x={x + r + 3 * k} y={y + fs(3)} fontSize={fs(8.5)} fontFamily="var(--font-mono)" fill={c} {...halo}>{sn.id}</text>}
            </g>
          );
        })}

        {/* Incidents */}
        {layers.incidents && state.incidents.filter((i) => i.status !== 'Closed' && i.status !== 'Resolved').map((inc, n) => {
          const j = jMap.get(inc.nodeId);
          if (!j) return null;
          const x = j.x + (14 + (n % 2) * 5) * km, y = j.y - 15 * km;
          const r = 7 * km;
          return (
            <g key={inc.id}>
              <title>{observer ? 'Active incident (details restricted)' : `${inc.id} ${INCIDENT_LABEL[inc.category]} · ${inc.priority} · ${inc.status} (simulated)`}</title>
              <path d={`M${x} ${y - r}L${x + r} ${y}L${x} ${y + r}L${x - r} ${y}Z`} fill="var(--color-crit)" stroke="var(--color-bg)" strokeWidth={1.4} />
              <path d={`M${x} ${y - r * 0.45}V${y + r * 0.1}M${x} ${y + r * 0.35}v0.1`} stroke="var(--color-bg)" strokeWidth={1.6} strokeLinecap="round" />
              {!observer && layers.labels && <text x={x + r + 3 * k} y={y + fs(3)} fontSize={fs(9)} fontFamily="var(--font-mono)" fill="var(--color-crit)" {...halo}>{inc.id}</text>}
            </g>
          );
        })}

        {/* Hover tooltip */}
        {hover && hoverSeg && hoverAs && (
          <g pointerEvents="none" transform={`translate(${hover.x + 10 * k} ${hover.y - 38 * k}) scale(${k})`}>
            <rect x={0} y={0} width={Math.max(hoverSeg.name.length + 5, STATUS_LABEL[hoverAs.status].length + 3) * 5.8 + 16} height={32} rx={3} fill="var(--color-raised)" stroke="var(--color-line-strong)" strokeWidth={1} />
            <text x={8} y={13} fontSize={10} fill="var(--color-ink)"><tspan fontFamily="var(--font-mono)" fill="var(--color-muted)">{hoverSeg.id}</tspan> {hoverSeg.name}</text>
            <text x={8} y={26} fontSize={10} fill={STATUS_STYLE[hoverAs.status].color}>{STATUS_STYLE[hoverAs.status].glyph} {STATUS_LABEL[hoverAs.status]}</text>
          </g>
        )}
      </svg>

      {/* Disclosure */}
      <div className="pointer-events-none absolute left-2.5 top-2 max-w-[55%] text-[11px] text-faint">Simulated network · fictional Sector R-7 · not a real map</div>

      {/* Floating controls */}
      <div className="absolute right-2 top-2 flex flex-col items-end gap-1.5">
        <div role="toolbar" aria-label="Map layers" className="flex flex-wrap justify-end border border-line bg-surface/95">
          {(Object.keys(LAYER_LABEL) as Layer[]).map((l) => (
            <button key={l} type="button" aria-pressed={layers[l]} onClick={() => setLayers({ ...layers, [l]: !layers[l] })}
              className={cx('h-8 px-2 text-[11.5px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]', layers[l] ? 'bg-surface-2 text-ink' : 'text-faint hover:text-muted')}>
              {LAYER_LABEL[l]}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Zoom" className="flex flex-col border border-line bg-surface/95">
          <button type="button" aria-label="Zoom in" onClick={() => zoom(1 / 1.3)} className="grid h-8 w-8 place-items-center text-muted hover:text-ink"><Plus size={14} /></button>
          <button type="button" aria-label="Zoom out" onClick={() => zoom(1.3)} className="grid h-8 w-8 place-items-center border-t border-line text-muted hover:text-ink"><Minus size={14} /></button>
          <button type="button" aria-label="Reset view" onClick={() => setVb(VB)} className="grid h-8 w-8 place-items-center border-t border-line text-muted hover:text-ink"><RotateCcw size={13} /></button>
        </div>
        <svg width="22" height="30" viewBox="0 0 22 30" role="img" aria-label="North arrow" className="mr-[5px]">
          <path d="M11 3L17 21L11 17L5 21Z" fill="var(--color-ink)" fillOpacity={0.7} />
          <text x="11" y="29" textAnchor="middle" fontSize="8" fill="var(--color-muted)">N</text>
        </svg>
      </div>

      {/* Legend */}
      <div className="absolute bottom-2 left-2 max-w-[calc(100%-7rem)] border border-line bg-surface/95 text-[11px]">
        <button type="button" aria-expanded={legendOpen} onClick={() => setLegendOpen((o) => !o)} className="flex h-8 w-full items-center gap-1.5 px-2.5 text-left font-medium text-muted hover:text-ink">
          Legend {legendOpen ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
        </button>
        {legendOpen && (
          <div className="border-t border-line px-2.5 pb-2 pt-1.5">
            <ul className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
              {legend.map((s) => (
                <li key={s} className="flex items-center gap-1.5">
                  <svg width="22" height="8" aria-hidden><line x1="0" y1="4" x2="22" y2="4" stroke={s === 'VERIFIED_PASSABLE' ? OK_ROAD : STATUS_STYLE[s].color} strokeWidth={3} strokeDasharray={STATUS_STYLE[s].dash} /></svg>
                  <span aria-hidden style={{ color: STATUS_STYLE[s].color }}>{STATUS_STYLE[s].glyph}</span>
                  <span className="text-muted">{STATUS_LABEL[s]}</span>
                </li>
              ))}
            </ul>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-faint">
              <span><span className="text-accent">━</span> Route</span>
              <span><span className="text-ok">◯</span> Meeting point</span>
              <span><span className="text-crit">◆</span> Incident</span>
              <span><span className="text-accent">▲</span> Sensor</span>
            </div>
          </div>
        )}
      </div>

      {/* Scale bar */}
      <div className="pointer-events-none absolute bottom-2 right-2 flex flex-col items-end text-[10.5px] text-muted" aria-label={`Scale bar ${niceKm} km`}>
        <span className="num font-mono">{niceKm < 1 ? `${Math.round(niceKm * 1000)} m` : `${niceKm} km`}</span>
        <div style={{ width: barPx }} className="h-[5px] border-x border-b border-[var(--color-ink)] opacity-70" />
      </div>
    </div>
  );
}
