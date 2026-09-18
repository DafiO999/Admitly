import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { generateOpenApiDocument } from '../../src/http/openapi.js';
import { apiPaths } from '../../src/http/routes/paths.js';

describe('generated API contract', () => {
  it('matches the checked-in document and registered routes', async () => {
    const document = generateOpenApiDocument();
    const committed = JSON.parse(await readFile(new URL('../../openapi/openapi.json', import.meta.url), 'utf8'));
    expect(committed).toEqual(document);

    const routes = [
      ['GET', apiPaths.health], ['GET', apiPaths.ready], ['POST', apiPaths.diagnosis],
      ['POST', apiPaths.recommendations], ['POST', apiPaths.recommendationExplanation],
      ['POST', apiPaths.comparison], ['POST', apiPaths.roadmap], ['PUT', apiPaths.profile],
      ['GET', apiPaths.admissionsContact],
      ['POST', apiPaths.createLetter], ['POST', apiPaths.letterDrafts], ['PUT', apiPaths.letterContent],
      ['GET', apiPaths.plan], ['POST', apiPaths.recalculate], ['PATCH', apiPaths.roadmapItem],
    ] as const;
    const app = buildApp();
    try {
      await app.ready();
      expect(Object.keys(document.paths)).toHaveLength(routes.length);
      for (const [method, route] of routes) {
        expect(app.hasRoute({ method, url: route })).toBe(true);
        const path = route.replace(/:([A-Za-z][A-Za-z0-9]*)/g, '{$1}');
        expect(document.paths[path]).toHaveProperty(method.toLowerCase());
      }
    } finally {
      await app.close();
    }
  });
});
