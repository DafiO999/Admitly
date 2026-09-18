import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, open as openFile, rename, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Transform, type Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { FileStorage, StagedFileDeletion, StoredFile } from '../../application/ports/file-storage.js';
import { AttachmentTooLargeError, InvalidFileError } from '../../application/ports/letter-attachment-repository.js';
import { matchesAttachmentSignature } from '../../domain/letter/attachment.js';

const storageKeyPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(directory: string) {
    this.root = resolve(directory);
    const publicDirectories = [resolve('public'), resolve('frontend/public'), resolve('frontend/.next/static')];
    if (publicDirectories.some((directoryPath) => this.root === directoryPath
      || this.root.startsWith(`${directoryPath}/`) || this.root.startsWith(`${directoryPath}\\`))) {
      throw new Error('Attachment storage must be private');
    }
  }

  private pathFor(storageKey: string): string {
    if (!storageKeyPattern.test(storageKey)) throw new InvalidFileError();
    return join(this.root, storageKey);
  }

  async save(input: Parameters<FileStorage['save']>[0]): Promise<StoredFile> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await chmod(this.root, 0o700);
    const storageKey = randomUUID();
    const path = this.pathFor(storageKey);
    const hash = createHash('sha256');
    let sizeBytes = 0;
    let header = Buffer.alloc(0);
    const inspect = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        sizeBytes += chunk.length;
        if (sizeBytes > input.maxBytes) {
          callback(new AttachmentTooLargeError());
          return;
        }
        hash.update(chunk);
        if (header.length < 8) header = Buffer.concat([header, chunk.subarray(0, 8 - header.length)]);
        callback(null, chunk);
      },
    });
    const destination = await openFile(path, 'wx', 0o600);
    try {
      await pipeline(input.stream, inspect, destination.createWriteStream());
      if (sizeBytes === 0 || !matchesAttachmentSignature(input.mimeType, header)) throw new InvalidFileError();
      return { storageKey, sizeBytes, sha256: hash.digest('hex') };
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
  }

  async open(storageKey: string): Promise<Readable> {
    const path = this.pathFor(storageKey);
    await stat(path);
    return createReadStream(path);
  }

  async delete(storageKey: string): Promise<void> {
    await rm(this.pathFor(storageKey), { force: true });
  }

  async stageDelete(storageKey: string): Promise<StagedFileDeletion> {
    const path = this.pathFor(storageKey);
    const stagedPath = join(this.root, `${storageKey}.deleting-${randomUUID()}`);
    await rename(path, stagedPath);
    return {
      commit: async () => { await rm(stagedPath); },
      rollback: async () => { await rename(stagedPath, path); },
    };
  }
}
