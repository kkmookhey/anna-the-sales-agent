import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import type { ProposalContent } from '../proposal/types.js';
import { serviceLineLabel } from './labels.js';
import { PO_ENTITY, VALIDITY_DAYS, PAYMENT_TERMS, EXCLUSIONS, TERMS } from './commercials-content.js';

export async function buildCommercialsDocx(content: ProposalContent): Promise<Buffer> {
  const h = (t: string) =>
    new Paragraph({ text: t, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 120 } });
  const p = (t: string) =>
    new Paragraph({ children: [new TextRun(t)], spacing: { after: 120 } });
  const bullet = (t: string) =>
    new Paragraph({ text: t, bullet: { level: 0 } });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Network Intelligence', heading: HeadingLevel.TITLE }),
          new Paragraph({
            children: [new TextRun({ text: `Commercial Proposal — ${content.company}`, bold: true, size: 28 })],
            spacing: { after: 240 },
          }),
          h('Proposed commercials'),
          p(content.commercials?.text ?? 'Indicative pricing to be confirmed after a short scoping call.'),
          ...content.serviceLines.map((s) => bullet(serviceLineLabel(s))),
          h('Validity'),
          p(`This commercial proposal is valid for ${VALIDITY_DAYS} days from the date of issue.`),
          h('Payment terms'),
          p(PAYMENT_TERMS),
          h('Purchase order — billing entity'),
          p(`Entity: ${PO_ENTITY.name}`),
          p(`Address: ${PO_ENTITY.address}`),
          p(`GSTIN: ${PO_ENTITY.gstin}`),
          p(`PAN: ${PO_ENTITY.pan}`),
          h('Exclusions'),
          ...EXCLUSIONS.map(bullet),
          h('Standard terms & conditions'),
          ...TERMS.map(bullet),
          new Paragraph({
            children: [
              new TextRun({
                text: 'Network Intelligence · sales@networkintelligence.ai · networkintelligence.ai',
                size: 18,
              }),
            ],
            spacing: { before: 360 },
          }),
        ],
      },
    ],
  });

  const buf = await Packer.toBuffer(doc);
  return Buffer.from(buf);
}
