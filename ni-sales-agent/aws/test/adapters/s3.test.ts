import { describe, it, expect, vi } from 'vitest';
import { DeckStore } from '../../src/adapters/s3.js';

describe('DeckStore', () => {
  it('puts the deck with the pptx content-type and returns an s3:// uri', async () => {
    const send = vi.fn().mockResolvedValue({});
    const store = new DeckStore({ send } as unknown as import('@aws-sdk/client-s3').S3Client, 'ni-decks');
    const uri = await store.put('proposals/novelty-wealth-v1.pptx', Buffer.from('PK'));
    expect(uri).toBe('s3://ni-decks/proposals/novelty-wealth-v1.pptx');
    const cmd = send.mock.calls[0]![0];
    expect(cmd.input.Bucket).toBe('ni-decks');
    expect(cmd.input.Key).toBe('proposals/novelty-wealth-v1.pptx');
    expect(cmd.input.ContentType).toContain('presentationml.presentation');
  });
});
