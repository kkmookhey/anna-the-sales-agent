import { describe, it, expect } from 'vitest';
import { renderProposalHtml } from '../../src/render/template.js';
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
  assumptions: ['~95 screens as stated', 'Builds + credentials provided'],
  approach: ['OWASP MASVS/MSTG', 'Authenticated testing'],
  deliverables: ['CERT-In compliant report', 'Re-test of fixed findings'],
  timeline: '~4 weeks including re-test',
  whyNi: ['BFSI/fintech testing experience'],
  credentials: ['CREST Accredited', 'CERT-In Empanelled', 'PCI QSA & PIN Assessor', 'HITRUST Assessor'],
  transilienceEdge: [],
  commercials: { mode: 'placeholder', text: 'Indicative pricing to be confirmed after scoping.' },
  nextSteps: ['Sign NDA', 'Share builds + credentials', 'Kick-off call'],
};

describe('renderProposalHtml', () => {
  it('produces a full HTML document with the title and a 16:9 page size', () => {
    const html = renderProposalHtml(content);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Mobile Application VAPT Proposal for Novelty Wealth');
    expect(html).toContain('size: 1280px 720px');
  });

  it('renders the must-highlight credentials', () => {
    const html = renderProposalHtml(content);
    for (const c of content.credentials) {
      const escaped = c.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      expect(html).toContain(escaped);
    }
  });

  it('embeds the brand fonts as @font-face data URIs', () => {
    const html = renderProposalHtml(content);
    expect(html).toContain("font-family: 'Jost'");
    expect(html).toContain('data:font/woff2;base64,');
  });

  it('omits a section when its content is empty (transilienceEdge)', () => {
    const html = renderProposalHtml(content);
    expect(html).not.toContain('The Transilience AI edge');
  });

  it('escapes HTML in content to prevent broken markup', () => {
    const html = renderProposalHtml({ ...content, titleLine: 'A <script> & "co"' });
    expect(html).toContain('A &lt;script&gt; &amp; &quot;co&quot;');
    expect(html).not.toContain('<script> &');
  });
});
