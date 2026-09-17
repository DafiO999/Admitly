import Fastify, { LogController, type FastifyServerOptions } from 'fastify';
import { registerErrorHandlers } from './http/errors/handler.js';
import { diagnosisRoutes } from './http/routes/diagnosis.js';
import { healthRoutes } from './http/routes/health.js';

export function buildApp(options: FastifyServerOptions = {}) {
  const app = Fastify({ ...options, logController: new LogController({ disableRequestLogging: true }) });
  registerErrorHandlers(app);
  app.register(healthRoutes);
  app.register(diagnosisRoutes);
  return app;
}
