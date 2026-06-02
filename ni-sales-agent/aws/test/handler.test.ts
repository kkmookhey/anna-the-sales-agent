import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/orchestrator/loop.js', () => ({
  runLoop: vi.fn().mockResolvedValue({ processed: 1, staged: 1, advanced: 0, disqualified: 0, flagged: 0 }),
}));
vi.mock('../src/bootstrap.js', () => ({
  buildDeps: vi.fn().mockResolvedValue({ config: { dryRun: false } }),
}));

import { handler } from '../src/handler.js';
import { runLoop } from '../src/orchestrator/loop.js';

describe('handler', () => {
  it('builds deps, runs the loop, and returns the summary', async () => {
    const res = await handler();
    expect(runLoop).toHaveBeenCalledOnce();
    expect(res.staged).toBe(1);
  });
});
