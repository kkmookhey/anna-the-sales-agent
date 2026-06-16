import { describe, it, expect } from 'vitest';
import { JudgmentService } from '../../src/judgment/judgment.js';
import type { BedrockJudge } from '../../src/judgment/bedrock.js';

function fakeJudge(payload: unknown): BedrockJudge {
  // Minimal BedrockJudge stand-in: askJson returns the canned payload.
  return { askJson: async () => payload } as unknown as BedrockJudge;
}

const baseRaw = {
  titleLine: 'Web App Security', understanding: [], scopeRows: [], assumptions: [],
  approach: [], deliverables: [], timeline: '4 weeks', whyNi: [], credentials: [],
  transilienceEdge: [], commercials: { mode: 'placeholder', text: 'TBC' }, nextSteps: [],
  understandingStats: [], pillars: [], signals: [], approachPhases: [], ctaSteps: [],
};

describe('buildProposalContent effort', () => {
  it('recomputes totalManDays from lines and sets isLarge=false at 10', async () => {
    const svc = new JudgmentService(fakeJudge({
      ...baseRaw,
      effort: { lines: [{ serviceLine: 'pentest_web', basis: '2 apps', manDays: 6 },
                         { serviceLine: 'config_review', basis: '1 env', manDays: 4 }],
                totalManDays: 999, aiLeverageNote: 'AI-augmented', isLarge: false },
    }));
    const c = await svc.buildProposalContent({ company: 'X', contactName: 'Y', serviceLines: [], scope: {}, assumptions: [] });
    expect(c.effort.totalManDays).toBe(10);  // recomputed, not trusting the model's 999
    expect(c.effort.isLarge).toBe(false);     // 10 is NOT large
  });

  it('sets isLarge=true above 10 man-days', async () => {
    const svc = new JudgmentService(fakeJudge({
      ...baseRaw,
      effort: { lines: [{ serviceLine: 'red_team', basis: 'full', manDays: 11 }],
                totalManDays: 11, aiLeverageNote: 'AI-augmented', isLarge: false },
    }));
    const c = await svc.buildProposalContent({ company: 'X', contactName: 'Y', serviceLines: [], scope: {}, assumptions: [] });
    expect(c.effort.totalManDays).toBe(11);
    expect(c.effort.isLarge).toBe(true);
  });

  it('tolerates a missing effort object (defaults to empty, not large)', async () => {
    const svc = new JudgmentService(fakeJudge(baseRaw));
    const c = await svc.buildProposalContent({ company: 'X', contactName: 'Y', serviceLines: [], scope: {}, assumptions: [] });
    expect(c.effort.lines).toEqual([]);
    expect(c.effort.totalManDays).toBe(0);
    expect(c.effort.isLarge).toBe(false);
  });
});
