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
      }),
    );
    const out = await svc.scopeEnquiry(inbound);
    expect(out.service_lines).toContain('pentest_mobile');
    expect(out.draft_subject).toMatch(/VAPT/);
    expect(out.draft_body_html).toContain('Shashank');
  });

  it('assessSufficiency returns a verdict with missing fields', async () => {
    const svc = new JudgmentService(
      judgeReturning({ sufficient: false, missing: ['user roles'], assumptions: [], clarifying_subject: 'Re: VAPT', clarifying_body_html: '<p>One more thing</p>' }),
    );
    const out = await svc.assessSufficiency({ scopeSoFar: {}, reply: 'we use AWS' });
    expect(out.sufficient).toBe(false);
    expect(out.missing).toContain('user roles');
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
