import { describe, it, expect, vi } from 'vitest';
import { DealRepo } from '../../src/state/repo.js';

function repoReturning(item: unknown) {
  const send = vi.fn().mockResolvedValue({ Item: item });
  return new DealRepo({ send } as never, 'tbl');
}

describe('DealRepo intake back-compat', () => {
  it('defaults intake to direct/verified when an older record lacks it', async () => {
    const legacy = { deal_id: 'c1', stage: 'NEW', company: 'X' }; // no `intake`
    const deal = await repoReturning(legacy).getDeal('c1');
    expect(deal?.intake).toEqual({ source: 'direct', recipient_verified: true });
  });

  it('preserves an existing intake block', async () => {
    const withIntake = { deal_id: 'c2', intake: { source: 'forwarded', recipient_verified: false, proposed_recipient: 'p@co.com' } };
    const deal = await repoReturning(withIntake).getDeal('c2');
    expect(deal?.intake.source).toBe('forwarded');
    expect(deal?.intake.proposed_recipient).toBe('p@co.com');
  });
});
