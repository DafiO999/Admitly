import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import type { UniversityProvider } from './application/ports/university-provider.js';
import type { UniversityContactRepository } from './application/ports/university-contact-repository.js';
import type { AdmissionRequirementProvider } from './application/ports/admission-requirement-provider.js';
import type { AiProvider } from './application/ports/ai-provider.js';
import { DatabaseUnavailableError, type PlanRepository } from './application/ports/plan-repository.js';
import { loadEnvironment } from './config/env.js';
import { registerErrorHandlers } from './http/errors/handler.js';
import { comparisonRoutes } from './http/routes/comparison.js';
import { admissionsContactRoutes } from './http/routes/admissions-contact.js';
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

export function buildApp(
  options: FastifyServerOptions = {},
  dependencies: {
    universityProvider?: UniversityProvider;
    requirementProvider?: AdmissionRequirementProvider;
    aiProvider?: AiProvider | null;
    planRepository?: PlanRepository;
    contactRepository?: UniversityContactRepository;
    readinessCheck?: () => Promise<void>;
  } = {},
) {
  const app = Fastify({ bodyLimit: 128 * 1024, ...options, logController: new LogController({ disableRequestLogging: true }) });
  const aiProviderFactory = () => dependencies.aiProvider === undefined
    ? createAiProvider(loadEnvironment(process.env)) : dependencies.aiProvider;
  let databaseClient: ReturnType<typeof createPrismaClient> | undefined;
  let planRepository: PlanRepository | undefined;
  let contactRepository: UniversityContactRepository | undefined;
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
  app.register(healthRoutes(checkReadiness));
  app.register(admissionsContactRoutes(contactRepositoryFactory));
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
  app.register(roadmapRoutes(providerFactory, aiProviderFactory));
  app.register(planPersistenceRoutes(providerFactory, planRepositoryFactory));
  return app;
}
