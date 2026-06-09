import { describe, it, expect, vi } from 'vitest';
import { RenderClient } from '../../src/adapters/render.js';

describe('RenderClient', () => {
  it('invokes the function and returns decoded PDF and DOCX bytes', async () => {
    const pdf = Buffer.from('%PDF-1.7 hello');
    const docx = Buffer.from('DOCX-content');
    const payload = JSON.stringify({ pdfBase64: pdf.toString('base64'), docxBase64: docx.toString('base64') });
    const send = vi.fn().mockResolvedValue({ Payload: new TextEncoder().encode(payload) });
    const client = new RenderClient({ send } as never, 'ni-sales-render');

    const out = await client.render({ titleLine: 'x' } as never);
    expect(out.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(out.docx.toString()).toBe('DOCX-content');
    expect(send).toHaveBeenCalledOnce();
  });

  it('throws if the function returned a function error', async () => {
    const send = vi.fn().mockResolvedValue({ FunctionError: 'Unhandled', Payload: new TextEncoder().encode('{}') });
    const client = new RenderClient({ send } as never, 'ni-sales-render');
    await expect(client.render({} as never)).rejects.toThrow(/render lambda/i);
  });

  it('throws if the payload is empty', async () => {
    const send = vi.fn().mockResolvedValue({ Payload: undefined });
    const client = new RenderClient({ send } as never, 'ni-sales-render');
    await expect(client.render({} as never)).rejects.toThrow(/empty payload/i);
  });

  it('throws if pdfBase64 is missing', async () => {
    const payload = JSON.stringify({ docxBase64: Buffer.from('x').toString('base64') });
    const send = vi.fn().mockResolvedValue({ Payload: new TextEncoder().encode(payload) });
    const client = new RenderClient({ send } as never, 'ni-sales-render');
    await expect(client.render({} as never)).rejects.toThrow(/no pdfBase64/i);
  });

  it('throws if docxBase64 is missing', async () => {
    const payload = JSON.stringify({ pdfBase64: Buffer.from('%PDF-').toString('base64') });
    const send = vi.fn().mockResolvedValue({ Payload: new TextEncoder().encode(payload) });
    const client = new RenderClient({ send } as never, 'ni-sales-render');
    await expect(client.render({} as never)).rejects.toThrow(/no docxBase64/i);
  });
});
