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

describe('BedrockJudge.askJson resilience', () => {
  /** A client whose send returns each queued response in order. */
  function sequencedClient(responses: Array<{ text: string; stopReason?: string }>) {
    const send = vi.fn();
    for (const r of responses) {
      send.mockResolvedValueOnce({
        output: { message: { content: [{ text: r.text }] } },
        stopReason: r.stopReason,
      });
    }
    return { send, judge: new BedrockJudge({ send } as never, 'model-x') };
  }

  it('retries once with a doubled budget when the first response is truncated', async () => {
    const { send, judge } = sequencedClient([
      { text: '{"a": 1', stopReason: 'max_tokens' },
      { text: '{"a": 1}', stopReason: 'end_turn' },
    ]);
    const out = await judge.askJson<{ a: number }>('sys', 'ctx', 2000);
    expect(out).toEqual({ a: 1 });
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].input.inferenceConfig.maxTokens).toBe(4000);
  });

  it('retries once when the first response is unparseable, then succeeds', async () => {
    const { send, judge } = sequencedClient([
      { text: 'sorry, here you go' },
      { text: '{"ok": true}' },
    ]);
    const out = await judge.askJson<{ ok: boolean }>('sys', 'ctx');
    expect(out).toEqual({ ok: true });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('throws after two failed attempts (no unbounded retry)', async () => {
    const { send, judge } = sequencedClient([
      { text: 'nope' },
      { text: 'still nope' },
    ]);
    await expect(judge.askJson('sys', 'ctx')).rejects.toThrow(/no JSON/i);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('does not retry when the first response parses', async () => {
    const { send, judge } = sequencedClient([{ text: '{"a": 1}' }]);
    await judge.askJson('sys', 'ctx');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('extractJson', () => {
  it('throws a clear error on truncated/unbalanced JSON', () => {
    expect(() => extractJson('{"a":1, "b":')).toThrow(/balanced JSON/);
  });

  it('ignores braces that appear inside string values', () => {
    const out = extractJson('{"a": "x } y { z", "b": 2}');
    expect(JSON.parse(out)).toEqual({ a: 'x } y { z', b: 2 });
  });

  it('handles escaped quotes inside string values', () => {
    const out = extractJson('{"msg": "she said \\"hi\\" }"}');
    expect(JSON.parse(out)).toEqual({ msg: 'she said "hi" }' });
  });

  it('extracts a balanced object embedded in surrounding prose', () => {
    const out = extractJson('result: {"html": "<div>{x}</div>"} done');
    expect(JSON.parse(out)).toEqual({ html: '<div>{x}</div>' });
  });

  it('handles a literal backslash before a closing quote', () => {
    const out = extractJson('{"path": "C:\\\\tmp\\\\"}');
    expect(JSON.parse(out)).toEqual({ path: 'C:\\tmp\\' });
  });
});
