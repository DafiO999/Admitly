import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import type { UniversityProvider } from './application/ports/university-provider.js';
import { loadEnvironment } from './config/env.js';
import { registerErrorHandlers } from './http/errors/handler.js';
import { diagnosisRoutes } from './http/routes/diagnosis.js';
import { healthRoutes } from './http/routes/health.js';
import { recommendationRoutes } from './http/routes/recommendations.js';
import { createUniversityProvider } from './infrastructure/university-provider.js';

export function buildApp(
  options: FastifyServerOptions = {},
  dependencies: { universityProvider?: UniversityProvider } = {},
) {
  const app = Fastify({ ...options, logController: new LogController({ disableRequestLogging: true }) });
  registerErrorHandlers(app);
  app.register(healthRoutes);
  app.register(diagnosisRoutes);
  app.register(recommendationRoutes(() => dependencies.universityProvider
    ?? createUniversityProvider(loadEnvironment(process.env))));
  return app;
}
