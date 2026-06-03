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

  async render(content: ProposalContent): Promise<Buffer> {
    const res = await this.lambda.send(
      new InvokeCommand({
        FunctionName: this.functionName,
        Payload: new TextEncoder().encode(JSON.stringify({ content })),
      }),
    );
    const text = res.Payload ? new TextDecoder().decode(res.Payload) : '';
    if (res.FunctionError) throw new Error(`render lambda failed: ${res.FunctionError} ${text}`);
    const parsed = JSON.parse(text) as { pdfBase64?: string };
    if (!parsed.pdfBase64) throw new Error('render lambda returned no pdfBase64');
    return Buffer.from(parsed.pdfBase64, 'base64');
  }
}
