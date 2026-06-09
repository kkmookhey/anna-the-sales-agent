import type { ProposalContent } from '../proposal/types.js';
import { renderProposalHtml } from './template.js';
import { htmlToPdf } from './pdf.js';
import { buildCommercialsDocx } from './commercials.js';

export interface RenderEvent { content: ProposalContent }
export interface RenderResult { pdfBase64: string; docxBase64: string }

export async function handler(event: RenderEvent): Promise<RenderResult> {
  if (!event?.content) throw new Error('render: missing content');
  const [pdf, docx] = await Promise.all([
    htmlToPdf(renderProposalHtml(event.content)),
    buildCommercialsDocx(event.content),
  ]);
  return { pdfBase64: pdf.toString('base64'), docxBase64: docx.toString('base64') };
}
