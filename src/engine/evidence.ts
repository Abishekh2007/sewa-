// Proof-of-Passability evidence engine. Pure functions; no UI or storage dependencies.
import type { AppState, Confidence, EvidenceConfig, EvidenceRecord, RoadSegment, SegmentAssessment, SegmentStatus } from '../types';
import { HAZARD_LABEL, SOURCE_LABEL } from '../types';

const MIN = 60_000;

/** Trust tier: 3 = independently verified, 2 = authenticated source, 1 = identified/sensor, 0 = anonymous. */
export function trustTier(ev: EvidenceRecord): 0 | 1 | 2 | 3 {
  if (ev.verification === 'verified') return 3;
  if (ev.legacyIdMatch) return 1; // location reference is uncertain until verified
  if (ev.sourceType === 'field_verifier' || ev.sourceType === 'local_authority' || ev.sourceType === 'responder') return 2;
  if (ev.sourceType === 'public_identified' || ev.sourceType === 'sensor') return 1;
  return 0;
}
export const TIER_LABEL = ['Anonymous', 'Identified / sensor', 'Authenticated', 'Verified'] as const;

export function freshnessLimitMin(ev: EvidenceRecord, seg: RoadSegment, cfg: EvidenceConfig): number {
  if (ev.condition === 'passable') return (seg.floodProne ? cfg.passableFloodProneFreshnessH : cfg.passableFreshnessH) * 60;
  return cfg.hazardFreshnessH[ev.category ?? 'other'] * 60;
}

export function fmtAge(min: number | null): string {
  if (min === null) return '—';
  if (min < 60) return `${Math.round(min)} min`;
  if (min < 48 * 60) return `${(min / 60).toFixed(1)} h`;
  return `${Math.round(min / 1440)} d`;
}

function describe(ev: EvidenceRecord, now: number) {
  const what = ev.condition === 'passable' ? 'passable' : `${ev.condition}${ev.category ? ` (${HAZARD_LABEL[ev.category]})` : ''}`;
  return `${ev.id}: ${what} — ${SOURCE_LABEL[ev.sourceType]} "${ev.sourceName}", ${TIER_LABEL[trustTier(ev)].toLowerCase()}, ${fmtAge((now - ev.observedAt) / MIN)} ago`;
}

export function assessSegment(seg: RoadSegment, allEvidence: EvidenceRecord[], cfg: EvidenceConfig, now: number): SegmentAssessment {
  const evs = allEvidence
    .filter((e) => e.segmentId === seg.id && e.verification !== 'rejected' && e.observedAt <= now)
    .sort((a, b) => b.observedAt - a.observedAt);
  const base: SegmentAssessment = {
    segmentId: seg.id,
    status: 'UNKNOWN',
    confidence: 'Low',
    reasons: [],
    latest: evs[0],
    considered: [],
    conflicting: [],
    duplicates: [],
    staleIds: [],
    vehicleLimits: null,
    latestAgeMin: evs[0] ? (now - evs[0].observedAt) / MIN : null,
  };
  if (!evs.length) {
    base.reasons.push('No observations on record. Absence of reports is NOT treated as evidence of passability.');
    return base;
  }

  let fresh: EvidenceRecord[] = [];
  for (const e of evs) {
    const lim = freshnessLimitMin(e, seg, cfg);
    if ((now - e.observedAt) / MIN <= lim) fresh.push(e);
    else base.staleIds.push(e.id);
  }
  // An expired hazard/blocked observation must not let OLDER "passable" evidence resurface.
  const newestStaleNeg = evs.find((e) => e.condition !== 'passable' && base.staleIds.includes(e.id));
  if (newestStaleNeg) {
    const before = fresh.length;
    fresh = fresh.filter((e) => e.observedAt > newestStaleNeg.observedAt);
    if (before > fresh.length) base.reasons.push(`Observations older than expired hazard ${newestStaleNeg.id} are not reused.`);
  }

  // Duplicate detection: same source + same claim within the configured window → keep newest only.
  const kept: EvidenceRecord[] = [];
  for (const e of fresh) {
    const dup = kept.find(
      (k) =>
        k.sourceName === e.sourceName &&
        k.condition === e.condition &&
        k.category === e.category &&
        Math.abs(k.observedAt - e.observedAt) <= cfg.duplicateWindowMin * MIN,
    );
    if (dup) base.duplicates.push(e.id);
    else kept.push(e);
  }
  if (base.duplicates.length) base.reasons.push(`${base.duplicates.length} duplicate submission(s) counted once: ${base.duplicates.join(', ')}.`);

  if (!kept.length) {
    const last = evs[0];
    base.status = 'STALE_EVIDENCE';
    base.reasons.push(
      `All ${evs.length} observation(s) are older than their freshness limit. Last known: ${describe(last, now)}.`,
      last.condition === 'blocked' ? 'Last known condition was BLOCKED — routing continues to exclude this segment until re-inspected.' : 'Re-inspection required before relying on this segment.',
    );
    return base;
  }

  // A verified observation supersedes older evidence; anything newer than it is still considered.
  const anchor = kept.find((e) => trustTier(e) === 3);
  const window = anchor ? kept.filter((e) => e.observedAt >= anchor.observedAt) : kept;
  base.considered = window;
  if (anchor && window.length < kept.length) base.reasons.push(`Verified observation ${anchor.id} supersedes ${kept.length - window.length} older observation(s).`);

  const negs = window.filter((e) => e.condition !== 'passable');
  // The verified anchor does not "conflict" with hazards observed after it — those indicate a change.
  const passes = window.filter((e) => e.condition === 'passable' && !(e === anchor && negs.length && negs.every((n) => n.observedAt > e.observedAt)));
  const waterHigh = window.find((e) => e.condition === 'passable' && (e.waterLevelCm ?? 0) > cfg.waterWarnCm);
  const limited = window.find((e) => e.restrictsTo?.length);
  if (limited) {
    base.vehicleLimits = limited.restrictsTo!;
    base.reasons.push(`${limited.id} limits access to: ${limited.restrictsTo!.join(', ')}.`);
  }

  const strongBlocked = negs.find((e) => e.condition === 'blocked' && trustTier(e) >= 2);
  const newerVerifiedPass = strongBlocked && passes.find((p) => trustTier(p) === 3 && p.observedAt > strongBlocked.observedAt);

  if (strongBlocked && !newerVerifiedPass) {
    base.status = 'BLOCKED';
    base.confidence = trustTier(strongBlocked) === 3 ? 'High' : 'Medium';
    base.reasons.push(`Blocked per ${describe(strongBlocked, now)}.`);
    if (passes.length) {
      base.conflicting = passes;
      base.reasons.push(`${passes.length} later "passable" claim(s) conflict but are not verified; a confirmed block is lifted only by verification.`);
    }
  } else if (passes.length && negs.length) {
    base.status = 'CONFLICTING_EVIDENCE';
    base.conflicting = window;
    base.reasons.push('Recent observations disagree. Both are preserved; neither is chosen automatically.', ...window.map((e) => describe(e, now)));
  } else if (waterHigh) {
    base.status = 'CONFLICTING_EVIDENCE';
    base.conflicting = [waterHigh];
    base.waterAlert = waterHigh.waterLevelCm;
    base.reasons.push(`${waterHigh.id} reports "passable" but records ${waterHigh.waterLevelCm} cm water, above the ${cfg.waterWarnCm} cm test threshold.`);
  } else if (negs.length) {
    const top = negs.reduce((a, b) => (trustTier(b) > trustTier(a) ? b : a));
    base.status = 'POTENTIAL_HAZARD';
    base.confidence = trustTier(top) >= 2 ? 'Medium' : 'Low';
    base.reasons.push(`Hazard reported: ${describe(top, now)}.`, trustTier(top) < 2 ? 'Source is not authenticated — awaiting verification. Not treated as confirmed.' : 'Hazard present but road not confirmed blocked.');
  } else {
    const best = passes.reduce((a, b) => (trustTier(b) > trustTier(a) ? b : a));
    const tier = trustTier(best);
    if (tier >= 2) {
      base.status = 'VERIFIED_PASSABLE';
      const age = (now - best.observedAt) / MIN;
      base.confidence = tier === 3 && age < freshnessLimitMin(best, seg, cfg) / 2 ? 'High' : 'Medium';
      base.reasons.push(`Passable per ${describe(best, now)}.`, `Evidence expires after ${fmtAge(freshnessLimitMin(best, seg, cfg))}${seg.floodProne ? ' (flood-prone road: shorter limit)' : ''}.`);
    } else {
      base.status = 'UNKNOWN';
      base.reasons.push(`Only unauthenticated "passable" claims (${passes.map((p) => p.id).join(', ')}). Insufficient to mark as verified.`);
    }
  }
  if (base.staleIds.length) base.reasons.push(`${base.staleIds.length} older observation(s) expired and were ignored.`);
  return base;
}

export function assessAll(s: Pick<AppState, 'segments' | 'evidence' | 'config' | 'now'>): Map<string, SegmentAssessment> {
  return new Map(s.segments.map((seg) => [seg.id, assessSegment(seg, s.evidence, s.config, s.now)]));
}

export const STATUS_LABEL: Record<SegmentStatus, string> = {
  VERIFIED_PASSABLE: 'Verified passable',
  POTENTIAL_HAZARD: 'Potential hazard',
  BLOCKED: 'Blocked',
  UNKNOWN: 'Unknown',
  STALE_EVIDENCE: 'Stale evidence',
  CONFLICTING_EVIDENCE: 'Conflicting evidence',
};
export const CONFIDENCE_ORDER: Confidence[] = ['High', 'Medium', 'Low'];
