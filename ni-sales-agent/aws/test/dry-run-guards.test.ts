import { describe, it, expect, vi } from 'vitest';
import { dryRunRepo, dryRunS3, dryRunHubspot } from '../src/dry-run-guards.js';
import type { Deal } from '../src/state/types.js';

describe('dryRunRepo', () => {
  it('no-ops writes (putDeal/putMeta) and passes reads through', async () => {
    const real = {
      listDeals: vi.fn().mockResolvedValue([{ deal_id: 'x' }]),
      getDeal: vi.fn().mockResolvedValue({ deal_id: 'x' }),
      getMeta: vi.fn().mockResolvedValue('v'),
      putDeal: vi.fn().mockResolvedValue(undefined),
      putMeta: vi.fn().mockResolvedValue(undefined),
    };
    const repo = dryRunRepo(real);

    await repo.putDeal({ deal_id: 'x' } as Deal);
    await repo.putMeta('k', 'v');
    expect(real.putDeal).not.toHaveBeenCalled();
    expect(real.putMeta).not.toHaveBeenCalled();

    expect(await repo.listDeals()).toEqual([{ deal_id: 'x' }]);
    expect(await repo.getDeal('x')).toEqual({ deal_id: 'x' });
    expect(await repo.getMeta('k')).toBe('v');
    expect(real.listDeals).toHaveBeenCalledOnce();
    expect(real.getDeal).toHaveBeenCalledWith('x');
    expect(real.getMeta).toHaveBeenCalledWith('k');
  });
});

describe('dryRunS3', () => {
  it('no-ops put and returns a dry-run pseudo-URI', async () => {
    const real = { put: vi.fn().mockResolvedValue('s3://real/proposals/x.pdf') };
    const s3 = dryRunS3(real);

    const uri = await s3.put('proposals/x.pdf', Buffer.from('pdf'), 'application/pdf');
    expect(real.put).not.toHaveBeenCalled();
    expect(typeof uri).toBe('string');
    expect(uri).toBe('s3://dry-run/proposals/x.pdf');
  });
});

describe('dryRunHubspot', () => {
  it('no-ops createDeal and returns a dry-run pseudo-id', async () => {
    const real = { createDeal: vi.fn().mockResolvedValue('99887766') };
    const hubspot = dryRunHubspot(real);

    const id = await hubspot.createDeal({
      dealname: 'Acme — pentest', pipeline: 'default', dealstage: '1', hubspot_owner_id: '2',
    });
    expect(real.createDeal).not.toHaveBeenCalled();
    expect(typeof id).toBe('string');
    expect(id).toBe('dry-run');
  });
});
