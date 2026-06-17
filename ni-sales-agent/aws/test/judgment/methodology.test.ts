import { describe, it, expect } from 'vitest';
import { JudgmentService } from '../../src/judgment/judgment.js';
import type { BedrockJudge } from '../../src/judgment/bedrock.js';

function fakeJudge(payload: unknown): BedrockJudge {
  return { askJson: async () => payload } as unknown as BedrockJudge;
}

describe('buildMethodologyContent', () => {
  const full = {
    operatingLoop: [{ name: 'Assess', detail: 'd' }],
    services: [{ serviceLine: 'pentest_web', phases: [{ name: 'Recon', detail: 'd' }], frameworks: ['OWASP WSTG'], tooling: ['Burp'], aiAugmentation: 'a' }],
    aiHighlights: [{ stat: '16k→10', label: 'noise cut' }],
    crosswalk: [{ area: 'Web', frameworks: ['OWASP'], evidence: 'report' }],
    timeline: [{ day: 'Day 1', milestone: 'kickoff' }],
    exclusions: ['no remediation'],
  };

  it('returns the MethodologyContent shape', async () => {
    const svc = new JudgmentService(fakeJudge(full));
    const m = await svc.buildMethodologyContent({
      company: 'X', contactName: 'Y', serviceLines: ['pentest_web'],
      scope: {}, effortLines: [{ serviceLine: 'pentest_web', basis: '2 apps', manDays: 6 }], totalManDays: 6,
    });
    expect(m.services[0].serviceLine).toBe('pentest_web');
    expect(m.operatingLoop.length).toBe(1);
    expect(m.timeline[0].day).toBe('Day 1');
  });

  it('defaults all arrays to [] when the model omits them', async () => {
    const svc = new JudgmentService(fakeJudge({}));
    const m = await svc.buildMethodologyContent({
      company: 'X', contactName: 'Y', serviceLines: [], scope: {}, effortLines: [], totalManDays: 0,
    });
    expect(m.services).toEqual([]);
    expect(m.operatingLoop).toEqual([]);
    expect(m.crosswalk).toEqual([]);
    expect(m.timeline).toEqual([]);
    expect(m.exclusions).toEqual([]);
    expect(m.aiHighlights).toEqual([]);
  });
});
