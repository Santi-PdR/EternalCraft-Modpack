const test = require('node:test');
const assert = require('node:assert/strict');
const { parseRefreshedPublishPreview } = require('../src/main/services/developerService');

test('publisher refresh sentinel is returned as a reviewable preview', () => {
  const preview = { version: '1.0.7', sourceFingerprint: 'a'.repeat(64), added: ['mods/new.jar'] };
  const error = { output: `Preparando publicación…\nPUBLISH_PREVIEW_REFRESH_JSON:${JSON.stringify(preview)}\nAbortado` };
  assert.deepEqual(parseRefreshedPublishPreview(error), preview);
});

test('ordinary or malformed publisher errors are not mistaken for a refreshed preview', () => {
  assert.equal(parseRefreshedPublishPreview({ output: 'HTTP 400: Bad Content' }), null);
  assert.equal(parseRefreshedPublishPreview({ output: 'PUBLISH_PREVIEW_REFRESH_JSON:{bad json}' }), null);
});
