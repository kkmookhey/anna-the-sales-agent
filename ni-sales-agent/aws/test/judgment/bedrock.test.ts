import { describe, it, expect, vi } from 'vitest';
import { BedrockJudge } from '../../src/judgment/bedrock.js';

function fakeClient(responseText: string) {
  return {
    send: vi.fn().mockResolvedValue({
      output: { message: { content: [{ text: responseText }] } },
    }),
  } as unknown as import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient;
}

describe('BedrockJudge', () => {
  it('parses the JSON object the model returns', async () => {
    const judge = new BedrockJudge(fakeClient('{"sufficient": true, "missing": []}'), 'model-id');
    const out = await judge.askJson<{ sufficient: boolean; missing: string[] }>('sys', 'ctx');
    expect(out.sufficient).toBe(true);
  });

  it('extracts JSON even when wrapped in prose/code fences', async () => {
    const judge = new BedrockJudge(
      fakeClient('Here is the result:\n```json\n{"sufficient": false, "missing": ["roles"]}\n```'),
      'model-id',
    );
    const out = await judge.askJson<{ sufficient: boolean; missing: string[] }>('sys', 'ctx');
    expect(out.missing).toEqual(['roles']);
  });

  it('throws when no JSON object is present', async () => {
    const judge = new BedrockJudge(fakeClient('sorry, no'), 'model-id');
    await expect(judge.askJson('sys', 'ctx')).rejects.toThrow(/no JSON/i);
  });
});
