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

  it('draftFollowup forwards cadence context and instructs the final-nudge break-up', async () => {
    const askJson = vi.fn().mockResolvedValue({ draft_subject: 'Re: Proposal', draft_body_html: '<p>x</p>' });
    const svc = new JudgmentService({ askJson } as never);
    await svc.draftFollowup({
      company: 'Novelty Wealth', contactName: 'Shashank', followupNumber: 3, scopeSummary: {},
      maxFollowups: 3, isFinal: true, daysSinceProposal: 14, driver: 'CERT-In', timeline: '30 days',
      bookingUrl: 'https://cal.ni/kk',
    });
    const [system, userJson] = askJson.mock.calls[0];
    expect(system).toMatch(/isFinal/);
    expect(system).toMatch(/break-up/i);
    expect(system).toMatch(/bookingUrl/);
    const sent = JSON.parse(userJson as string);
    expect(sent).toMatchObject({ isFinal: true, maxFollowups: 3, daysSinceProposal: 14, driver: 'CERT-In', bookingUrl: 'https://cal.ni/kk' });
  });

  it('classifyProposalReply returns the model\'s classification kind', async () => {
    const svc = new JudgmentService(judgeReturning({ kind: 'po' }));
    const out = await svc.classifyProposalReply({ subject: 'Re: Proposal', reply: 'Approved — PO attached, please proceed.' });
    expect(out.kind).toBe('po');
  });

  it('content builders enforce per-field slide-copy word budgets', async () => {
    const askJson = vi.fn().mockResolvedValue({});
    const svc = new JudgmentService({ askJson } as never);
    await svc.buildProposalContent({ company: 'C', contactName: 'N', serviceLines: [], scope: {}, assumptions: [] });
    const proposalSystem = askJson.mock.calls[0][0] as string;
    expect(proposalSystem).toMatch(/SLIDE COPY BUDGET/);
    expect(proposalSystem).toMatch(/pillars\.body ≤ 20 words/);
    expect(proposalSystem).toMatch(/scopeRows\.detail ≤ 22 words/);

    askJson.mockClear();
    await svc.buildMethodologyContent({ company: 'C', contactName: 'N', serviceLines: [], scope: {}, effortLines: [], totalManDays: 0 });
    const methodologySystem = askJson.mock.calls[0][0] as string;
    expect(methodologySystem).toMatch(/SLIDE COPY BUDGET/);
    expect(methodologySystem).toMatch(/phases\[\]\.detail ≤ 18 words/);
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

describe('HTML body formatting rule', () => {
  it('instructs HTML block structure in the scoping, clarification, and follow-up prompts', async () => {
    const askJson = vi.fn().mockResolvedValue({});
    const svc = new JudgmentService({ askJson } as never);
    await svc.scopeEnquiry({ fromName: 'A', subject: 's', bodyPreview: 'b' });
    await svc.assessSufficiency({ scopeSoFar: {}, reply: 'r' });
    await svc.draftFollowup({ company: 'C', contactName: 'N', followupNumber: 1, scopeSummary: {} });
    expect(askJson).toHaveBeenCalledTimes(3);
    for (const call of askJson.mock.calls) {
      const system = call[0] as string;
      expect(system).toMatch(/valid HTML/);
      expect(system).toMatch(/<ol><li>/);
      expect(system).toMatch(/run-on paragraph/);
    }
  });
});
