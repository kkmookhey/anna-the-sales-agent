import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import type { ProposalContent } from '../proposal/types.js';

export class RenderClient {
  constructor(
    private readonly lambda: LambdaClient,
    private readonly functionName: string,
  ) {}

  static fromEnv(functionName: string, region: string): RenderClient {
    return new RenderClient(new LambdaClient({ region }), functionName);
  }

  async render(content: ProposalContent): Promise<{ pdf: Buffer; docx: Buffer }> {
    const res = await this.lambda.send(new InvokeCommand({
      FunctionName: this.functionName,
      Payload: new TextEncoder().encode(JSON.stringify({ content })),
    }));
    const text = res.Payload ? new TextDecoder().decode(res.Payload) : '';
    if (res.FunctionError) throw new Error(`render lambda failed: ${res.FunctionError} ${text}`);
    if (!text) throw new Error('render lambda returned empty payload');
    const parsed = JSON.parse(text) as { pdfBase64?: string; docxBase64?: string };
    if (!parsed.pdfBase64) throw new Error(`render lambda returned no pdfBase64: ${text}`);
    if (!parsed.docxBase64) throw new Error(`render lambda returned no docxBase64: ${text}`);
    return { pdf: Buffer.from(parsed.pdfBase64, 'base64'), docx: Buffer.from(parsed.docxBase64, 'base64') };
  }
}
