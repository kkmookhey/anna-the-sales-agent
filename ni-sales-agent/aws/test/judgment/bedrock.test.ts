import { describe, it, expect, vi } from 'vitest';
import { BedrockJudge, extractJson } from '../../src/judgment/bedrock.js';

function fakeClient(responseText: string) {
  return {
    send: vi.fn().mockResolvedValue({
      output: { message: { content: [{ text: responseText }] } },
    }),
  } as unknown as import('@aws-sdk/client-bedrock-runtime').BedrockRuntimeClient;
}

/** Returns a judge whose underlying send is capturable for assertion. */
function judgeCapturing() {
  const send = vi.fn().mockResolvedValue({ output: { message: { content: [{ text: '{"ok":true}' }] } } });
  const judge = new BedrockJudge({ send } as never, 'model-x');
  return { judge, send };
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

describe('BedrockJudge.askJson maxTokens', () => {
  it('defaults maxTokens to 2000', async () => {
    const { judge, send } = judgeCapturing();
    await judge.askJson('sys', 'ctx');
    // send receives a ConverseCommand; its `.input` holds the params
    expect(send.mock.calls[0][0].input.inferenceConfig.maxTokens).toBe(2000);
  });

  it('uses a provided maxTokens', async () => {
    const { judge, send } = judgeCapturing();
    await judge.askJson('sys', 'ctx', 8000);
    expect(send.mock.calls[0][0].input.inferenceConfig.maxTokens).toBe(8000);
  });
});

describe('extractJson', () => {
  it('throws a clear error on truncated/unbalanced JSON', () => {
    expect(() => extractJson('{"a":1, "b":')).toThrow(/balanced JSON/);
  });
});
