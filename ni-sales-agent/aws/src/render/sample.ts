import { mkdirSync, writeFileSync } from 'node:fs';
import { renderProposalHtml } from './template.js';
import { htmlToPdf } from './pdf.js';
import { buildCommercialsLetterhead } from './commercials-letterhead.js';
import { resolveEntity } from './legal-entities.js';
import type { ProposalContent } from '../proposal/types.js';

const content: ProposalContent = {
  company: 'IICA', contactName: 'IT Department',
  serviceLines: ['pentest_web', 'compliance'],
  titleLine: 'Web Application Security Audit',
  understanding: ['Public government website on the NIC platform', 'CERT-In + GIGW 3.0 audit required'],
  scopeRows: [
    { line: 'Web application VAPT', detail: 'All 11 modules across ~150–250 pages, to OWASP Top 10, ASVS, PTES, NIST 800-115, CERT-In.' },
    { line: 'Admin / CMS module', detail: 'Authenticated testing of the content-management and administrator interface.' },
    { line: 'Input flows & interfaces', detail: 'The 40–60 dynamic pages — registration forms, email/social integrations, payment gateway if present.' },
    { line: 'Configuration & GIGW 3.0', detail: 'Server, TLS and app configuration review + GIGW 3.0 compliance mapping.' },
  ],
  assumptions: ['~150–250 pages as stated', 'Test credentials provided for the admin/CMS module'],
  approach: ['OWASP Top 10 / ASVS', 'CERT-In guidelines', 'GIGW 3.0 mapping'],
  deliverables: ['CERT-In-compliant audit report', 'GIGW 3.0 compliance mapping', 'Prioritised remediation guidance', 'Re-audit + safe-to-host certificate'],
  timeline: '~2–3 weeks to first report; re-audit after remediation',
  whyNi: ['CERT-In empanelled & GIGW-experienced', '25+ years, 550+ professionals, 200+ engagements/yr', 'Transilience AI prioritises findings by exploitability'],
  credentials: ['CREST Accredited', 'CERT-In Empanelled', 'PCI QSA', 'PCI PIN Assessor', 'HITRUST Assessor', 'ISO 27001', 'SOC 2 Type II'],
  transilienceEdge: [],
  understandingStats: [
    { value: '150–250', label: 'Total pages' },
    { value: '40–60', label: 'Dynamic / input pages' },
    { value: '11', label: 'Modules incl. CMS / Admin' },
    { value: 'GIGW 3.0', label: '+ CERT-In compliance' },
  ],
  pillars: [
    { title: 'CERT-In empanelled & GIGW-fluent', body: 'An empanelled auditor (mandatory for government audits) with hands-on GIGW 3.0 experience.' },
    { title: 'Full surface, admin included', body: 'All 11 modules, the dynamic input flows, and the authenticated CMS/Admin module — tested to OWASP, PTES and NIST 800-115.' },
    { title: 'Remediation-driven, audit-ready', body: 'VAPT plus one re-audit after remediation, a CERT-In-compliant report, and a safe-to-host sign-off.' },
  ],
  signals: [
    { title: 'Stack', detail: 'ASP.NET / C# on Windows Server 2012, IIS, SQL Server backend. Admin CMS in scope.' },
    { title: 'Surface', detail: 'Internet-facing, public. No end-user login; Content-Editor & Administrator roles via the CMS.' },
    { title: 'Interfaces', detail: 'Email services, social links, registration forms, payment gateway if course registrations use one.' },
    { title: 'Timeline', detail: 'Start on award; complete in 2–3 weeks; one re-audit after remediation.' },
  ],
  approachPhases: [
    { name: 'Recon & mapping', detail: 'Crawl and map all modules, pages and input flows; confirm scope, credentials and the admin surface.' },
    { name: 'Test', detail: 'Authenticated + unauthenticated testing to OWASP Top 10 / ASVS, PTES, NIST 800-115 and CERT-In.' },
    { name: 'Report', detail: 'CERT-In-compliant report with risk-rated findings, reproduction steps, remediation, and a GIGW 3.0 mapping.' },
    { name: 'Re-audit', detail: 'Re-test fixed findings after remediation; issue a safe-to-host sign-off.' },
  ],
  ctaSteps: [
    { when: 'This week', title: 'Kickoff call', detail: 'Confirm scope, test credentials and the admin/CMS surface; align on the GIGW 3.0 report format.' },
    { when: 'On award', title: 'Access & scope sign-off', detail: 'Share the test environment and credentials; lock the final page/module count and fee.' },
    { when: 'Immediately after', title: 'Audit start', detail: 'Testing begins at once; first report in ~2–3 weeks, with a re-audit after remediation.' },
  ],
  effort: {
    lines: [{ serviceLine: 'pentest_web', basis: '3 web apps', manDays: 7 }],
    totalManDays: 7,
    aiLeverageNote: 'Effort reflects AI-augmented delivery via the Transilience platform.',
    isLarge: false,
  },
  commercials: { mode: 'placeholder', text: 'Indicative pricing to be confirmed on a short scoping call.' },
  nextSteps: [],
};

async function main(): Promise<void> {
  const pdf = await htmlToPdf(renderProposalHtml(content));
  mkdirSync('out', { recursive: true });
  writeFileSync('out/sample-proposal.pdf', pdf);
  console.log(`Wrote out/sample-proposal.pdf (${pdf.length} bytes)`);
  writeFileSync('out/sample-commercials.docx', await buildCommercialsLetterhead(content, resolveEntity('UAE').entity));
  console.log('Wrote out/sample-commercials.docx');
}
main();
