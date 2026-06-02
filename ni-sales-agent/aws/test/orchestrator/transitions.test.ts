import { describe, it, expect } from 'vitest';
import { decideTransition } from '../../src/orchestrator/transitions.js';
import type { Deal } from '../../src/state/types.js';
import { emptyScope } from '../../src/state/types.js';

function deal(partial: Partial<Deal>): Deal {
  return {
    deal_id: 'c1', stage: 'NEW', company: 'Acme', contact_name: 'Sam',
    contact_email: 'sam@acme.example', service_lines: [], created_at: '2026-06-01T00:00:00Z',
    last_inbound_id: 'm0', last_inbound_at: '2026-06-01T00:00:00Z', next_followup_date: null,
    followup_count: 0, scope: emptyScope(), assumptions: [], proposal: null, actions: [], flags: [],
    ...partial,
  };
}

const now = new Date('2026-06-10T09:00:00Z');

describe('decideTransition', () => {
  it('NEW -> stage scoping email', () => {
    const t = decideTransition(deal({ stage: 'NEW' }), { newInbound: false, replySent: false }, now, { maxFollowups: 3, cadenceDays: [3, 7, 14] });
    expect(t).toEqual({ kind: 'STAGE_SCOPING', nextStage: 'SCOPING_PENDING_APPROVAL' });
  });

  it('SCOPING_PENDING_APPROVAL advances only once the human sent the draft', () => {
    const pending = deal({ stage: 'SCOPING_PENDING_APPROVAL' });
    expect(decideTransition(pending, { newInbound: false, replySent: false }, now, { maxFollowups: 3, cadenceDays: [3, 7, 14] }))
      .toEqual({ kind: 'NOOP' });
    expect(decideTransition(pending, { newInbound: false, replySent: true }, now, { maxFollowups: 3, cadenceDays: [3, 7, 14] }))
      .toEqual({ kind: 'ADVANCE', nextStage: 'SCOPING_SENT' });
  });

  it('SCOPING_SENT -> SCOPE_REVIEW when the prospect replied', () => {
    expect(decideTransition(deal({ stage: 'SCOPING_SENT' }), { newInbound: true, replySent: false }, now, { maxFollowups: 3, cadenceDays: [3, 7, 14] }))
      .toEqual({ kind: 'ADVANCE', nextStage: 'SCOPE_REVIEW' });
  });

  it('PROPOSAL_SENT with a due cadence mark stages a follow-up', () => {
    const d = deal({ stage: 'PROPOSAL_SENT', followup_count: 0, next_followup_date: '2026-06-09T09:00:00Z' });
    expect(decideTransition(d, { newInbound: false, replySent: false }, now, { maxFollowups: 3, cadenceDays: [3, 7, 14] }))
      .toEqual({ kind: 'STAGE_FOLLOWUP', nextStage: 'FOLLOWUP_PENDING_APPROVAL' });
  });

  it('PROPOSAL_SENT past max follow-ups with no reply -> STALLED', () => {
    const d = deal({ stage: 'PROPOSAL_SENT', followup_count: 3, next_followup_date: '2026-06-09T09:00:00Z' });
    expect(decideTransition(d, { newInbound: false, replySent: false }, now, { maxFollowups: 3, cadenceDays: [3, 7, 14] }))
      .toEqual({ kind: 'ADVANCE', nextStage: 'STALLED' });
  });

  it('PO_PENDING_APPROVAL writes HubSpot once SHIP-IT is detected', () => {
    const d = deal({ stage: 'PO_PENDING_APPROVAL' });
    expect(decideTransition(d, { newInbound: false, replySent: false, approvalDetected: true }, now, { maxFollowups: 3, cadenceDays: [3, 7, 14] }))
      .toEqual({ kind: 'WRITE_HUBSPOT', nextStage: 'WON' });
    expect(decideTransition(d, { newInbound: false, replySent: false, approvalDetected: false }, now, { maxFollowups: 3, cadenceDays: [3, 7, 14] }))
      .toEqual({ kind: 'NOOP' });
  });

  it('terminal stages never transition', () => {
    for (const s of ['MEETING_BOOKED', 'STALLED', 'DISQUALIFIED', 'WON'] as const) {
      expect(decideTransition(deal({ stage: s }), { newInbound: true, replySent: true, approvalDetected: true }, now, { maxFollowups: 3, cadenceDays: [3, 7, 14] }))
        .toEqual({ kind: 'NOOP' });
    }
  });
});
