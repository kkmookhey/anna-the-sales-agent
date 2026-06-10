import type { ProposalContent } from '../proposal/types.js';
import { renderProposalHtml } from './template.js';
import { htmlToPdf } from './pdf.js';
import { buildCommercialsDocx } from './commercials.js';
import { parseDocument, type ParseResult } from './parse.js';

export interface RenderEvent { content: ProposalContent }
export interface RenderResult { pdfBase64: string; docxBase64: string }

export interface ParseEvent {
  action: 'parse';
  file: { name: string; contentType: string; bytesBase64: string };
}

export type WorkerEvent = RenderEvent | ParseEvent;

function isParse(event: WorkerEvent): event is ParseEvent {
  return (event as ParseEvent)?.action === 'parse';
}

export async function handler(event: WorkerEvent): Promise<RenderResult | ParseResult> {
  if (isParse(event)) {
    if (!event.file) return { name: '', text: '', truncated: false, error: 'parse: missing file' };
    const { name, contentType, bytesBase64 } = event.file;
    return parseDocument({ name, contentType, bytes: Buffer.from(bytesBase64, 'base64') });
  }
  // Default: render (backward compatible with existing { content } invocations).
  if (!event?.content) throw new Error('render: missing content');
  const [pdf, docx] = await Promise.all([
    htmlToPdf(renderProposalHtml(event.content)),
    buildCommercialsDocx(event.content),
  ]);
  return { pdfBase64: pdf.toString('base64'), docxBase64: docx.toString('base64') };
}
