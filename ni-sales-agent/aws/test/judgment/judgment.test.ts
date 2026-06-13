import { describe, it, expect, vi } from 'vitest';
import { JudgmentService } from '../../src/judgment/judgment.js';
import type { BedrockJudge } from '../../src/judgment/bedrock.js';

function judgeReturning(obj: unknown): BedrockJudge {
  return { askJson: vi.fn().mockResolvedValue(obj) } as unknown as BedrockJudge;
}

const inbound = {
  fromName: 'Shashank Agrawal',
  subject: 'VAPT Enquiry',
  bodyPreview: 'Mobile VAPT for Android + iOS, CERT-In report, start in 30 days',
};

describe('JudgmentService', () => {
  it('scopeEnquiry returns service_lines and a draft subject/body', async () => {
    const svc = new JudgmentService(
      judgeReturning({
        service_lines: ['pentest_mobile', 'pentest_api', 'compliance'],
        draft_subject: 'Re: VAPT Enquiry',
        draft_body_html: '<p>Hi Shashank,</p>',
        company: 'Novelty Wealth',
        scope: {
          environment: 'Android + iOS',
          timeline: '30 days',
          asset_count: '~95 screens',
          compliance_driver: 'CERT-In',
          access_model: null,
          prior_testing: null,
          authority_signal: null,
          region: null,
        },
      }),
    );
    const out = await svc.scopeEnquiry(inbound);
    expect(out.service_lines).toContain('pentest_mobile');
    expect(out.draft_subject).toMatch(/VAPT/);
    expect(out.draft_body_html).toContain('Shashank');
    expect(out.company).toBe('Novelty Wealth');
    expect(out.scope.environment).toBe('Android + iOS');
  });

  it('assessSufficiency returns a verdict with missing fields', async () => {
    const svc = new JudgmentService(
      judgeReturning({ sufficient: false, missing: ['user roles'], assumptions: [], clarifying_subject: 'Re: VAPT', clarifying_body_html: '<p>One more thing</p>', scope_updates: { asset_count: '10 API endpoints' } }),
    );
    const out = await svc.assessSufficiency({ scopeSoFar: {}, reply: 'we use AWS' });
    expect(out.sufficient).toBe(false);
    expect(out.missing).toContain('user roles');
    expect(out.scope_updates).toBeDefined();
    expect(out.scope_updates?.asset_count).toBe('10 API endpoints');
  });

  describe('assessSufficiency contract', () => {
    it('asks for an 8000-token budget and a scope_updates delta', async () => {
      const askJson = vi.fn().mockResolvedValue({ sufficient: true, missing: [], assumptions: [], scope_updates: {} });
      const svc = new JudgmentService({ askJson } as never);
      await svc.assessSufficiency({ scopeSoFar: { asset_count: '10' }, reply: 'answers' });
      const [system, , maxTokens] = askJson.mock.calls[0];
      expect(maxTokens).toBe(8000);
      expect(system).toMatch(/scope_updates/);
      expect(system).toMatch(/only the scope fields this reply (adds|changes)/i);
    });
  });

  describe('scopeEnquiry budget', () => {
    it('asks for an 8000-token budget', async () => {
      const askJson = vi.fn().mockResolvedValue({ service_lines: [], draft_subject: '', draft_body_html: '', company: '', scope: {} });
      const svc = new JudgmentService({ askJson } as never);
      await svc.scopeEnquiry({ fromName: 'A', subject: 's', bodyPreview: 'b' });
      expect(askJson.mock.calls[0][2]).toBe(8000);
    });
  });

  it('classifyProposalReply returns the model\'s classification kind', async () => {
    const svc = new JudgmentService(judgeReturning({ kind: 'po' }));
    const out = await svc.classifyProposalReply({ subject: 'Re: Proposal', reply: 'Approved — PO attached, please proceed.' });
    expect(out.kind).toBe('po');
  });

  it('buildProposalContent merges identity fields and returns slide content', async () => {
    const svc = new JudgmentService(
      judgeReturning({
        titleLine: 'Mobile Application VAPT Proposal for Novelty Wealth',
        understanding: ['SEBI-regulated; CERT-In report needed within 30 days'],
        scopeRows: [{ line: 'Mobile VAPT', detail: 'Android + iOS, ~95 screens' }],
        assumptions: ['~95 screens as stated'],
        approach: ['OWASP MASVS/MSTG', 'Authenticated testing with SSL pinning left enabled'],
        deliverables: ['CERT-In compliant report', 'Re-test of fixed findings'],
        timeline: '~4 weeks including re-test',
        whyNi: ['CERT-In empanelled', 'BFSI/fintech experience'],
        commercials: { mode: 'placeholder', text: 'Indicative pricing to be confirmed after scoping.' },
        nextSteps: ['Sign NDA', 'Share builds + credentials'],
      }),
    );
    const out = await svc.buildProposalContent({
      company: 'Novelty Wealth',
      contactName: 'Shashank Agrawal',
      serviceLines: ['pentest_mobile', 'pentest_api', 'compliance'],
      scope: {},
      assumptions: ['~95 screens as stated'],
    });
    expect(out.company).toBe('Novelty Wealth');
    expect(out.contactName).toBe('Shashank Agrawal');
    expect(out.serviceLines).toContain('pentest_mobile');
    expect(out.commercials.mode).toBe('placeholder');
    expect(out.scopeRows[0]!.line).toBe('Mobile VAPT');
  });
});
