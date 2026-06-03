import { mkdirSync, writeFileSync } from 'node:fs';
import { renderProposalHtml } from './template.js';
import { htmlToPdf } from './pdf.js';
import type { ProposalContent } from '../proposal/types.js';

const content: ProposalContent = {
  company: 'Novelty Wealth', contactName: 'Shashank Agrawal',
  serviceLines: ['pentest_mobile', 'pentest_api', 'compliance'],
  titleLine: 'Mobile Application VAPT Proposal for Novelty Wealth',
  understanding: ['SEBI-regulated investment advisory', 'CERT-In report needed within 30 days'],
  scopeRows: [
    { line: 'Mobile VAPT', detail: 'Android + iOS, ~95 screens (OWASP MASVS/MSTG)' },
    { line: 'API/backend', detail: 'Endpoints consumed by the app' },
  ],
  assumptions: ['~95 screens as stated', 'Builds + credentials provided'],
  approach: ['OWASP MASVS/MSTG', 'Authenticated testing with SSL pinning enabled'],
  deliverables: ['CERT-In compliant report with remediation', 'Re-test of fixed findings'],
  timeline: '~4 weeks including re-test',
  whyNi: ['BFSI/fintech testing experience', '550+ security professionals'],
  credentials: ['CREST Accredited', 'CERT-In Empanelled', 'PCI QSA & PIN Assessor', 'HITRUST Assessor', 'ISO 27001'],
  transilienceEdge: ['Continuous, AI-managed pen testing', 'Findings prioritised by exploitability'],
  commercials: { mode: 'placeholder', text: 'Indicative pricing to be confirmed after a short scoping call.' },
  nextSteps: ['Sign NDA', 'Share builds + credentials', 'Kick-off call'],
};

async function main(): Promise<void> {
  const pdf = await htmlToPdf(renderProposalHtml(content));
  mkdirSync('out', { recursive: true });
  writeFileSync('out/sample-proposal.pdf', pdf);
  console.log(`Wrote out/sample-proposal.pdf (${pdf.length} bytes)`);
}
main();
