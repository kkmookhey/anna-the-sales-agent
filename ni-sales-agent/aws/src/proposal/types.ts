export interface ScopeRow {
  line: string;
  detail: string;
}

export interface Commercials {
  mode: 'fixed' | 'range' | 'placeholder';
  text: string;
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
}
