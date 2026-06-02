import type { Deal, Stage } from '../state/types.js';

export interface Signals {
  newInbound: boolean;
  replySent: boolean;
  approvalDetected?: boolean;
}

export interface Policy {
  maxFollowups: number;
  cadenceDays: number[];
}

export type Transition =
  | { kind: 'NOOP' }
  | { kind: 'STAGE_SCOPING'; nextStage: Stage }
  | { kind: 'STAGE_CLARIFY'; nextStage: Stage }
  | { kind: 'STAGE_PROPOSAL'; nextStage: Stage }
  | { kind: 'STAGE_FOLLOWUP'; nextStage: Stage }
  | { kind: 'WRITE_HUBSPOT'; nextStage: Stage }
  | { kind: 'ADVANCE'; nextStage: Stage };

export function decideTransition(deal: Deal, s: Signals, now: Date, policy: Policy): Transition {
  switch (deal.stage) {
    case 'NEW':
      return { kind: 'STAGE_SCOPING', nextStage: 'SCOPING_PENDING_APPROVAL' };

    case 'SCOPING_PENDING_APPROVAL':
      return s.replySent ? { kind: 'ADVANCE', nextStage: 'SCOPING_SENT' } : { kind: 'NOOP' };

    case 'SCOPING_SENT':
      return s.newInbound ? { kind: 'ADVANCE', nextStage: 'SCOPE_REVIEW' } : { kind: 'NOOP' };

    case 'SCOPE_REVIEW':
      return { kind: 'NOOP' };

    case 'PROPOSAL_PENDING_APPROVAL':
      return s.replySent ? { kind: 'ADVANCE', nextStage: 'PROPOSAL_SENT' } : { kind: 'NOOP' };

    case 'PROPOSAL_SENT':
      return decideProposalSent(deal, s, now, policy);

    case 'FOLLOWUP_PENDING_APPROVAL':
      return s.replySent ? { kind: 'ADVANCE', nextStage: 'PROPOSAL_SENT' } : { kind: 'NOOP' };

    case 'PO_PENDING_APPROVAL':
      return s.approvalDetected ? { kind: 'WRITE_HUBSPOT', nextStage: 'WON' } : { kind: 'NOOP' };

    case 'MEETING_BOOKED':
    case 'STALLED':
    case 'DISQUALIFIED':
    case 'WON':
      return { kind: 'NOOP' };
  }
}

function decideProposalSent(deal: Deal, s: Signals, now: Date, policy: Policy): Transition {
  if (s.newInbound) return { kind: 'NOOP' };
  const due = deal.next_followup_date !== null && new Date(deal.next_followup_date) <= now;
  if (!due) return { kind: 'NOOP' };
  if (deal.followup_count >= policy.maxFollowups) {
    return { kind: 'ADVANCE', nextStage: 'STALLED' };
  }
  return { kind: 'STAGE_FOLLOWUP', nextStage: 'FOLLOWUP_PENDING_APPROVAL' };
}

export function resolveScopeReview(sufficient: boolean): Transition {
  return sufficient
    ? { kind: 'STAGE_PROPOSAL', nextStage: 'PROPOSAL_PENDING_APPROVAL' }
    : { kind: 'STAGE_CLARIFY', nextStage: 'SCOPING_PENDING_APPROVAL' };
}

export type ProposalReplyKind = 'meeting' | 'po' | 'clarification' | 'none';

export function resolveProposalReply(kind: ProposalReplyKind): Transition {
  switch (kind) {
    case 'meeting':
      return { kind: 'ADVANCE', nextStage: 'MEETING_BOOKED' };
    case 'po':
      return { kind: 'ADVANCE', nextStage: 'PO_PENDING_APPROVAL' };
    case 'clarification':
      return { kind: 'STAGE_FOLLOWUP', nextStage: 'FOLLOWUP_PENDING_APPROVAL' };
    case 'none':
      return { kind: 'NOOP' };
  }
}
