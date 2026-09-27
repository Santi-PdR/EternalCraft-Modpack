const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { isAllowedFile } = require('../src/main/services/mediaService');

test('media open accepts files in the gallery and rejects traversal and symlink escapes', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'eternal-media-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'eternal-outside-'));
  t.after(async () => Promise.all([
    fs.rm(root, { recursive: true, force: true }),
    fs.rm(outside, { recursive: true, force: true })
  ]));

  const image = path.join(root, 'clip.png');
  const externalImage = path.join(outside, 'private.png');
  await fs.writeFile(image, 'gallery image');
  await fs.writeFile(externalImage, 'outside image');

  assert.equal(await isAllowedFile(root, image), true);
  assert.equal(await isAllowedFile(root, externalImage), false);
  assert.equal(await isAllowedFile(root, path.join(root, '..', path.basename(outside), 'private.png')), false);

  try {
    await fs.symlink(externalImage, path.join(root, 'linked.png'));
  } catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('symlinks are unavailable in this environment');
    throw error;
  }
  assert.equal(await isAllowedFile(root, path.join(root, 'linked.png')), false);
});
