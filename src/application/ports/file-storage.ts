import type { Readable } from 'node:stream';
import type { AttachmentMimeType } from '../../domain/letter/attachment.js';

export interface StoredFile {
  storageKey: string;
  sizeBytes: number;
  sha256: string;
}

export interface StagedFileDeletion {
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export interface FileStorage {
  save(input: {
    stream: Readable; filename: string; mimeType: AttachmentMimeType; maxBytes: number;
  }): Promise<StoredFile>;
  open(storageKey: string): Promise<Readable>;
  delete(storageKey: string): Promise<void>;
  stageDelete(storageKey: string): Promise<StagedFileDeletion>;
}
