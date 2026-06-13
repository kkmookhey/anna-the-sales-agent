export const STAGES = [
  'NEW',
  'SCOPING_PENDING_APPROVAL',
  'SCOPING_SENT',
  'SCOPE_REVIEW',
  'PROPOSAL_PENDING_APPROVAL',
  'PROPOSAL_SENT',
  'FOLLOWUP_PENDING_APPROVAL',
  'PO_PENDING_APPROVAL',
  'MEETING_BOOKED',
  'STALLED',
  'DISQUALIFIED',
  'WON',
] as const;

export type Stage = (typeof STAGES)[number];

export function isStage(s: string): s is Stage {
  return (STAGES as readonly string[]).includes(s);
}

export interface Scope {
  service_lines: string[];
  asset_count: string | null;
  environment: string | null;
  compliance_driver: string | null;
  timeline: string | null;
  prior_testing: string | null;
  access_model: string | null;
  authority_signal: string | null;
  region: string | null;
}

export function emptyScope(): Scope {
  return {
    service_lines: [],
    asset_count: null,
    environment: null,
    compliance_driver: null,
    timeline: null,
    prior_testing: null,
    access_model: null,
    authority_signal: null,
    region: null,
  };
}

export interface DealAction {
  ts: string;
  type: string;
  stage_from: Stage;
  stage_to: Stage;
  note: string;
}

export interface DealFlag {
  ts: string;
  message_id: string;
  reason: string;
}

export interface Proposal {
  deck_path: string;
  version: number;
  staged_at: string;
}

export interface Deal {
  deal_id: string;
  stage: Stage;
  company: string;
  contact_name: string;
  contact_email: string;
  service_lines: string[];
  created_at: string;
  last_inbound_id: string;
  last_inbound_at: string;
  next_followup_date: string | null;
  followup_count: number;
  scope: Scope;
  assumptions: string[];
  proposal: Proposal | null;
  parked_at?: string | null; // ISO ts when the deal was parked on an unsent draft; null/absent when not parked
  actions: DealAction[];
  flags: DealFlag[];
  intake: {
    source: 'direct' | 'forwarded';
    forwarded_by?: string;
    proposed_recipient?: string;
    recipient_verified: boolean;
  };
}
