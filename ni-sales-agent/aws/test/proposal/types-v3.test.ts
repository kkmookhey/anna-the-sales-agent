import { describe, it, expect } from 'vitest';
import type { ProposalContent } from '../../src/proposal/types.js';

describe('ProposalContent v3 fields', () => {
  it('accepts the structured deck fields', () => {
    const c: Pick<ProposalContent, 'understandingStats'|'pillars'|'signals'|'approachPhases'|'ctaSteps'> = {
      understandingStats: [{ value: '150–250', label: 'Total pages' }],
      pillars: [{ title: 'CERT-In empanelled', body: 'mandatory for govt' }],
      signals: [{ title: 'Stack', detail: 'ASP.NET / IIS' }],
      approachPhases: [{ name: 'Recon', detail: 'map the app' }],
      ctaSteps: [{ when: 'This week', title: 'Kickoff', detail: 'confirm scope' }],
    };
    expect(c.pillars[0].title).toBe('CERT-In empanelled');
  });
});
