import { describe, it, expect } from 'vitest';
import { renderPipelineBoard } from '../../src/canvas/board.js';
import type { Deal } from '../../src/state/types.js';
import { emptyScope } from '../../src/state/types.js';

function deal(p: Partial<Deal>): Deal {
  return {
    deal_id: 'c', stage: 'NEW', company: 'Acme', contact_name: 'Sam', contact_email: 's@a.example',
    service_lines: [], created_at: '2026-06-02T00:00:00Z', last_inbound_id: 'm', last_inbound_at: '2026-06-02T10:00:00Z',
    next_followup_date: null, followup_count: 0, scope: emptyScope(), assumptions: [], proposal: null, actions: [], flags: [],
    ...p,
  };
}

describe('renderPipelineBoard', () => {
  it('groups deals by stage with counts and a row per deal', () => {
    const md = renderPipelineBoard(
      [
        deal({ deal_id: '1', company: 'Novelty Wealth', stage: 'SCOPING_PENDING_APPROVAL', service_lines: ['pentest_mobile'] }),
        deal({ deal_id: '2', company: 'Acme', stage: 'PROPOSAL_SENT' }),
      ],
      '2026-06-02T15:00:00Z',
    );
    expect(md).toContain('# NI Sales — Pipeline');
    expect(md).toContain('Awaiting scoping approval (1)');
    expect(md).toContain('Proposal sent (1)');
    expect(md).toContain('| Novelty Wealth |');
    expect(md).toContain('pentest_mobile');
  });

  it('shows an empty-state line when there are no deals', () => {
    expect(renderPipelineBoard([], '2026-06-02T15:00:00Z')).toContain('No active deals');
  });
});
