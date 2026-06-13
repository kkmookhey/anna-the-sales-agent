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

/** System prompt for a retry after an invalid/truncated JSON response. */
function retrySystem(system: string): string {
  return `${system}\n\nYour previous response was not valid, complete JSON. Return EXACTLY one complete, fully-escaped JSON object and nothing else — no prose, no code fences.`;
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
    const MAX_ATTEMPTS = 2;
    let tokens = maxTokens;
    let sys = system;
    let lastErr: unknown;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const isLast = attempt === MAX_ATTEMPTS - 1;
      const res = await this.client.send(
        new ConverseCommand({
          modelId: this.modelId,
          system: [{ text: sys }],
          messages: [{ role: 'user', content: [{ text: userContext }] }],
          inferenceConfig: { maxTokens: tokens, temperature: 0.2 },
        }),
      );
      const text = res.output?.message?.content?.[0]?.text ?? '';

      // A truncated response can't be parsed. Retry with more room, or — if this was the last
      // try — surface the truncation cause (clearer than the parse error it would otherwise throw).
      if (res.stopReason === 'max_tokens') {
        lastErr = new Error('Model response truncated at max_tokens');
        if (isLast) throw lastErr;
        tokens *= 2;
        sys = retrySystem(system);
        continue;
      }

      try {
        return JSON.parse(extractJson(text)) as T;
      } catch (err) {
        lastErr = err;
        if (isLast) throw err;
        tokens *= 2;
        sys = retrySystem(system);
      }
    }
    // Unreachable: every loop iteration returns, throws, or continues. Kept for the type checker.
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }
}
