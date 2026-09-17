import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import type { UniversityProvider } from './application/ports/university-provider.js';
import type { AdmissionRequirementProvider } from './application/ports/admission-requirement-provider.js';
import { loadEnvironment } from './config/env.js';
import { registerErrorHandlers } from './http/errors/handler.js';
import { comparisonRoutes } from './http/routes/comparison.js';
import { diagnosisRoutes } from './http/routes/diagnosis.js';
import { healthRoutes } from './http/routes/health.js';
import { recommendationRoutes } from './http/routes/recommendations.js';
import { createAdmissionRequirementProvider } from './infrastructure/admission-requirement-provider.js';
import { createUniversityProvider } from './infrastructure/university-provider.js';

export function buildApp(
  options: FastifyServerOptions = {},
  dependencies: { universityProvider?: UniversityProvider; requirementProvider?: AdmissionRequirementProvider } = {},
) {
  const app = Fastify({ ...options, logController: new LogController({ disableRequestLogging: true }) });
  registerErrorHandlers(app);
  app.register(healthRoutes);
  app.register(diagnosisRoutes);
  app.register(recommendationRoutes(() => dependencies.universityProvider
    ?? createUniversityProvider(loadEnvironment(process.env))));
  app.register(comparisonRoutes(() => {
    if (dependencies.universityProvider && dependencies.requirementProvider) {
      return { universityProvider: dependencies.universityProvider, requirementProvider: dependencies.requirementProvider };
    }
    const environment = loadEnvironment(process.env);
    return {
      universityProvider: dependencies.universityProvider ?? createUniversityProvider(environment),
      requirementProvider: dependencies.requirementProvider ?? createAdmissionRequirementProvider(environment),
    };
  }));
  return app;
}
