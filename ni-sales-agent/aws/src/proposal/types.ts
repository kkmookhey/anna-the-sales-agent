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
}
