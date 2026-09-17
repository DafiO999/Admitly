import 'dotenv/config';
import { buildApp } from './app.js';
import { ConfigurationError, loadEnvironment } from './config/env.js';

async function main(): Promise<void> {
  const env = loadEnvironment(process.env);
  const app = buildApp({ logger: true });

  try {
    await app.listen({ host: env.HOST, port: env.PORT });
  } catch {
    app.log.error('Server failed to start');
    await app.close();
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const reason = error instanceof ConfigurationError ? error.message : 'Unexpected startup error';
  process.stderr.write(`Server failed to start: ${reason}\n`);
  process.exitCode = 1;
});
