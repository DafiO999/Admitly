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

    const send = committed.paths['/api/letters/{letterId}/send'].post;
    expect(send.parameters).toContainEqual(expect.objectContaining({
      name: 'Idempotency-Key', in: 'header', required: true,
    }));
    expect(send.requestBody).toBeUndefined();
    const roadmapItem = committed.components.schemas.RoadmapResponse.properties.roadmap
      .properties.items.items;
    expect(roadmapItem.properties.category.enum).toContain('university_email');
    expect(Object.keys(roadmapItem.properties.letter.properties).sort())
      .toEqual(['body', 'recipientEmail', 'universityId']);
    expect(JSON.stringify(committed.components.schemas.AttachmentUploadResponse)).not.toContain('storageKey');

    const routes = [
      ['GET', apiPaths.health], ['GET', apiPaths.ready], ['POST', apiPaths.diagnosis],
      ['POST', apiPaths.recommendations], ['POST', apiPaths.recommendationExplanation],
      ['POST', apiPaths.comparison], ['POST', apiPaths.roadmap], ['PUT', apiPaths.profile],
      ['GET', apiPaths.admissionsContact],
      ['POST', apiPaths.createLetter], ['POST', apiPaths.letterDrafts], ['PUT', apiPaths.letterContent],
      ['POST', apiPaths.letterAttachments], ['GET', apiPaths.letterAttachments], ['DELETE', apiPaths.letterAttachment],
      ['POST', apiPaths.letterPrepare], ['POST', apiPaths.letterSend], ['GET', apiPaths.letter],
      ['GET', apiPaths.plan], ['POST', apiPaths.recalculate], ['PATCH', apiPaths.roadmapItem],
    ] as const;
    const app = buildApp();
    try {
      await app.ready();
      expect(Object.keys(document.paths)).toHaveLength(new Set(routes.map(([, route]) => route)).size);
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
