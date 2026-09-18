import { createHash } from 'node:crypto';
import { readdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { sanitizeAttachmentFilename } from '../../src/domain/letter/attachment.js';
import { LocalFileStorage } from '../../src/infrastructure/storage/local-file-storage.js';

const pdf = Buffer.from('%PDF-1.4\nprivate certificate\n');

describe('private local attachment storage', () => {
  it('uses random keys, hashes bytes, and stages deletions reversibly', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'admitly-files-'));
    const storage = new LocalFileStorage(directory);
    try {
      const saved = await storage.save({
        stream: Readable.from([pdf]), filename: '../../certificate.pdf',
        mimeType: 'application/pdf', maxBytes: 1000,
      });
      expect(saved.storageKey).toMatch(/^[0-9a-f-]{36}$/);
      expect(saved.storageKey).not.toContain('certificate');
      expect(saved.sizeBytes).toBe(pdf.length);
      expect(saved.sha256).toBe(createHash('sha256').update(pdf).digest('hex'));
      expect(await readdir(directory)).toEqual([saved.storageKey]);
      const chunks: Buffer[] = [];
      for await (const chunk of await storage.open(saved.storageKey)) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks)).toEqual(pdf);

      const staged = await storage.stageDelete(saved.storageKey);
      await expect(storage.open(saved.storageKey)).rejects.toThrow();
      await staged.rollback();
      expect(await readdir(directory)).toEqual([saved.storageKey]);
      const stagedAgain = await storage.stageDelete(saved.storageKey);
      await stagedAgain.commit();
      expect(await readdir(directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects traversal, invalid signatures and oversized streams without leftover files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'admitly-files-'));
    const storage = new LocalFileStorage(directory);
    try {
      expect(sanitizeAttachmentFilename('..\\..\\secret\r\n.pdf')).toBe('secret.pdf');
      await expect(storage.open('../secret')).rejects.toThrow();
      await expect(storage.delete('../secret')).rejects.toThrow();
      await expect(storage.stageDelete('../secret')).rejects.toThrow();
      await expect(storage.save({ stream: Readable.from([Buffer.from('not a PDF')]),
        filename: 'x.pdf', mimeType: 'application/pdf', maxBytes: 1000 })).rejects.toThrow();
      await expect(storage.save({ stream: Readable.from([pdf]),
        filename: 'x.pdf', mimeType: 'application/pdf', maxBytes: 5 })).rejects.toMatchObject({
        name: 'AttachmentTooLargeError',
      });
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
      const savedJpeg = await storage.save({ stream: Readable.from([jpeg]),
        filename: 'a.jpg', mimeType: 'image/jpeg', maxBytes: 1000 });
      const savedPng = await storage.save({ stream: Readable.from([png]),
        filename: 'b.png', mimeType: 'image/png', maxBytes: 1000 });
      await storage.delete(savedJpeg.storageKey);
      await storage.delete(savedPng.storageKey);
      expect(await readdir(directory)).toEqual([]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
