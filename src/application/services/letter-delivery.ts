import { z } from 'zod';
import type { Readable } from 'node:stream';
import type { FileStorage } from '../ports/file-storage.js';
import type { LetterDeliveryRepository, SendAttemptRecord } from '../ports/letter-delivery-repository.js';
import {
  LetterAlreadySentError, LetterNotReadyError, LetterSendInProgressError,
} from '../ports/letter-delivery-repository.js';
import { LetterNotFoundError, type LetterRecord } from '../ports/letter-repository.js';
import type { MailProvider } from '../ports/mail-provider.js';
import { MailDeliveryError } from '../ports/mail-provider.js';
import type { UniversityContactRepository } from '../ports/university-contact-repository.js';
import { findSendableContact } from './admissions-contact.js';
import { letterContentRequestSchema, letterSenderSchema } from '../../domain/letter/schema.js';

const idempotencyKeySchema = z.string().min(1).max(128).regex(/^[\x21-\x7e]+$/);
type Limits = { maxFileBytes: number; maxTotalBytes: number };

function assertFinalContent(letter: LetterRecord): asserts letter is LetterRecord & {
  subject: string; body: string; selectedVariantId: string;
} {
  if (!letterSenderSchema.safeParse({ fullName: letter.senderName, replyToEmail: letter.replyToEmail }).success
    || !letterContentRequestSchema.safeParse({
      sourceVariantId: letter.selectedVariantId, subject: letter.subject, body: letter.body,
    }).success) throw new LetterNotReadyError();
}

function acceptedResponse(letter: LetterRecord, attempt: SendAttemptRecord) {
  if (letter.status !== 'sent' || !letter.sentAt) throw new LetterSendInProgressError();
  return {
    letter: { id: letter.id, status: 'sent' as const,
      recipientEmail: attempt.recipientEmail, sentAt: letter.sentAt },
    delivery: { state: 'accepted' as const, providerMessageId: attempt.providerMessageId },
  };
}

function previousResult(letter: LetterRecord, attempt: SendAttemptRecord) {
  if (attempt.status === 'started') throw new LetterSendInProgressError();
  if (attempt.status === 'accepted') return acceptedResponse(letter, attempt);
  throw new MailDeliveryError(attempt.status);
}

export async function prepareAdmissionLetter(
  letterId: unknown, contacts: () => UniversityContactRepository,
  delivery: () => LetterDeliveryRepository, limits: () => Limits,
) {
  const id = z.uuid().parse(letterId);
  const repository = delivery();
  const detail = await repository.getDetail(id);
  if (!detail) throw new LetterNotFoundError();
  if (detail.letter.status !== 'draft_selected' && detail.letter.status !== 'ready_to_send') {
    throw new LetterNotReadyError();
  }
  assertFinalContent(detail.letter);
  const contact = await findSendableContact(detail.letter.universityId, contacts);
  const letter = await repository.prepare({ letterId: id, contactId: contact.id, recipientEmail: contact.email,
    ...limits() });
  return { letter, recipientEmail: contact.email };
}

export async function sendAdmissionLetter(
  letterId: unknown, key: unknown, contacts: () => UniversityContactRepository,
  delivery: () => LetterDeliveryRepository, storage: () => FileStorage,
  providerFactory: () => MailProvider, limits: () => Limits,
) {
  const id = z.uuid().parse(letterId);
  const idempotencyKey = idempotencyKeySchema.parse(key);
  const repository = delivery();
  const existing = await repository.findAttempt(id, idempotencyKey);
  if (existing) {
    const detail = await repository.getDetail(id);
    if (!detail) throw new LetterNotFoundError();
    return previousResult(detail.letter, existing);
  }
  const detail = await repository.getDetail(id);
  if (!detail) throw new LetterNotFoundError();
  if (detail.letter.status === 'sent') throw new LetterAlreadySentError();
  if (detail.letter.status === 'sending') throw new LetterSendInProgressError();
  if (detail.letter.status !== 'ready_to_send') throw new LetterNotReadyError();
  assertFinalContent(detail.letter);
  const contact = await findSendableContact(detail.letter.universityId, contacts);
  const provider = providerFactory();
  const claim = await repository.claim({ letterId: id, key: idempotencyKey,
    contactId: contact.id, recipientEmail: contact.email, ...limits() });
  if (claim.kind === 'previous') return previousResult(claim.letter, claim.attempt);
  assertFinalContent(claim.letter);

  const streams: Readable[] = [];
  let handedToProvider = false;
  let providerMessageId: string | null;
  try {
    const attachments = [];
    for (const attachment of claim.attachments) {
      const content = await storage().open(attachment.storageKey);
      streams.push(content);
      attachments.push({ filename: attachment.originalName, mimeType: attachment.mimeType, content });
    }
    handedToProvider = true;
    const result = await provider.send({
      to: contact.email,
      replyTo: { name: claim.letter.senderName, email: claim.letter.replyToEmail },
      subject: claim.letter.subject, body: claim.letter.body, attachments,
    });
    providerMessageId = result.providerMessageId;
  } catch (error) {
    const state = error instanceof MailDeliveryError ? error.state : handedToProvider ? 'ambiguous' : 'failed';
    await repository.finish({ letterId: id, attemptId: claim.attempt.id, status: state,
      errorCode: 'MAIL_SEND_FAILED' });
    throw new MailDeliveryError(state);
  } finally {
    for (const stream of streams) stream.destroy();
  }
  const completed = await repository.finish({ letterId: id, attemptId: claim.attempt.id,
    status: 'accepted', providerMessageId });
  return acceptedResponse(completed.letter, completed.attempt);
}

export async function getAdmissionLetter(letterId: unknown, delivery: () => LetterDeliveryRepository) {
  const id = z.uuid().parse(letterId);
  const detail = await delivery().getDetail(id);
  if (!detail) throw new LetterNotFoundError();
  const attempt = detail.delivery;
  return {
    letter: detail.letter,
    generations: detail.generations,
    attachments: detail.attachments,
    delivery: attempt ? {
      state: attempt.status,
      recipientEmail: attempt.recipientEmail,
      providerMessageId: attempt.providerMessageId,
      errorCode: attempt.errorCode,
      createdAt: attempt.createdAt,
      completedAt: attempt.completedAt,
    } : { state: 'not_sent' as const },
  };
}
