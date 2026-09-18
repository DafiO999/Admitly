import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import multipart from '@fastify/multipart';
import { resolve } from 'node:path';
import type { UniversityProvider } from './application/ports/university-provider.js';
import type { UniversityContactRepository } from './application/ports/university-contact-repository.js';
import type { LetterRepository } from './application/ports/letter-repository.js';
import type { LetterDraftProvider } from './application/ports/letter-draft-provider.js';
import type { LetterAttachmentRepository } from './application/ports/letter-attachment-repository.js';
import type { FileStorage } from './application/ports/file-storage.js';
import type { LetterDeliveryRepository } from './application/ports/letter-delivery-repository.js';
import type { MailProvider } from './application/ports/mail-provider.js';
import { MailProviderUnavailableError } from './application/ports/mail-provider.js';
import type { AdmissionRequirementProvider } from './application/ports/admission-requirement-provider.js';
import type { AiProvider } from './application/ports/ai-provider.js';
import { DatabaseUnavailableError, type PlanRepository } from './application/ports/plan-repository.js';
import { loadEnvironment } from './config/env.js';
import { registerErrorHandlers } from './http/errors/handler.js';
import { comparisonRoutes } from './http/routes/comparison.js';
import { admissionsContactRoutes } from './http/routes/admissions-contact.js';
import { letterRoutes } from './http/routes/letters.js';
import { letterAttachmentRoutes } from './http/routes/letter-attachments.js';
import { letterDeliveryRoutes } from './http/routes/letter-delivery.js';
import { mockLetterSendRoutes } from './http/routes/mock-letter-send.js';
import { diagnosisRoutes } from './http/routes/diagnosis.js';
import { healthRoutes } from './http/routes/health.js';
import { planPersistenceRoutes } from './http/routes/plan-persistence.js';
import { recommendationRoutes } from './http/routes/recommendations.js';
import { roadmapRoutes } from './http/routes/roadmap.js';
import { createAdmissionRequirementProvider } from './infrastructure/admission-requirement-provider.js';
import { createAiProvider } from './infrastructure/ai-provider.js';
import { createUniversityProvider } from './infrastructure/university-provider.js';
import { createPrismaClient } from './infrastructure/db/prisma/client.js';
import { PrismaPlanRepository } from './infrastructure/db/repositories/prisma-plan-repository.js';
import { PrismaUniversityContactRepository } from './infrastructure/db/repositories/prisma-university-contact-repository.js';
import { PrismaLetterRepository } from './infrastructure/db/repositories/prisma-letter-repository.js';
import { PrismaLetterAttachmentRepository } from './infrastructure/db/repositories/prisma-letter-attachment-repository.js';
import { PrismaLetterDeliveryRepository } from './infrastructure/db/repositories/prisma-letter-delivery-repository.js';
import { createLetterDraftProvider } from './infrastructure/letter-draft-provider.js';
import { LocalFileStorage } from './infrastructure/storage/local-file-storage.js';
import { SMTPMailProvider } from './infrastructure/mail/smtp-mail-provider.js';

export function buildApp(
  options: FastifyServerOptions = {},
  dependencies: {
    universityProvider?: UniversityProvider;
    requirementProvider?: AdmissionRequirementProvider;
    aiProvider?: AiProvider | null;
    planRepository?: PlanRepository;
    contactRepository?: UniversityContactRepository;
    letterRepository?: LetterRepository;
    letterDraftProvider?: LetterDraftProvider | null;
    attachmentRepository?: LetterAttachmentRepository;
    deliveryRepository?: LetterDeliveryRepository;
    mailProvider?: MailProvider;
    mailDeliveryMode?: 'mock' | 'smtp';
    fileStorage?: FileStorage;
    attachmentLimits?: { maxFileBytes: number; maxTotalBytes: number };
    readinessCheck?: () => Promise<void>;
  } = {},
) {
  const app = Fastify({ bodyLimit: 128 * 1024, ...options, logController: new LogController({ disableRequestLogging: true }) });
  const aiProviderFactory = () => dependencies.aiProvider === undefined
    ? createAiProvider(loadEnvironment(process.env)) : dependencies.aiProvider;
  let databaseClient: ReturnType<typeof createPrismaClient> | undefined;
  let planRepository: PlanRepository | undefined;
  let contactRepository: UniversityContactRepository | undefined;
  let letterRepository: LetterRepository | undefined;
  let attachmentRepository: LetterAttachmentRepository | undefined;
  let deliveryRepository: LetterDeliveryRepository | undefined;
  let mailProvider: MailProvider | undefined;
  let fileStorage: FileStorage | undefined;
  const databaseClientFactory = () => {
    if (databaseClient) return databaseClient;
    const databaseUrl = loadEnvironment(process.env).DATABASE_URL;
    if (!databaseUrl) throw new DatabaseUnavailableError();
    databaseClient = createPrismaClient(databaseUrl);
    return databaseClient;
  };
  const planRepositoryFactory = () => {
    if (dependencies.planRepository) return dependencies.planRepository;
    if (planRepository) return planRepository;
    planRepository = new PrismaPlanRepository(databaseClientFactory());
    return planRepository;
  };
  const contactRepositoryFactory = () => {
    if (dependencies.contactRepository) return dependencies.contactRepository;
    if (contactRepository) return contactRepository;
    contactRepository = new PrismaUniversityContactRepository(databaseClientFactory());
    return contactRepository;
  };
  const optionalRoadmapContacts = () => {
    if (dependencies.contactRepository) return dependencies.contactRepository;
    if (dependencies.universityProvider || dependencies.requirementProvider
      || dependencies.planRepository) return null;
    return loadEnvironment(process.env).DATABASE_URL ? contactRepositoryFactory() : null;
  };
  const letterRepositoryFactory = () => {
    if (dependencies.letterRepository) return dependencies.letterRepository;
    if (letterRepository) return letterRepository;
    letterRepository = new PrismaLetterRepository(databaseClientFactory());
    return letterRepository;
  };
  const letterDraftProviderFactory = () => dependencies.letterDraftProvider === undefined
    ? createLetterDraftProvider(loadEnvironment(process.env)) : dependencies.letterDraftProvider;
  const attachmentRepositoryFactory = () => {
    if (dependencies.attachmentRepository) return dependencies.attachmentRepository;
    if (attachmentRepository) return attachmentRepository;
    attachmentRepository = new PrismaLetterAttachmentRepository(databaseClientFactory());
    return attachmentRepository;
  };
  const deliveryRepositoryFactory = () => {
    if (dependencies.deliveryRepository) return dependencies.deliveryRepository;
    if (deliveryRepository) return deliveryRepository;
    deliveryRepository = new PrismaLetterDeliveryRepository(databaseClientFactory());
    return deliveryRepository;
  };
  const mailProviderFactory = () => {
    if (dependencies.mailProvider) return dependencies.mailProvider;
    if (mailProvider) return mailProvider;
    const environment = loadEnvironment(process.env);
    if (environment.MAIL_DELIVERY_MODE !== 'smtp') throw new MailProviderUnavailableError();
    if (!environment.SMTP_HOST || !environment.SMTP_USER || !environment.SMTP_PASSWORD
      || !environment.SMTP_FROM_EMAIL) throw new MailProviderUnavailableError();
    mailProvider = new SMTPMailProvider({ host: environment.SMTP_HOST, port: environment.SMTP_PORT,
      secure: environment.SMTP_SECURE, user: environment.SMTP_USER, password: environment.SMTP_PASSWORD,
      fromEmail: environment.SMTP_FROM_EMAIL, fromName: environment.SMTP_FROM_NAME });
    return mailProvider;
  };
  const mailDeliveryModeFactory = () =>
    dependencies.mailDeliveryMode ?? loadEnvironment(process.env).MAIL_DELIVERY_MODE;
  const fileStorageFactory = () => {
    if (dependencies.fileStorage) return dependencies.fileStorage;
    if (fileStorage) return fileStorage;
    const environment = loadEnvironment(process.env);
    fileStorage = new LocalFileStorage(environment.LETTER_UPLOAD_DIR
      ?? (environment.NODE_ENV === 'production' ? '/data/uploads' : resolve('.data/uploads')));
    return fileStorage;
  };
  const attachmentLimitsFactory = () => dependencies.attachmentLimits ?? (() => {
    const environment = loadEnvironment(process.env);
    return {
      maxFileBytes: environment.LETTER_ATTACHMENT_MAX_FILE_BYTES,
      maxTotalBytes: environment.LETTER_ATTACHMENT_MAX_TOTAL_BYTES,
    };
  })();
  const checkReadiness = dependencies.readinessCheck ?? (async () => {
    try {
      const client = databaseClientFactory();
      await client.profile.findFirst({ select: { id: true } });
      await client.roadmap.findFirst({ select: { id: true } });
    } catch {
      throw new DatabaseUnavailableError();
    }
  });
  app.addHook('onClose', async () => databaseClient?.$disconnect());
  registerErrorHandlers(app);
  app.register(multipart);
  app.register(healthRoutes(checkReadiness));
  app.register(admissionsContactRoutes(contactRepositoryFactory));
  app.register(letterRoutes(contactRepositoryFactory, letterRepositoryFactory, letterDraftProviderFactory));
  app.register(letterAttachmentRoutes(letterRepositoryFactory, attachmentRepositoryFactory,
    fileStorageFactory, attachmentLimitsFactory));
  app.register(letterDeliveryRoutes(contactRepositoryFactory, deliveryRepositoryFactory,
    fileStorageFactory, mailProviderFactory, attachmentLimitsFactory, mailDeliveryModeFactory));
  app.register(mockLetterSendRoutes(
    planRepositoryFactory, mailDeliveryModeFactory, letterDraftProviderFactory,
  ));
  app.register(diagnosisRoutes(aiProviderFactory));
  app.register(recommendationRoutes(
    () => dependencies.universityProvider ?? createUniversityProvider(loadEnvironment(process.env)),
    aiProviderFactory,
  ));
  const providerFactory = () => {
    if (dependencies.universityProvider && dependencies.requirementProvider) {
      return { universityProvider: dependencies.universityProvider, requirementProvider: dependencies.requirementProvider };
    }
    const environment = loadEnvironment(process.env);
    return {
      universityProvider: dependencies.universityProvider ?? createUniversityProvider(environment),
      requirementProvider: dependencies.requirementProvider ?? createAdmissionRequirementProvider(environment),
    };
  };
  app.register(comparisonRoutes(providerFactory));
  app.register(roadmapRoutes(providerFactory, aiProviderFactory, optionalRoadmapContacts));
  app.register(planPersistenceRoutes(providerFactory, planRepositoryFactory, optionalRoadmapContacts));
  return app;
}
