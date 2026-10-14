// Fictional test area "Sector R-7". Every junction, road, incident, sensor and
// observation below is SIMULATED and does not describe any real place.
import type {
  AppState,
  CostItem,
  EmergencyIncident,
  EvidenceConfig,
  EvidenceRecord,
  Junction,
  RoadSegment,
  RoadType,
  SensorDevice,
  SensorReading,
  Vehicle,
} from '../types';
import { VEHICLES } from '../types';

export const SEED_NOW = Date.UTC(2026, 9, 14, 3, 0); // 08:30 IST on the simulated clock
export const STATE_VERSION = 3;
const MIN = 60_000;

export const SEED_JUNCTIONS: Junction[] = [
  { id: 'J01', name: 'Emergency Response Station', x: 110, y: 300, kind: 'station' },
  { id: 'J02', name: 'Market Square', x: 250, y: 300, kind: 'junction' },
  { id: 'J03', name: 'North Ring West', x: 250, y: 150, kind: 'junction' },
  { id: 'J04', name: 'South Ring West', x: 250, y: 470, kind: 'junction' },
  { id: 'J05', name: 'Main Bridge (West)', x: 420, y: 300, kind: 'junction' },
  { id: 'J06', name: 'Main Bridge (East)', x: 570, y: 300, kind: 'junction' },
  { id: 'J07', name: 'Upper Bridge (West)', x: 420, y: 120, kind: 'junction' },
  { id: 'J08', name: 'Upper Bridge (East)', x: 580, y: 110, kind: 'junction' },
  { id: 'J09', name: 'Causeway (West)', x: 420, y: 530, kind: 'junction' },
  { id: 'J10', name: 'Causeway (East)', x: 575, y: 540, kind: 'junction' },
  { id: 'J11', name: 'Central East Junction', x: 710, y: 300, kind: 'junction' },
  { id: 'J12', name: 'District Hospital', x: 850, y: 300, kind: 'hospital' },
  { id: 'J13', name: 'North Residential', x: 710, y: 150, kind: 'residential', meetingPoint: true },
  { id: 'J14', name: 'South Residential Cluster', x: 710, y: 460, kind: 'residential', meetingPoint: true },
  { id: 'J15', name: 'Riverside Colony', x: 850, y: 460, kind: 'residential' },
  { id: 'J16', name: 'Hilltop Shelter', x: 870, y: 140, kind: 'shelter', meetingPoint: true },
  { id: 'J17', name: 'North Depot', x: 110, y: 140, kind: 'depot' },
  { id: 'J18', name: 'West Village', x: 110, y: 480, kind: 'residential' },
  { id: 'J19', name: 'East Bank Lane', x: 580, y: 420, kind: 'junction' },
  { id: 'J20', name: 'Eastern Colony', x: 975, y: 375, kind: 'residential' },
  { id: 'J21', name: 'Eastern Colony South Gate', x: 960, y: 520, kind: 'junction', meetingPoint: true },
  { id: 'J22', name: 'Mid-West School', x: 330, y: 390, kind: 'school', meetingPoint: true },
];

const SPEED: Record<RoadType, number> = {
  arterial: 40,
  collector: 30,
  local: 25,
  residential: 20,
  bridge: 30,
  causeway: 25,
  hill: 20,
  track: 12,
};

const ALL = VEHICLES;
const NO_FIRE: Vehicle[] = ['ambulance', 'rescue_4x4', 'motorcycle'];
const LIGHT: Vehicle[] = ['rescue_4x4', 'motorcycle'];

type SegDef = [string, string, string, string, RoadType, Partial<Pick<RoadSegment, 'allowedVehicles' | 'restrictionNote' | 'floodProne' | 'formerIds'>>?];

const SEG_DEFS: SegDef[] = [
  ['S01', 'Station Road', 'J01', 'J02', 'arterial'],
  ['S02', 'Bridge Approach Road', 'J02', 'J05', 'arterial'],
  ['S03', 'Main Bridge', 'J05', 'J06', 'bridge', { floodProne: true, formerIds: ['R7-OLD-03'] }],
  ['S04', 'East Trunk Road', 'J06', 'J11', 'arterial'],
  ['S05', 'Hospital Road', 'J11', 'J12', 'arterial'],
  ['S06', 'Market North Link', 'J02', 'J03', 'collector'],
  ['S07', 'Upper Ring Road', 'J03', 'J07', 'collector'],
  ['S08', 'Upper Bridge (steel)', 'J07', 'J08', 'bridge', { allowedVehicles: NO_FIRE, restrictionNote: '10 t load limit — fire tender excluded' }],
  ['S09', 'North Colony Road', 'J08', 'J13', 'collector'],
  ['S10', 'Residential Connector', 'J13', 'J11', 'collector'],
  ['S11', 'Hill Road', 'J13', 'J16', 'hill', { allowedVehicles: NO_FIRE, restrictionNote: 'Narrow hairpins — fire tender excluded' }],
  ['S12', 'Shelter Descent', 'J16', 'J12', 'hill', { allowedVehicles: NO_FIRE, restrictionNote: 'Narrow hairpins — fire tender excluded' }],
  ['S13', 'Market South Link', 'J02', 'J04', 'collector'],
  ['S14', 'South Ring Road', 'J04', 'J09', 'collector'],
  ['S15', 'Low Causeway', 'J09', 'J10', 'causeway', { floodProne: true, formerIds: ['R7-OLD-15'] }],
  ['S16', 'Causeway East Road', 'J10', 'J14', 'collector'],
  ['S17', 'South Cluster Link', 'J14', 'J11', 'collector'],
  ['S18', 'Colony Lane', 'J14', 'J15', 'residential'],
  ['S19', 'Riverside Road', 'J15', 'J12', 'residential'],
  ['S20', 'Depot Road', 'J01', 'J17', 'local'],
  ['S21', 'Depot Ring Link', 'J17', 'J03', 'local'],
  ['S22', 'Village Road', 'J01', 'J18', 'local'],
  ['S23', 'Village Ring Link', 'J18', 'J04', 'local'],
  ['S24', 'East Bank Lane (North)', 'J06', 'J19', 'residential', { floodProne: true }],
  ['S25', 'East Bank Lane (South)', 'J19', 'J10', 'residential', { floodProne: true }],
  ['S26', 'Bank-Cluster Link', 'J19', 'J14', 'residential'],
  ['S27', 'Colony Access Road', 'J12', 'J20', 'residential'],
  ['S28', 'South Gate Road', 'J15', 'J21', 'residential'],
  ['S29', 'Gate Lane', 'J21', 'J20', 'residential', { allowedVehicles: ['ambulance', 'rescue_4x4', 'motorcycle'], restrictionNote: '3.0 m width — fire tender excluded' }],
  ['S30', 'School Road', 'J04', 'J22', 'local'],
  ['S31', 'School Bridge Link', 'J22', 'J05', 'local'],
  ['S32', 'West Bank Road', 'J05', 'J09', 'local', { floodProne: true }],
  ['S33', 'Ridge Track', 'J16', 'J20', 'track', { allowedVehicles: LIGHT, restrictionNote: 'Unpaved track — 4x4 / two-wheeler only' }],
  ['S34', 'Village Causeway Link', 'J18', 'J09', 'local', { floodProne: true }],
];

const jById = new Map(SEED_JUNCTIONS.map((j) => [j.id, j]));
export function straightKm(a: Junction, b: Junction) {
  return Math.hypot(a.x - b.x, a.y - b.y) / 100;
}

export function seedSegments(): RoadSegment[] {
  return SEG_DEFS.map(([id, name, from, to, roadType, extra]) => ({
    id,
    name,
    from,
    to,
    roadType,
    lengthKm: Math.round(straightKm(jById.get(from)!, jById.get(to)!) * 1.12 * 100) / 100,
    speedKmh: SPEED[roadType],
    allowedVehicles: extra?.allowedVehicles ?? ALL,
    restrictionNote: extra?.restrictionNote,
    floodProne: extra?.floodProne,
    formerIds: extra?.formerIds,
    history: [],
  }));
}

export const DEFAULT_CONFIG: EvidenceConfig = {
  hazardFreshnessH: {
    flooded_road: 2,
    fallen_tree: 12,
    damaged_bridge: 48,
    road_collapse: 48,
    landslide: 8,
    accident_obstruction: 3,
    fire_smoke: 2,
    debris: 12,
    restricted_access: 24,
    other: 6,
  },
  passableFreshnessH: 12,
  passableFloodProneFreshnessH: 4,
  duplicateWindowMin: 30,
  waterWarnCm: 30,
  penalties: { STALE_EVIDENCE: 1.8, UNKNOWN: 2.5, POTENTIAL_HAZARD: 4, CONFLICTING_EVIDENCE: 4 },
};

// [segmentId, minutes ago, source type, source name]; all "passable" seed observations.
const SEED_PASSABLE: [string, number, EvidenceRecord['sourceType'], string, boolean][] = [
  ['S01', 35, 'responder', 'Unit AMB-1 crew', false],
  ['S02', 40, 'responder', 'Unit AMB-1 crew', false],
  ['S03', 55, 'field_verifier', 'Verifier Team A', true],
  ['S04', 50, 'field_verifier', 'Verifier Team A', true],
  ['S05', 25, 'responder', 'Unit AMB-2 crew', false],
  ['S06', 90, 'local_authority', 'Ward Office R-7', true],
  ['S07', 95, 'local_authority', 'Ward Office R-7', true],
  ['S08', 80, 'field_verifier', 'Verifier Team B', true],
  ['S09', 85, 'field_verifier', 'Verifier Team B', true],
  ['S10', 70, 'responder', 'Unit RES-1 crew', false],
  ['S12', 150, 'local_authority', 'Ward Office R-7', true],
  ['S13', 60, 'responder', 'Unit AMB-1 crew', false],
  ['S14', 65, 'responder', 'Unit AMB-1 crew', false],
  ['S15', 45, 'field_verifier', 'Verifier Team C', true],
  ['S16', 50, 'field_verifier', 'Verifier Team C', true],
  ['S17', 75, 'responder', 'Unit AMB-2 crew', false],
  ['S18', 100, 'local_authority', 'Ward Office R-7', true],
  ['S19', 110, 'local_authority', 'Ward Office R-7', true],
  ['S20', 180, 'local_authority', 'Ward Office R-7', true],
  ['S21', 185, 'local_authority', 'Ward Office R-7', true],
  ['S22', 20 * 60, 'local_authority', 'Ward Office R-7', true], // stale (> 12 h)
  ['S23', 120, 'responder', 'Unit RES-1 crew', false],
  ['S24', 130, 'field_verifier', 'Verifier Team C', true],
  ['S25', 140, 'field_verifier', 'Verifier Team C', true],
  ['S26', 140, 'field_verifier', 'Verifier Team C', true],
  ['S27', 60, 'responder', 'Unit AMB-2 crew', false],
  ['S28', 70, 'field_verifier', 'Verifier Team C', true],
  ['S30', 160, 'local_authority', 'Ward Office R-7', true],
  ['S31', 165, 'local_authority', 'Ward Office R-7', true],
  ['S32', 100, 'field_verifier', 'Verifier Team A', true],
];
// S29, S33, S34: intentionally no observations → UNKNOWN.

export function seedEvidence(): EvidenceRecord[] {
  const ev: EvidenceRecord[] = SEED_PASSABLE.map(([segmentId, ago, sourceType, sourceName, verified], i) => ({
    id: `EV-S${String(i + 1).padStart(3, '0')}`,
    segmentId,
    kind: sourceType === 'field_verifier' ? 'inspection' : 'seed',
    condition: 'passable',
    observedAt: SEED_NOW - ago * MIN,
    receivedAt: SEED_NOW - ago * MIN + 2 * MIN,
    sourceType,
    sourceName,
    verification: verified ? 'verified' : 'unverified',
    origin: 'simulated-seed',
    note: 'Seeded simulated observation',
  }));
  // S11 Hill Road: verified landslide (BLOCKED)
  ev.push({
    id: 'EV-S100',
    segmentId: 'S11',
    kind: 'inspection',
    condition: 'blocked',
    category: 'landslide',
    observedAt: SEED_NOW - 90 * MIN,
    receivedAt: SEED_NOW - 85 * MIN,
    sourceType: 'local_authority',
    sourceName: 'Ward Office R-7',
    verification: 'verified',
    origin: 'simulated-seed',
    note: 'Slope failure covering both lanes (simulated)',
  });
  // S20 Depot Road: anonymous debris report on top of older verified passable → conflict
  ev.push({
    id: 'EV-S101',
    segmentId: 'S20',
    kind: 'report',
    condition: 'hazard',
    category: 'debris',
    observedAt: SEED_NOW - 40 * MIN,
    receivedAt: SEED_NOW - 38 * MIN,
    sourceType: 'public_anonymous',
    sourceName: 'Anonymous reporter',
    verification: 'unverified',
    reportId: 'RPT-0001',
    origin: 'simulated-seed',
  });
  return ev;
}

export const SEED_UNITS = [
  { id: 'AMB-1', name: 'Ambulance AMB-1', vehicle: 'ambulance' as const, baseNodeId: 'J01' },
  { id: 'AMB-2', name: 'Ambulance AMB-2', vehicle: 'ambulance' as const, baseNodeId: 'J12' },
  { id: 'FIRE-1', name: 'Fire tender FIRE-1', vehicle: 'fire_truck' as const, baseNodeId: 'J01' },
  { id: 'RES-1', name: 'Rescue 4x4 RES-1', vehicle: 'rescue_4x4' as const, baseNodeId: 'J17' },
  { id: 'MOTO-1', name: 'Motorcycle responder MOTO-1', vehicle: 'motorcycle' as const, baseNodeId: 'J01' },
];

export const SEED_PERSONNEL = ['Verifier Team A', 'Verifier Team B', 'Verifier Team C', 'Ward Office R-7 Inspector'];

function seedIncidents(): EmergencyIncident[] {
  const mk = (
    id: string,
    category: EmergencyIncident['category'],
    nodeId: string,
    priority: EmergencyIncident['priority'],
    people: number,
    vehicle: Vehicle,
    status: EmergencyIncident['status'],
    ago: number,
    notes: string,
    assignedUnit?: string,
  ): EmergencyIncident => ({
    id,
    category,
    nodeId,
    priority,
    peopleAffected: people,
    vehicle,
    accessibility: '',
    reportedAt: SEED_NOW - ago * MIN,
    status,
    notes,
    assignedUnit,
    timeline: [{ at: SEED_NOW - ago * MIN, text: 'Incident received (simulated)' }],
    simulated: true,
  });
  const resolved = mk('INC-1003', 'road_accident', 'J04', 'P3', 2, 'ambulance', 'Resolved', 210, 'Two-vehicle collision, minor injuries (simulated).', 'AMB-1');
  resolved.resolvedAt = SEED_NOW - 150 * MIN;
  resolved.resolutionNotes = 'Patients transferred; carriageway cleared.';
  resolved.timeline.push({ at: SEED_NOW - 150 * MIN, text: 'Resolved by AMB-1' });
  return [
    mk('INC-1001', 'medical', 'J20', 'P1', 1, 'ambulance', 'Route planning', 12, 'Elderly resident, breathing difficulty (simulated).'),
    mk('INC-1002', 'flood_rescue', 'J15', 'P2', 6, 'rescue_4x4', 'Responder assigned', 30, 'Ground-floor homes with rising water (simulated).', 'RES-1'),
    resolved,
    mk('INC-1004', 'fire', 'J13', 'P2', 4, 'fire_truck', 'Received', 6, 'Smoke from a kitchen in a residential block (simulated).'),
  ];
}

export const SEED_SENSORS: SensorDevice[] = [
  { id: 'WL-01', name: 'Causeway gauge', segmentId: 'S15', kind: 'water_level', warnCm: 30, criticalCm: 50, maxPlausibleCm: 300, expectedIntervalMin: 15, connected: true, hardware: 'simulated', calibrationNote: 'Gauge zero = causeway deck crown (assumed for simulation).' },
  { id: 'WL-02', name: 'West bank gauge', segmentId: 'S32', kind: 'water_level', warnCm: 25, criticalCm: 45, maxPlausibleCm: 300, expectedIntervalMin: 15, connected: true, hardware: 'simulated', calibrationNote: 'Gauge mounted 40 m from road edge; reading is indicative only.' },
  { id: 'WL-03', name: 'Main bridge pier gauge', segmentId: 'S03', kind: 'water_level', warnCm: 200, criticalCm: 260, maxPlausibleCm: 600, expectedIntervalMin: 15, connected: false, hardware: 'simulated', calibrationNote: 'Measures river stage at pier, not deck water depth.' },
];

function seedReadings(): SensorReading[] {
  const out: SensorReading[] = [];
  const series: [string, number[]][] = [
    ['WL-01', [6, 7, 8, 9, 10, 11]],
    ['WL-02', [3, 3, 4, 4, 5, 5]],
    ['WL-03', [140, 142, 145]],
  ];
  let n = 0;
  for (const [sensorId, vals] of series) {
    vals.forEach((v, i) => {
      out.push({ id: `RD-S${++n}`, sensorId, at: SEED_NOW - (vals.length - i) * 15 * MIN - (sensorId === 'WL-03' ? 120 * MIN : 0), valueCm: v, flag: 'ok', origin: 'sensor-sim' });
    });
  }
  return out;
}

export const SEED_COSTS: CostItem[] = [
  { id: 'C1', item: 'Static web hosting (free tier)', category: 'hosting', qty: 12, unitInr: 0, note: 'Months; e.g. any static host free tier' },
  { id: 'C2', item: 'Optional managed database (free tier)', category: 'hosting', qty: 12, unitInr: 0, note: 'Only if shared backend is enabled' },
  { id: 'C3', item: 'Domain name', category: 'hosting', qty: 1, unitInr: 900, note: 'Annual, estimate' },
  { id: 'C4', item: 'ESP32 development board', category: 'hardware', qty: 3, unitInr: 450, note: 'Per board, estimate' },
  { id: 'C5', item: 'Ultrasonic / float water-level sensor', category: 'hardware', qty: 3, unitInr: 350, note: 'Estimate; waterproofing extra' },
  { id: 'C6', item: 'Weatherproof enclosure + mounting', category: 'hardware', qty: 3, unitInr: 600, note: 'Estimate' },
  { id: 'C7', item: 'Solar panel + battery pack', category: 'hardware', qty: 3, unitInr: 1200, note: 'Estimate' },
  { id: 'C8', item: 'Field verifier smartphone data plan', category: 'operations', qty: 12, unitInr: 300, note: 'Months, estimate' },
  { id: 'C9', item: 'Maintenance & calibration visits', category: 'operations', qty: 4, unitInr: 1000, note: 'Quarterly, estimate' },
  { id: 'C10', item: 'Open-source software stack', category: 'software', qty: 1, unitInr: 0, note: 'React, Vite, Recharts — MIT licensed' },
];

export function createSeedState(): AppState {
  const segments = seedSegments();
  return {
    version: STATE_VERSION,
    now: SEED_NOW,
    role: 'coordinator',
    junctions: SEED_JUNCTIONS.map((j) => ({ ...j })),
    segments,
    evidence: seedEvidence(),
    reports: [
      {
        id: 'RPT-0001',
        category: 'debris',
        segmentId: 'S20',
        submittedSegmentRef: 'S20',
        description: 'Branches and loose debris across half the carriageway near the depot gate.',
        observedAt: SEED_NOW - 40 * MIN,
        submittedAt: SEED_NOW - 38 * MIN,
        severity: 'moderate',
        condition: 'hazard',
        sourceType: 'public_anonymous',
        sourceName: 'Anonymous reporter',
        vehicleAccess: 'unknown',
        evidenceId: 'EV-S101',
        status: 'unverified',
        origin: 'simulated-seed',
        fingerprint: 'S20|debris|hazard|anon',
      },
    ],
    incidents: seedIncidents(),
    units: SEED_UNITS.map((u) => ({ ...u })),
    personnel: [...SEED_PERSONNEL],
    tasks: [],
    sensors: SEED_SENSORS.map((s) => ({ ...s })),
    readings: seedReadings(),
    audit: [],
    routes: [],
    config: structuredClone(DEFAULT_CONFIG),
    offline: { online: true, lastSyncAt: SEED_NOW - 5 * MIN, queue: [], remoteInbox: [], syncLog: [] },
    costs: SEED_COSTS.map((c) => ({ ...c })),
    counters: { RPT: 1, INC: 1004 },
  };
}
