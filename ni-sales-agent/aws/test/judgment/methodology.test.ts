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

  it('coerces non-string model fields (e.g. numeric timeline.day) to strings', async () => {
    const svc = new JudgmentService(fakeJudge({
      operatingLoop: [{ name: 'Assess', detail: 5 }],
      services: [{ serviceLine: 'pentest_web', phases: [{ name: 'Recon', detail: 1 }], frameworks: ['OWASP WSTG', 7], tooling: [42], aiAugmentation: 9 }],
      aiHighlights: [{ stat: 95, label: 'accuracy' }],
      crosswalk: [{ area: 1, frameworks: [2], evidence: 3 }],
      timeline: [{ day: 1, milestone: 'kickoff' }], // numeric day — the real crash trigger
      exclusions: [4],
    }));
    const m = await svc.buildMethodologyContent({ company: 'X', contactName: 'Y', serviceLines: ['pentest_web'], scope: {}, effortLines: [], totalManDays: 0 });
    expect(m.timeline[0]!.day).toBe('1');
    expect(m.aiHighlights[0]!.stat).toBe('95');
    expect(m.services[0]!.frameworks).toEqual(['OWASP WSTG', '7']);
    expect(m.services[0]!.tooling).toEqual(['42']);
    expect(m.services[0]!.aiAugmentation).toBe('9');
    expect(m.crosswalk[0]!.evidence).toBe('3');
    expect(m.exclusions).toEqual(['4']);
    expect(m.operatingLoop[0]!.detail).toBe('5');
  });
});
