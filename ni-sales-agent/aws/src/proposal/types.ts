export interface ScopeRow {
  line: string;
  detail: string;
}

export interface Commercials {
  mode: 'fixed' | 'range' | 'placeholder';
  text: string;
}

export interface StatHighlight { value: string; label: string }
export interface Pillar { title: string; body: string }
export interface Signal { title: string; detail: string }
export interface ApproachPhase { name: string; detail: string }
export interface CtaStep { when: string; title: string; detail: string }

export interface EffortLine { serviceLine: string; basis: string; manDays: number }
export interface Effort {
  lines: EffortLine[];
  totalManDays: number;
  aiLeverageNote: string;
  isLarge: boolean; // totalManDays > 10 — Slice 2 methodology-deck trigger
}

export interface FrameworkCrosswalkRow { area: string; frameworks: string[]; evidence: string }
export interface TimelineDay { day: string; milestone: string }
export interface ServiceMethodologyBlock {
  serviceLine: string;
  phases: { name: string; detail: string }[];
  frameworks: string[];
  tooling: string[];
  aiAugmentation: string;
}
export interface MethodologyContent {
  operatingLoop: { name: string; detail: string }[];
  services: ServiceMethodologyBlock[];
  aiHighlights: { stat: string; label: string }[];
  crosswalk: FrameworkCrosswalkRow[];
  timeline: TimelineDay[];
  exclusions: string[];
}

export interface ProposalContent {
  company: string;
  contactName: string;
  serviceLines: string[];
  titleLine: string;
  understanding: string[];
  scopeRows: ScopeRow[];
  assumptions: string[];
  approach: string[];
  deliverables: string[];
  timeline: string;
  whyNi: string[];
  credentials: string[];
  transilienceEdge: string[];
  commercials: Commercials;
  nextSteps: string[];
  understandingStats: StatHighlight[];
  pillars: Pillar[];
  signals: Signal[];
  approachPhases: ApproachPhase[];
  ctaSteps: CtaStep[];
  effort: Effort;
  rfp: boolean;
}
