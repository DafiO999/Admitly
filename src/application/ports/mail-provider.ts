import type { Readable } from 'node:stream';
import type { AttachmentMimeType } from '../../domain/letter/attachment.js';

export interface SendMailInput {
  to: string;
  replyTo: { name: string; email: string };
  subject: string;
  body: string;
  attachments: {
    filename: string; mimeType: AttachmentMimeType; content: Readable;
  }[];
}

export interface SendMailResult {
  providerMessageId: string | null;
}

export interface MailProvider {
  send(input: SendMailInput): Promise<SendMailResult>;
}

export class MailProviderUnavailableError extends Error {
  constructor() { super('Mail provider unavailable'); this.name = 'MailProviderUnavailableError'; }
}

export class MailDeliveryError extends Error {
  constructor(public readonly state: 'failed' | 'ambiguous') {
    super('Mail delivery failed');
    this.name = 'MailDeliveryError';
  }
}
