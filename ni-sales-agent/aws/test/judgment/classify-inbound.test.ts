import { describe, it, expect, vi } from 'vitest';
import { JudgmentService } from '../../src/judgment/judgment.js';

describe('classifyInbound', () => {
  it('passes the full body and asks for the classification shape', async () => {
    const askJson = vi.fn().mockResolvedValue({
      category: 'forwarded_enquiry',
      original_sender: { name: 'Priya', email: 'priya@acmebank.com' },
      confidence: 'high', reason: 'forwarded prospect enquiry',
    });
    const svc = new JudgmentService({ askJson } as never);

    const out = await svc.classifyInbound({
      fromName: 'KK', fromAddress: 'kk@networkintelligence.ai',
      subject: 'Fwd: pen test enquiry', body: 'FULL forwarded body with From: Priya <priya@acmebank.com>',
    });

    const [system, payload] = askJson.mock.calls[0];
    expect(system).toMatch(/enquiry/i);
    expect(system).toMatch(/forwarded_enquiry/);
    expect(system).toMatch(/not_enquiry/);
    expect(system).toMatch(/original_sender/);
    expect(payload).toContain('FULL forwarded body');
    expect(out.category).toBe('forwarded_enquiry');
    expect(out.original_sender?.email).toBe('priya@acmebank.com');
  });

  it('instructs that an internal NI colleague tasking the agent counts as an enquiry', async () => {
    const askJson = vi.fn().mockResolvedValue({ category: 'enquiry', confidence: 'high', reason: 'x' });
    const svc = new JudgmentService({ askJson } as never);
    await svc.classifyInbound({
      fromName: 'Sudeep', fromAddress: 'sudeep.kumar@networkintelligence.ai',
      subject: 'RFQ from ADNOC', body: 'help me build a proposal',
    });
    const system = askJson.mock.calls[0][0] as string;
    // Internal-colleague work requests must be treated like client enquiries.
    expect(system).toMatch(/internal/i);
    expect(system).toMatch(/colleague|NI staff|team member/i);
    // Internal origin ALONE must not force not_enquiry.
    expect(system).toMatch(/origin alone|alone never|regardless of (whether the sender is )?internal/i);
  });

  it('still instructs disqualifying genuine noise (automated, OOO, newsletters, vendor pitches, collateral requests)', async () => {
    const askJson = vi.fn().mockResolvedValue({ category: 'not_enquiry', confidence: 'high', reason: 'x' });
    const svc = new JudgmentService({ askJson } as never);
    await svc.classifyInbound({
      fromName: 'Anisha', fromAddress: 'anisha.dongre@networkintelligence.ai',
      subject: 'Pitch Idea', body: 'send me the pitch deck',
    });
    const system = askJson.mock.calls[0][0] as string;
    expect(system).toMatch(/out-of-office/i);
    expect(system).toMatch(/newsletter/i);
    expect(system).toMatch(/marketing collateral|pitch deck|collateral/i);
    expect(system).toMatch(/vendors? (marketing|pitching)/i);
  });
});
