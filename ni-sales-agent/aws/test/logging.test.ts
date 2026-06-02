import { describe, it, expect, vi } from 'vitest';
import { logger } from '../src/logging.js';

describe('logger', () => {
  it('emits a single JSON line with level, msg, and fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.info('run_start', { deals: 3 });
    const line = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('run_start');
    expect(parsed.deals).toBe(3);
    expect(typeof parsed.ts).toBe('string');
    spy.mockRestore();
  });
});
