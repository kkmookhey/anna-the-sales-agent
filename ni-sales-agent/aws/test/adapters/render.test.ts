import { describe, it, expect, vi } from 'vitest';
import { RenderClient } from '../../src/adapters/render.js';

describe('RenderClient', () => {
  it('invokes the function and returns decoded PDF bytes', async () => {
    const pdf = Buffer.from('%PDF-1.7 hello');
    const payload = JSON.stringify({ pdfBase64: pdf.toString('base64') });
    const send = vi.fn().mockResolvedValue({ Payload: new TextEncoder().encode(payload) });
    const client = new RenderClient({ send } as never, 'ni-sales-render');

    const out = await client.render({ titleLine: 'x' } as never);
    expect(out.subarray(0, 5).toString()).toBe('%PDF-');
    expect(send).toHaveBeenCalledOnce();
  });

  it('throws if the function returned a function error', async () => {
    const send = vi.fn().mockResolvedValue({ FunctionError: 'Unhandled', Payload: new TextEncoder().encode('{}') });
    const client = new RenderClient({ send } as never, 'ni-sales-render');
    await expect(client.render({} as never)).rejects.toThrow(/render lambda/i);
  });
});
