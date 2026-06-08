import { describe, it, expect } from 'vitest';
import { renderProposalHtml, esc } from '../../src/render/template.js';
import type { ProposalContent } from '../../src/proposal/types.js';

const content: ProposalContent = {
  company: 'IICA', contactName: 'IT Department',
  serviceLines: ['pentest_web', 'compliance'],
  titleLine: 'Web Application Security Audit',
  understanding: [], scopeRows: [{ line: 'Web VAPT', detail: 'all modules' }],
  assumptions: [], approach: [], deliverables: ['CERT-In report'], timeline: '~2–3 weeks',
  whyNi: ['CERT-In empanelled'], credentials: ['CREST Accredited', 'CERT-In Empanelled'],
  transilienceEdge: [],
  understandingStats: [{ value: '150–250', label: 'Total pages' }],
  pillars: [{ title: 'CERT-In empanelled', body: 'mandatory for govt audits' }],
  signals: [{ title: 'Stack', detail: 'ASP.NET / IIS / SQL Server' }],
  approachPhases: [{ name: 'Recon', detail: 'map the application' }],
  ctaSteps: [{ when: 'This week', title: 'Kickoff call', detail: 'confirm scope' }],
  commercials: { mode: 'placeholder', text: 'Indicative pricing on a short call.' },
  nextSteps: [],
};

describe('renderProposalHtml v3', () => {
  it('emits a deck-stage document with the design system inlined', () => {
    const html = renderProposalHtml(content);
    expect(html).toContain('<deck-stage');
    expect(html).toContain('--tr-crimson');
    expect(html).toContain('.pillar-card');
    expect(html).toContain('data:font/woff2;base64,');
    expect(html).toContain('Web Application Security Audit');
  });
  it('uses human service-line labels, not raw keys', () => {
    const html = renderProposalHtml(content);
    expect(html).toContain('Web Application VAPT');
    expect(html).not.toMatch(/pentest_web/);
  });
  it('renders populated sections + a commercials pointer', () => {
    const html = renderProposalHtml(content);
    expect(html).toContain('CERT-In empanelled');
    expect(html).toContain('150–250');
    expect(html).toContain('CREST Accredited');
    expect(html).toContain('attached document');
  });
  it('omits a section when its data is empty', () => {
    const html = renderProposalHtml({ ...content, credentials: [], pillars: [] });
    expect(html).not.toContain('Credentials</h2>');
  });
  it('escapes interpolated content', () => {
    const html = renderProposalHtml({ ...content, titleLine: 'A <script> & "x"' });
    expect(html).toContain('A &lt;script&gt; &amp; &quot;x&quot;');
  });
});
