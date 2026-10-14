import { describe, expect, it } from 'vitest';
import { runAllTests } from './testcases';
import { SCENARIOS } from './scenarios';
import { createSeedState } from '../data/seed';
import { initialize, submitReport } from './actions';
import { assessAll } from './evidence';
import { computeRoute } from './routing';
import { toCsv } from '../utils/csv';
import { loadState, saveState, STORAGE_KEY } from '../state/store';

const fresh = () => initialize(createSeedState());
const block = (seg: string, s = fresh()) =>
  submitReport(s, { category: 'flooded_road', segmentRef: seg, condition: 'blocked', description: 'Unit test blocked report.', observedAt: s.now, severity: 'critical', sourceType: 'local_authority', sourceName: 'Ward Office R-7', vehicleAccess: 'none' })[0];

describe('evaluation suite', () => {
  it.each(runAllTests().map((r) => [r.id, r.name, r] as const))('%s %s', (_id, _n, r) => {
    expect(r.passed, r.observed).toBe(true);
  });
});

describe('engine units', () => {
  it('never routes through a confirmed blocked segment', () => {
    const s = block('S03');
    expect(assessAll(s).get('S03')!.status).toBe('BLOCKED');
    for (const m of ['FASTEST', 'EVIDENCE', 'CONSERVATIVE'] as const) expect(computeRoute(s, 'J01', 'J12', 'ambulance', m).best?.segments ?? []).not.toContain('S03');
  });
  it('respects static vehicle restrictions', () => {
    const r = computeRoute(fresh(), 'J01', 'J16', 'fire_truck', 'FASTEST');
    expect(r.found).toBe(false);
  });
  it('produces explicit no-route result with last-mile options', () => {
    let s = block('S03'); s = block('S08', s); s = block('S15', s);
    const r = computeRoute(s, 'J01', 'J12', 'ambulance', 'FASTEST');
    expect(r.found).toBe(false);
    expect(r.explanation[0]).toBe('NO ADEQUATELY VERIFIED ROUTE FOUND');
    expect(r.lastMile.length).toBeGreaterThan(0);
  });
  it('alternatives are distinct from the best path', () => {
    const r = computeRoute(fresh(), 'J01', 'J12', 'ambulance', 'FASTEST');
    for (const a of r.alternatives) expect(a.segments.join()).not.toBe(r.best!.segments.join());
  });
  it('persists and reloads state via localStorage', () => {
    const s = block('S03');
    expect(saveState(s)).toBeNull();
    const back = loadState();
    expect(back.reports.length).toBe(s.reports.length);
    expect(assessAll(back).get('S03')!.status).toBe('BLOCKED');
    localStorage.removeItem(STORAGE_KEY);
  });
  it('exports valid CSV', () => {
    const csv = toCsv([{ id: 'A', v: 'x,"y"' }, { id: 'B', v: 2 }]);
    expect(csv.split('\r\n')).toEqual(['id,v', 'A,"x,""y"""', 'B,2']);
  });
  it('scenarios are reproducible after reset', () => {
    for (const sc of SCENARIOS) {
      const a = sc.run(), b = sc.run();
      expect(a.pass, `${sc.id}: ${a.observed.join(' / ')}`).toBe(true);
      expect(a.observed).toEqual(b.observed);
    }
  });
});
