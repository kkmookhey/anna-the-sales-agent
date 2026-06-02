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
});
