import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateOpenApiDocument } from '../src/http/openapi.js';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDir = resolve(repositoryRoot, 'openapi');
await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, 'openapi.json'), `${JSON.stringify(generateOpenApiDocument(), null, 2)}\n`);
process.stdout.write('Generated openapi/openapi.json\n');
