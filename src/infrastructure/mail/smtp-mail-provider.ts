import { createTransport } from 'nodemailer';
import type { MailProvider, SendMailInput, SendMailResult } from '../../application/ports/mail-provider.js';
import { MailDeliveryError } from '../../application/ports/mail-provider.js';

interface SMTPClient {
  sendMail(message: {
    from: { name: string; address: string };
    replyTo: { name: string; address: string };
    to: string;
    subject: string;
    text: string;
    attachments: { filename: string; contentType: string; content: SendMailInput['attachments'][number]['content'] }[];
    disableFileAccess: true;
    disableUrlAccess: true;
  }): Promise<{ accepted: (string | { address: string })[]; messageId?: string }>;
}

export interface SMTPSettings {
  host: string; port: number; secure: boolean;
  user: string; password: string; fromEmail: string; fromName: string;
}

export class SMTPMailProvider implements MailProvider {
  private readonly client: SMTPClient;

  constructor(private readonly settings: SMTPSettings, client?: SMTPClient) {
    this.client = client ?? createTransport({
      host: settings.host, port: settings.port, secure: settings.secure,
      auth: { user: settings.user, pass: settings.password },
      requireTLS: !settings.secure,
      connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000,
    });
  }

  async send(input: SendMailInput): Promise<SendMailResult> {
    try {
      const result = await this.client.sendMail({
        from: { name: this.settings.fromName, address: this.settings.fromEmail },
        replyTo: { name: input.replyTo.name, address: input.replyTo.email },
        to: input.to,
        subject: input.subject,
        text: input.body,
        attachments: input.attachments.map((attachment) => ({
          filename: attachment.filename, contentType: attachment.mimeType, content: attachment.content,
        })),
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      const accepted = result.accepted.some((recipient) =>
        (typeof recipient === 'string' ? recipient : recipient.address).toLowerCase() === input.to.toLowerCase());
      if (!accepted) throw new MailDeliveryError('failed');
      return { providerMessageId: result.messageId || null };
    } catch (error) {
      if (error instanceof MailDeliveryError) throw error;
      // A transport exception can occur after SMTP accepted DATA. Keep this attempt ambiguous.
      throw new MailDeliveryError('ambiguous');
    }
  }
}
