import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

/** Pull the first balanced top-level JSON object out of a model response.
 *  String-aware: braces inside quoted string values (and `\"` escapes) do not affect depth. */
export function extractJson(text: string): string {
  const start = text.indexOf('{');
  if (start === -1) throw new Error('Model response contained no JSON object');
  let depth = 0;
  let inString = false;
  let escaped = false; // `escaped`/`inString` are only meaningful inside a string value
  // indexOf('{') guarantees we start outside any string, so inString begins false
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  throw new Error('Model response contained no balanced JSON object');
}

export class BedrockJudge {
  constructor(
    private readonly client: BedrockRuntimeClient,
    private readonly modelId: string,
  ) {}

  static fromEnv(region: string, modelId: string): BedrockJudge {
    return new BedrockJudge(new BedrockRuntimeClient({ region }), modelId);
  }

  async askJson<T>(system: string, userContext: string, maxTokens = 2000): Promise<T> {
    const res = await this.client.send(
      new ConverseCommand({
        modelId: this.modelId,
        system: [{ text: system }],
        messages: [{ role: 'user', content: [{ text: userContext }] }],
        inferenceConfig: { maxTokens, temperature: 0.2 },
      }),
    );
    const text = res.output?.message?.content?.[0]?.text ?? '';
    return JSON.parse(extractJson(text)) as T;
  }
}
