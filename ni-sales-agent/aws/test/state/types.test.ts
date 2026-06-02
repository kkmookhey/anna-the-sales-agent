import { describe, it, expect } from 'vitest';
import { STAGES, isStage, emptyScope } from '../../src/state/types.js';

describe('deal types', () => {
  it('lists every stage from the CLAUDE.md state machine', () => {
    expect(STAGES).toContain('NEW');
    expect(STAGES).toContain('PO_PENDING_APPROVAL');
    expect(STAGES).toContain('WON');
    expect(STAGES).toHaveLength(12);
  });

  it('isStage validates known stages', () => {
    expect(isStage('SCOPE_REVIEW')).toBe(true);
    expect(isStage('NOPE')).toBe(false);
  });

  it('emptyScope returns all-null scope with empty service_lines', () => {
    expect(emptyScope()).toEqual({
      service_lines: [],
      asset_count: null,
      environment: null,
      compliance_driver: null,
      timeline: null,
      prior_testing: null,
      access_model: null,
      authority_signal: null,
      region: null,
    });
  });
});
