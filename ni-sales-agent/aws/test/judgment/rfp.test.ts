import { describe, it, expect } from 'vitest';
import { JudgmentService } from '../../src/judgment/judgment.js';
import type { BedrockJudge } from '../../src/judgment/bedrock.js';

function fakeJudge(payload: unknown): BedrockJudge {
  return { askJson: async () => payload } as unknown as BedrockJudge;
}
const base = {
  titleLine: 'X', understanding: [], scopeRows: [], assumptions: [], approach: [], deliverables: [],
  timeline: '', whyNi: [], credentials: [], transilienceEdge: [], commercials: { mode: 'placeholder', text: '' },
  nextSteps: [], understandingStats: [], pillars: [], signals: [], approachPhases: [], ctaSteps: [],
  effort: { lines: [], totalManDays: 0, aiLeverageNote: '', isLarge: false },
};

describe('buildProposalContent rfp', () => {
  it('passes through rfp:true', async () => {
    const svc = new JudgmentService(fakeJudge({ ...base, rfp: true }));
    const c = await svc.buildProposalContent({ company: 'X', contactName: 'Y', serviceLines: [], scope: {}, assumptions: [] });
    expect(c.rfp).toBe(true);
  });
  it('defaults a missing/non-boolean rfp to false', async () => {
    const svc = new JudgmentService(fakeJudge(base));
    const c = await svc.buildProposalContent({ company: 'X', contactName: 'Y', serviceLines: [], scope: {}, assumptions: [] });
    expect(c.rfp).toBe(false);
  });
});
