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

const { parsePublishSummary } = require('../src/main/services/developerService');

test('a no-op publish result is reported as idempotent instead of as an error', () => {
  const summary = { ok: true, noop: true, repaired: [], version: '1.0.9', added: [], changed: [], removed: [] };
  const parsed = parsePublishSummary(`Preparando publicación…\nSIN CAMBIOS\nNOOP_JSON:${JSON.stringify(summary)}\n`);
  assert.equal(parsed.noop, true);
  assert.equal(parsed.version, '1.0.9');
});

test('a repair keeps noop=false and lists the recovered blobs', () => {
  const summary = { ok: true, noop: false, repaired: ['a'.repeat(64)], version: '1.0.9' };
  const parsed = parsePublishSummary(`CANAL REPARADO\nPUBLISH_JSON:${JSON.stringify(summary)}\n`);
  assert.equal(parsed.noop, false);
  assert.deepEqual(parsed.repaired, ['a'.repeat(64)]);
});

test('malformed or missing summaries do not crash the publisher result', () => {
  assert.equal(parsePublishSummary('PUBLISH_JSON:{bad json}'), null);
  assert.equal(parsePublishSummary('Publicación completa sin resumen'), null);
  assert.equal(parsePublishSummary(''), null);
});
