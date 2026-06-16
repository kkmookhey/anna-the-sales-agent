import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import type { ProposalContent } from '../proposal/types.js';
import type { LegalEntity } from '../render/legal-entities.js';

export interface ParsedAttachment { name: string; text: string; truncated: boolean; error?: string }

export class RenderClient {
  constructor(
    private readonly lambda: LambdaClient,
    private readonly functionName: string,
  ) {}

  static fromEnv(functionName: string, region: string): RenderClient {
    return new RenderClient(new LambdaClient({ region }), functionName);
  }

  async render(content: ProposalContent, entity?: LegalEntity): Promise<{ pdf: Buffer; docx: Buffer }> {
    const res = await this.lambda.send(new InvokeCommand({
      FunctionName: this.functionName,
      Payload: new TextEncoder().encode(JSON.stringify({ content, entity })),
    }));
    const text = res.Payload ? new TextDecoder().decode(res.Payload) : '';
    if (res.FunctionError) throw new Error(`render lambda failed: ${res.FunctionError} ${text}`);
    if (!text) throw new Error('render lambda returned empty payload');
    const parsed = JSON.parse(text) as { pdfBase64?: string; docxBase64?: string };
    if (!parsed.pdfBase64) throw new Error(`render lambda returned no pdfBase64: ${text}`);
    if (!parsed.docxBase64) throw new Error(`render lambda returned no docxBase64: ${text}`);
    return { pdf: Buffer.from(parsed.pdfBase64, 'base64'), docx: Buffer.from(parsed.docxBase64, 'base64') };
  }

  /** Invoke the worker's parse action to extract text from one attachment. */
  async parseAttachment(file: { name: string; contentType: string; bytes: Buffer }): Promise<ParsedAttachment> {
    const payload = { action: 'parse', file: { name: file.name, contentType: file.contentType, bytesBase64: file.bytes.toString('base64') } };
    const res = await this.lambda.send(new InvokeCommand({
      FunctionName: this.functionName,
      Payload: new TextEncoder().encode(JSON.stringify(payload)),
    }));
    const text = res.Payload ? new TextDecoder().decode(res.Payload) : '';
    if (res.FunctionError) throw new Error(`parse lambda failed: ${res.FunctionError} ${text}`);
    if (!text) throw new Error('parse lambda returned empty payload');
    const parsed = JSON.parse(text) as ParsedAttachment;
    // A worker {error} result has text:'' (a string) and passes through correctly — this guard
    // only rejects a truly malformed payload that lacks both text and error.
    if (typeof parsed.text !== 'string' && !parsed.error) throw new Error(`parse lambda returned no text: ${text}`);
    return { name: parsed.name ?? file.name, text: parsed.text ?? '', truncated: parsed.truncated ?? false, error: parsed.error };
  }
}
