import JSZip from 'jszip';
import type { ProposalContent } from '../proposal/types.js';
import type { LegalEntity } from './legal-entities.js';
import { serviceLineLabel } from './labels.js';
import { VALIDITY_DAYS, EXCLUSIONS, BASE_TERMS } from './commercials-content.js';
import { LETTERHEAD_DOCX_BASE64 } from './assets/letterhead-docx.js';
import { title, heading, para, bullet, table } from './docx-xml.js';

function buildBodyXml(content: ProposalContent, entity: LegalEntity): string {
  const parts: string[] = [];

  parts.push(title(`Commercial Proposal — ${content.company}`));
  parts.push(para(`Prepared for ${content.contactName}.`));

  // Effort table
  parts.push(heading('Estimated effort'));
  if (content.effort.aiLeverageNote) parts.push(para(content.effort.aiLeverageNote));
  const rows = content.effort.lines.map((l) => [serviceLineLabel(l.serviceLine), l.basis, String(l.manDays)]);
  rows.push(['Total', '', String(content.effort.totalManDays)]);
  parts.push(table(['Service line', 'Scope basis', 'Effort (man-days)'], rows));

  // Pricing
  parts.push(heading('Proposed commercials'));
  parts.push(para(content.commercials?.text ?? 'Indicative pricing to be confirmed after a short scoping call.'));

  // Validity
  parts.push(heading('Validity'));
  parts.push(para(`This commercial proposal is valid for ${VALIDITY_DAYS} days from the date of issue.`));

  // Payment terms (entity-specific)
  parts.push(heading('Payment terms'));
  parts.push(para(entity.paymentTerms));

  // Billing entity block — exactly one tax line (or none for US)
  parts.push(heading('Billing entity'));
  parts.push(para(`Entity: ${entity.legalName}`));
  parts.push(para(`Address: ${entity.address}`));
  if (entity.taxLabel && entity.taxValue) parts.push(para(`${entity.taxLabel}: ${entity.taxValue}`));

  // Exclusions
  parts.push(heading('Exclusions'));
  for (const e of EXCLUSIONS) parts.push(bullet(e));

  // Terms (shared + entity governing law)
  parts.push(heading('Standard terms & conditions'));
  for (const t of BASE_TERMS) parts.push(bullet(t));
  parts.push(bullet(entity.governingLaw));

  // Signatory
  parts.push(para(entity.signatory, { size: 18 }));
  parts.push(para('sales@networkintelligence.ai · networkintelligence.ai', { size: 18 }));

  return parts.join('');
}

/**
 * Build the commercial proposal as a Word .docx on the real NII letterhead.
 * The branded header (EMF logo) and footers are preserved; only the document body
 * is replaced with generated content, keeping the trailing <w:sectPr> intact so the
 * header/footer references survive.
 */
export async function buildCommercialsLetterhead(content: ProposalContent, entity: LegalEntity): Promise<Buffer> {
  const zip = await JSZip.loadAsync(Buffer.from(LETTERHEAD_DOCX_BASE64, 'base64'));
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('letterhead template missing word/document.xml');
  const doc = await docFile.async('string');

  const bodyOpen = doc.indexOf('<w:body>');
  const sectStart = doc.lastIndexOf('<w:sectPr');
  const bodyEnd = doc.indexOf('</w:body>');
  if (bodyOpen === -1 || sectStart === -1 || bodyEnd === -1 || sectStart > bodyEnd) {
    throw new Error('letterhead template has an unexpected document.xml shape');
  }
  const head = doc.slice(0, bodyOpen + '<w:body>'.length);
  const sectPr = doc.slice(sectStart, bodyEnd); // <w:sectPr ...>...</w:sectPr>

  const rebuilt = `${head}${buildBodyXml(content, entity)}${sectPr}</w:body></w:document>`;
  zip.file('word/document.xml', rebuilt);

  const out = await zip.generateAsync({ type: 'nodebuffer' });
  return Buffer.from(out);
}
