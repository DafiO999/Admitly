import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { SMTPMailProvider } from '../../src/infrastructure/mail/smtp-mail-provider.js';

const settings = {
  host: 'smtp.example.test', port: 587, secure: false,
  user: 'account', password: 'private-password',
  fromEmail: 'letters@example.test', fromName: 'Admitly',
};

describe('SMTP mail provider', () => {
  it('uses the fixed sender and streams only the intended message and attachment', async () => {
    let message: Record<string, unknown> | undefined;
    const provider = new SMTPMailProvider(settings, {
      sendMail: async (input) => {
        message = input;
        const chunks: Buffer[] = [];
        for await (const chunk of input.attachments[0]!.content) chunks.push(Buffer.from(chunk));
        expect(Buffer.concat(chunks).toString()).toBe('%PDF-1.4\nprivate certificate\n');
        return { accepted: ['admissions@example.edu'], messageId: '<provider-id@example.test>' };
      },
    });
    const result = await provider.send({
      to: 'admissions@example.edu', replyTo: { name: 'Alex Student', email: 'alex@example.com' },
      subject: 'Final edited subject', body: 'Final edited body',
      attachments: [{ filename: 'certificate.pdf', mimeType: 'application/pdf',
        content: Readable.from([Buffer.from('%PDF-1.4\nprivate certificate\n')]) }],
    });
    expect(result).toEqual({ providerMessageId: '<provider-id@example.test>' });
    expect(message).toMatchObject({
      from: { name: 'Admitly', address: 'letters@example.test' },
      replyTo: { name: 'Alex Student', address: 'alex@example.com' },
      to: 'admissions@example.edu', subject: 'Final edited subject', text: 'Final edited body',
      disableFileAccess: true, disableUrlAccess: true,
      attachments: [{ filename: 'certificate.pdf', contentType: 'application/pdf' }],
    });
    expect(JSON.stringify(message)).not.toContain('private-password');
  });

  it('classifies rejected recipients and masks transport exceptions', async () => {
    const input = { to: 'admissions@example.edu', replyTo: { name: 'Alex Student', email: 'alex@example.com' },
      subject: 'Subject', body: 'Body', attachments: [] };
    const rejected = new SMTPMailProvider(settings, {
      sendMail: async () => ({ accepted: [], messageId: 'ignored' }),
    });
    await expect(rejected.send(input)).rejects.toMatchObject({ name: 'MailDeliveryError', state: 'failed' });
    const broken = new SMTPMailProvider(settings, {
      sendMail: async () => { throw new Error('SMTP secret provider message'); },
    });
    await expect(broken.send(input)).rejects.toMatchObject({ name: 'MailDeliveryError', state: 'ambiguous' });
  });
});
