// Core data model for RAKSHA-PATH X. All data in the demo is simulated.

export type Vehicle = 'ambulance' | 'fire_truck' | 'rescue_4x4' | 'motorcycle';
export const VEHICLES: Vehicle[] = ['ambulance', 'fire_truck', 'rescue_4x4', 'motorcycle'];
export const VEHICLE_LABEL: Record<Vehicle, string> = {
  ambulance: 'Ambulance',
  fire_truck: 'Fire tender',
  rescue_4x4: 'Rescue 4x4',
  motorcycle: 'Motorcycle responder',
};

export type RoadType = 'arterial' | 'collector' | 'local' | 'residential' | 'bridge' | 'causeway' | 'hill' | 'track';

export type NodeKind = 'junction' | 'hospital' | 'station' | 'residential' | 'shelter' | 'school' | 'depot';

export interface Junction {
  id: string;
  name: string;
  x: number; // map units, 100 units = 1 km (fictional geometry)
  y: number;
  kind: NodeKind;
  meetingPoint?: boolean; // candidate rescue meeting point
}

export type SegmentStatus =
  | 'VERIFIED_PASSABLE'
  | 'POTENTIAL_HAZARD'
  | 'BLOCKED'
  | 'UNKNOWN'
  | 'STALE_EVIDENCE'
  | 'CONFLICTING_EVIDENCE';

export type Confidence = 'High' | 'Medium' | 'Low';

export interface StatusChange {
  at: number;
  from: SegmentStatus | null;
  to: SegmentStatus;
  reason: string;
}

export interface RoadSegment {
  id: string;
  name: string;
  from: string;
  to: string;
  roadType: RoadType;
  lengthKm: number;
  speedKmh: number;
  allowedVehicles: Vehicle[]; // static restriction (e.g. weight-limited bridge)
  restrictionNote?: string;
  floodProne?: boolean;
  formerIds?: string[]; // legacy identifiers that map to this segment
  history: StatusChange[];
}

export type HazardCategory =
  | 'flooded_road'
  | 'fallen_tree'
  | 'damaged_bridge'
  | 'road_collapse'
  | 'landslide'
  | 'accident_obstruction'
  | 'fire_smoke'
  | 'debris'
  | 'restricted_access'
  | 'other';

export const HAZARD_LABEL: Record<HazardCategory, string> = {
  flooded_road: 'Flooded road',
  fallen_tree: 'Fallen tree',
  damaged_bridge: 'Damaged bridge',
  road_collapse: 'Road collapse',
  landslide: 'Landslide',
  accident_obstruction: 'Accident obstruction',
  fire_smoke: 'Fire or smoke obstruction',
  debris: 'Debris',
  restricted_access: 'Restricted access',
  other: 'Other',
};

/** What an observation says about the road. */
export type ObservedCondition = 'passable' | 'hazard' | 'blocked';

export type SourceType =
  | 'field_verifier'
  | 'local_authority'
  | 'responder'
  | 'public_identified'
  | 'public_anonymous'
  | 'sensor';

export const SOURCE_LABEL: Record<SourceType, string> = {
  field_verifier: 'Field verifier (authenticated)',
  local_authority: 'Local authority (authenticated)',
  responder: 'Emergency responder (authenticated)',
  public_identified: 'Public — identified, unverified',
  public_anonymous: 'Public — anonymous',
  sensor: 'Sensor feed (simulated)',
};

export type VerificationState = 'unverified' | 'verified' | 'rejected';

export interface EvidenceRecord {
  id: string;
  segmentId: string;
  kind: 'report' | 'inspection' | 'sensor' | 'seed';
  condition: ObservedCondition;
  category?: HazardCategory; // for hazard/blocked observations
  observedAt: number;
  receivedAt: number;
  sourceType: SourceType;
  sourceName: string;
  verification: VerificationState;
  restrictsTo?: Vehicle[]; // e.g. flooded but passable for 4x4 only
  waterLevelCm?: number;
  reportId?: string;
  note?: string;
  legacyIdMatch?: string; // set when report used a legacy segment id
  origin: 'simulated-seed' | 'demo-user' | 'scenario' | 'sensor-sim' | 'offline-sync';
}

export type Severity = 'low' | 'moderate' | 'high' | 'critical';

export interface HazardReport {
  id: string;
  category: HazardCategory;
  segmentId: string;
  submittedSegmentRef: string; // as typed/selected by reporter
  description: string;
  observedAt: number;
  submittedAt: number;
  severity: Severity;
  condition: ObservedCondition;
  sourceType: SourceType;
  sourceName: string;
  vehicleAccess: 'all' | 'high_clearance_only' | 'two_wheeler_only' | 'none' | 'unknown';
  waterLevelCm?: number;
  image?: { name: string; type: string; sizeKb: number; dataUrl?: string; note: string };
  contact?: { value: string; consent: boolean };
  evidenceId?: string;
  status: 'unverified' | 'verified' | 'rejected' | 'queued_offline';
  origin: EvidenceRecord['origin'];
  fingerprint: string;
}

export type IncidentCategory = 'medical' | 'fire' | 'flood_rescue' | 'road_accident' | 'evacuation' | 'other';
export const INCIDENT_LABEL: Record<IncidentCategory, string> = {
  medical: 'Medical emergency',
  fire: 'Fire',
  flood_rescue: 'Flood rescue',
  road_accident: 'Road accident',
  evacuation: 'Evacuation support',
  other: 'Other emergency',
};
export type IncidentStatus =
  | 'Received'
  | 'Under assessment'
  | 'Route planning'
  | 'Responder assigned'
  | 'In progress'
  | 'Resolved'
  | 'Closed';
export const INCIDENT_STATUSES: IncidentStatus[] = [
  'Received',
  'Under assessment',
  'Route planning',
  'Responder assigned',
  'In progress',
  'Resolved',
  'Closed',
];
export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

export interface IncidentEvent {
  at: number;
  text: string;
}

export interface EmergencyIncident {
  id: string;
  category: IncidentCategory;
  nodeId: string;
  priority: Priority;
  peopleAffected: number;
  vehicle: Vehicle;
  accessibility: string;
  reportedAt: number;
  assignedUnit?: string;
  status: IncidentStatus;
  notes: string;
  resolutionNotes?: string;
  closureVerifiedBy?: string;
  resolvedAt?: number;
  closedAt?: number;
  timeline: IncidentEvent[];
  lastRoute?: RouteSummary;
  simulated: true;
}

export interface ResponseUnit {
  id: string;
  name: string;
  vehicle: Vehicle;
  baseNodeId: string;
}

export type RouteMode = 'FASTEST' | 'EVIDENCE' | 'CONSERVATIVE';
export const MODE_LABEL: Record<RouteMode, string> = {
  FASTEST: 'Fastest available',
  EVIDENCE: 'Evidence-prioritized',
  CONSERVATIVE: 'Conservative emergency',
};

export interface RoutePath {
  nodes: string[];
  segments: string[];
  lengthKm: number;
  estMinutes: number; // estimate from simulated configured speeds
  cost: number;
  uncertainSegments: string[];
  statusCounts: Partial<Record<SegmentStatus, number>>;
  oldestEvidenceMin: number | null;
  newestEvidenceMin: number | null;
  restrictions: string[];
}

export interface LastMileOption {
  nodeId: string;
  remainingKm: number; // straight-line remaining distance (simulated geometry)
  path: RoutePath;
  blockingSegments: { segmentId: string; reason: string }[];
  evidenceSummary: string;
}

export interface RouteResult {
  id: string;
  at: number;
  from: string;
  to: string;
  vehicle: Vehicle;
  mode: RouteMode;
  found: boolean;
  best?: RoutePath;
  alternatives: RoutePath[];
  blockedAvoided: string[]; // confirmed blocked segments on the naive shortest path
  excluded: { segmentId: string; reason: string }[];
  explanation: string[];
  lastMile: LastMileOption[];
  computeMs: number;
}

export type RouteSummary = Pick<RouteResult, 'id' | 'at' | 'mode' | 'found' | 'from' | 'to' | 'vehicle'> & {
  segments: string[];
  lengthKm?: number;
  estMinutes?: number;
  uncertain: number;
};

export type TaskStatus = 'Pending' | 'Assigned' | 'In progress' | 'Verified' | 'Rejected' | 'Escalated' | 'Closed';
export const TASK_STATUSES: TaskStatus[] = ['Pending', 'Assigned', 'In progress', 'Verified', 'Rejected', 'Escalated', 'Closed'];

export interface VerificationTask {
  id: string;
  segmentId: string;
  reason: 'conflict' | 'unverified_hazard' | 'stale' | 'sensor_alert' | 'legacy_id' | 'offline_conflict';
  description: string;
  relatedEvidence: string[];
  priority: Priority;
  assignee?: string;
  createdAt: number;
  dueAt: number;
  status: TaskStatus;
  result?: { condition: ObservedCondition; category?: HazardCategory; restrictsTo?: Vehicle[] };
  notes: { at: number; by: string; text: string }[];
  closedAt?: number;
  verifiedAt?: number;
}

export interface SensorDevice {
  id: string;
  name: string;
  segmentId: string;
  kind: 'water_level';
  warnCm: number;
  criticalCm: number;
  maxPlausibleCm: number;
  expectedIntervalMin: number;
  connected: boolean;
  hardware: 'simulated' | 'esp32';
  calibrationNote: string;
}

export interface SensorReading {
  id: string;
  sensorId: string;
  at: number;
  valueCm: number;
  flag: 'ok' | 'warn' | 'critical' | 'out_of_range';
  origin: 'sensor-sim' | 'esp32';
}

export type AuditType =
  | 'report_created'
  | 'report_queued'
  | 'status_change'
  | 'verification'
  | 'task_created'
  | 'task_updated'
  | 'assignment'
  | 'route_calculated'
  | 'incident_created'
  | 'incident_updated'
  | 'sensor_alert'
  | 'sensor_reading'
  | 'offline_sync'
  | 'resolution'
  | 'config_change'
  | 'scenario'
  | 'system';

export interface AuditEvent {
  id: string;
  type: AuditType;
  at: number; // simulated clock
  wallAt: number; // browser wall clock
  recordId: string;
  source: 'simulated' | 'demo-user' | 'system' | 'sensor-sim';
  actor: string;
  details: string;
}

export type UserRole = 'coordinator' | 'field_verifier' | 'local_authority' | 'observer';
export const ROLE_LABEL: Record<UserRole, string> = {
  coordinator: 'Emergency Coordinator',
  field_verifier: 'Field Verifier',
  local_authority: 'Local Authority',
  observer: 'Read-Only Observer',
};

export interface EvidenceConfig {
  /** Hours after which an observation of a hazard category is considered stale. */
  hazardFreshnessH: Record<HazardCategory, number>;
  passableFreshnessH: number; // normal roads
  passableFloodProneFreshnessH: number; // flood-prone roads
  duplicateWindowMin: number;
  waterWarnCm: number; // test threshold for manual water-level readings
  penalties: Record<'STALE_EVIDENCE' | 'UNKNOWN' | 'POTENTIAL_HAZARD' | 'CONFLICTING_EVIDENCE', number>;
}

export interface OfflineState {
  online: boolean;
  lastSyncAt: number;
  queue: HazardReport[];
  remoteInbox: EvidenceRecord[]; // simulated records that "arrive" on next sync
  syncLog: { at: number; applied: number; conflicts: number; unmatched: number; details: string }[];
}

export interface CostItem {
  id: string;
  item: string;
  category: 'software' | 'hosting' | 'hardware' | 'operations';
  qty: number;
  unitInr: number;
  note: string;
}

export interface AppState {
  version: number;
  now: number; // simulated clock (ms)
  role: UserRole;
  junctions: Junction[];
  segments: RoadSegment[];
  evidence: EvidenceRecord[];
  reports: HazardReport[];
  incidents: EmergencyIncident[];
  units: ResponseUnit[];
  personnel: string[];
  tasks: VerificationTask[];
  sensors: SensorDevice[];
  readings: SensorReading[];
  audit: AuditEvent[];
  routes: RouteResult[];
  config: EvidenceConfig;
  offline: OfflineState;
  costs: CostItem[];
  counters: Record<string, number>;
  activeScenario?: string;
}

export interface SegmentAssessment {
  segmentId: string;
  status: SegmentStatus;
  confidence: Confidence;
  reasons: string[];
  latest?: EvidenceRecord;
  considered: EvidenceRecord[];
  conflicting: EvidenceRecord[];
  duplicates: string[];
  staleIds: string[];
  vehicleLimits: Vehicle[] | null; // null = no evidence-based limitation
  latestAgeMin: number | null;
  waterAlert?: number;
}

export interface DemoScenario {
  id: string;
  title: string;
  summary: string;
  steps: string[];
  expected: string;
}

export interface TestCase {
  id: string;
  name: string;
  category: string;
  expected: string;
}

export interface TestResult extends TestCase {
  passed: boolean;
  observed: string;
  ms: number;
  baseline?: { usesBlocked: number; uncertain: number; lengthKm: number | null };
  proposed?: { usesBlocked: number; uncertain: number; lengthKm: number | null; found: boolean };
}
