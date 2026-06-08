import { describe, it, expect, vi } from 'vitest';
import { JudgmentService } from '../../src/judgment/judgment.js';

describe('buildProposalContent grounding', () => {
  it('injects the capability library and requests the new output keys', async () => {
    const askJson = vi.fn().mockResolvedValue({
      titleLine: 't', understanding: [], scopeRows: [], assumptions: [], approach: [],
      deliverables: [], timeline: '', whyNi: [], credentials: ['CREST Accredited'],
      transilienceEdge: [], commercials: { mode: 'placeholder', text: 'x' }, nextSteps: [],
      understandingStats: [{ value: '150–250', label: 'Total pages' }],
      pillars: [{ title: 'CERT-In', body: 'mandatory' }],
      signals: [{ title: 'Stack', detail: 'IIS' }],
      approachPhases: [{ name: 'Recon', detail: 'map' }],
      ctaSteps: [{ when: 'This week', title: 'Kickoff', detail: 'confirm' }],
    });
    const svc = new JudgmentService({ askJson } as never);

    const out = await svc.buildProposalContent({
      company: 'Acme', contactName: 'Jo', serviceLines: ['mdr'], scope: {}, assumptions: [],
    });

    const system = askJson.mock.calls[0][0] as string;
    expect(system).toContain('Capability Library');
    expect(system).toContain('PCI PIN Assessor');
    expect(system).toMatch(/credentials \(string\[\]\)/);
    expect(system).toMatch(/transilienceEdge \(string\[\]\)/);
    expect(out.credentials).toEqual(['CREST Accredited']);
    expect(out.company).toBe('Acme');
    expect(system).toMatch(/understandingStats/);
    expect(system).toMatch(/pillars/);
    expect(system).toMatch(/signals/);
    expect(system).toMatch(/approachPhases/);
    expect(system).toMatch(/ctaSteps/);
    expect(out.pillars).toEqual([{ title: 'CERT-In', body: 'mandatory' }]);

    // buildProposalContent must request a generous token budget (≥8000) so the large
    // structured JSON is never truncated — this is the production bug being fixed.
    expect(askJson.mock.calls[0][2]).toBeGreaterThanOrEqual(8000);
  });
});
