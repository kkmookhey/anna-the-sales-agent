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
});
