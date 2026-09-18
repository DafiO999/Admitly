import { z } from 'zod';

export const attachmentMimeTypeSchema = z.enum(['application/pdf', 'image/jpeg', 'image/png']);
export type AttachmentMimeType = z.infer<typeof attachmentMimeTypeSchema>;

export const attachmentMetadataSchema = z.object({
  id: z.uuid(),
  originalName: z.string().min(1).max(120),
  mimeType: attachmentMimeTypeSchema,
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  createdAt: z.iso.datetime(),
}).strict();
export type AttachmentMetadata = z.infer<typeof attachmentMetadataSchema>;

export function sanitizeAttachmentFilename(input: string): string {
  const basename = input.replace(/\\/g, '/').split('/').at(-1) ?? '';
  const cleaned = basename.normalize('NFKC').replace(/\p{Cc}/gu, '')
    .replace(/[^\p{L}\p{N}._ -]/gu, '_').replace(/^\.+/, '').trim().slice(0, 120);
  return cleaned || 'attachment';
}

export function matchesAttachmentSignature(mimeType: AttachmentMimeType, header: Buffer): boolean {
  if (mimeType === 'application/pdf') return header.subarray(0, 5).equals(Buffer.from('%PDF-'));
  if (mimeType === 'image/jpeg') return header.length >= 3
    && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  return header.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
}
