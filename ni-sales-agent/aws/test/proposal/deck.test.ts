import { describe, it, expect } from 'vitest';
import { renderDeck } from '../../src/proposal/deck.js';
import type { ProposalContent } from '../../src/proposal/types.js';

const content: ProposalContent = {
  company: 'Novelty Wealth',
  contactName: 'Shashank Agrawal',
  serviceLines: ['pentest_mobile', 'pentest_api', 'compliance'],
  titleLine: 'Mobile Application VAPT Proposal for Novelty Wealth',
  understanding: ['SEBI-regulated investment advisory', 'CERT-In report needed within 30 days'],
  scopeRows: [
    { line: 'Mobile VAPT', detail: 'Android + iOS, ~95 screens (OWASP MASVS/MSTG)' },
    { line: 'API/backend', detail: 'Endpoints consumed by the app' },
  ],
  assumptions: ['~95 screens as stated', 'Builds + credentials provided for authenticated testing'],
  approach: ['OWASP MASVS/MSTG', 'Authenticated testing with SSL pinning left enabled'],
  deliverables: ['CERT-In compliant report with remediation', 'Re-test of fixed findings'],
  timeline: '~4 weeks including re-test',
  whyNi: ['CERT-In empanelled auditor', 'BFSI/fintech testing experience'],
  credentials: ['CREST Accredited', 'CERT-In Empanelled', 'PCI QSA & PIN Assessor', 'HITRUST Assessor'],
  transilienceEdge: [],
  commercials: { mode: 'placeholder', text: 'Indicative pricing to be confirmed after scoping.' },
  nextSteps: ['Sign NDA', 'Share builds + credentials', 'Kick-off call'],
};

describe('renderDeck', () => {
  it('produces a valid .pptx buffer (ZIP signature)', async () => {
    const buf = await renderDeck(content);
    expect(buf.length).toBeGreaterThan(2000);
    expect(buf[0]).toBe(0x50); // 'P'
    expect(buf[1]).toBe(0x4b); // 'K' — ZIP/OOXML magic
  });

  it('does not throw on empty optional sections', async () => {
    const sparse: ProposalContent = { ...content, whyNi: [], assumptions: [], nextSteps: [] };
    await expect(renderDeck(sparse)).resolves.toBeInstanceOf(Buffer);
  });
});
