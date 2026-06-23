import { describe, it, expect, vi } from 'vitest';
import { selectDeepReferences } from '../../src/judgment/deep-references.js';
import { JudgmentService } from '../../src/judgment/judgment.js';

describe('selectDeepReferences', () => {
  it('maps offensive-security lines to the pentester deep file', () => {
    expect(selectDeepReferences(['penetration testing'])).toEqual(['deep/autonomous-pentester']);
    expect(selectDeepReferences(['VAPT'])).toEqual(['deep/autonomous-pentester']);
    expect(selectDeepReferences(['red team'])).toEqual(['deep/autonomous-pentester']);
  });

  it('maps brand / dark-web lines to the brand-darkweb deep file', () => {
    expect(selectDeepReferences(['brand monitoring'])).toEqual(['deep/brand-darkweb']);
    expect(selectDeepReferences(['dark web monitoring'])).toEqual(['deep/brand-darkweb']);
  });

  it('maps briefing lines to the ciso-threat-briefing deep file', () => {
    expect(selectDeepReferences(['CISO threat briefing'])).toEqual(['deep/ciso-threat-briefing']);
  });

  it('returns [] when nothing matches', () => {
    expect(selectDeepReferences(['mdr'])).toEqual([]);
    expect(selectDeepReferences([])).toEqual([]);
  });

  it('de-duplicates when multiple lines map to the same file', () => {
    expect(selectDeepReferences(['vapt', 'penetration testing'])).toEqual(['deep/autonomous-pentester']);
  });

  it('caps the result at two deep files, in priority order', () => {
    expect(selectDeepReferences(['red team', 'brand monitoring', 'CISO threat briefing']))
      .toEqual(['deep/autonomous-pentester', 'deep/brand-darkweb']);
  });
});

function stubJudge() {
  const askJson = vi.fn().mockResolvedValue({
    titleLine: 't', understanding: [], scopeRows: [], assumptions: [], approach: [],
    deliverables: [], timeline: '', whyNi: [], credentials: [], transilienceEdge: [],
    commercials: { mode: 'placeholder', text: 'x' }, nextSteps: [],
    understandingStats: [], pillars: [], signals: [], approachPhases: [], ctaSteps: [],
  });
  return { askJson, svc: new JudgmentService({ askJson } as never) };
}

describe('buildProposalContent deep-reference injection', () => {
  it('injects the matched deep file when a service line matches', async () => {
    const { askJson, svc } = stubJudge();
    await svc.buildProposalContent({
      company: 'Acme', contactName: 'Jo', serviceLines: ['penetration testing'], scope: {}, assumptions: [],
    });
    const system = askJson.mock.calls[0][0] as string;
    expect(system).toContain('Deep Capability References');
    expect(system).toContain('104/104');
  });

  it('does NOT inject a deep block when no service line matches', async () => {
    const { askJson, svc } = stubJudge();
    await svc.buildProposalContent({
      company: 'Acme', contactName: 'Jo', serviceLines: ['mdr'], scope: {}, assumptions: [],
    });
    const system = askJson.mock.calls[0][0] as string;
    expect(system).not.toContain('Deep Capability References');
  });

  it('keeps the assembled prompt under the cost-guard ceiling at the 2-file max', async () => {
    const { askJson, svc } = stubJudge();
    await svc.buildProposalContent({
      company: 'Acme', contactName: 'Jo',
      serviceLines: ['penetration testing', 'brand monitoring'], scope: {}, assumptions: [],
    });
    const system = askJson.mock.calls[0][0] as string;
    expect(system.length).toBeLessThan(48000);
    expect(system).toContain('104/104');
    expect(system).toContain('takedown');
  });
});
