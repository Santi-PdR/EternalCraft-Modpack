const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { auditMods } = require('../src/main/services/modService');

async function createInstance(t, mods) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ecl-mod-audit-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'mods'), { recursive: true });
  await fs.mkdir(path.join(root, '.launcher'), { recursive: true });
  const metadata = {};
  for (const [filename, entry] of Object.entries(mods)) {
    const base = filename.replace(/\.disabled$/i, '');
    await fs.writeFile(path.join(root, 'mods', filename), 'jar');
    metadata[base] = entry;
  }
  await fs.writeFile(path.join(root, '.launcher', 'user-mods.json'), JSON.stringify({ mods: metadata }));
  return root;
}

test('audit warns for a personal jar that duplicates an official project', async (t) => {
  const root = await createInstance(t, {
    'official.jar': { projectId: 'project-1', sourceUrl: 'https://modrinth.com/mod/project-1', provider: 'modrinth' },
    'personal-copy.jar': { projectId: 'project-1', sourceUrl: 'https://modrinth.com/mod/project-1', provider: 'modrinth' }
  });
  const result = await auditMods(root, { files: [{ path: 'mods/official.jar' }] });
  assert.equal(result.issues.filter((issue) => issue.type === 'duplicate-project').length, 1);
});

test('audit ignores disabled duplicate jars and filename-only similarities', async (t) => {
  const root = await createInstance(t, {
    'fast-quit.jar': { projectName: 'FastQuit' },
    'fast-quit-copy.jar.disabled': { projectName: 'FastQuit' }
  });
  const result = await auditMods(root, { files: [] });
  assert.deepEqual(result.issues, []);
  assert.equal(result.ok, true);
});

test('audit reports real personal incompatibility and duplicate personal projects', async (t) => {
  const root = await createInstance(t, {
    'server-only.jar': { environment: { client: 'unsupported' } },
    'first-copy.jar': { projectId: 'same-id', provider: 'curseforge' },
    'second-copy.jar': { projectId: 'same-id', provider: 'curseforge' }
  });
  const result = await auditMods(root, { files: [] });
  assert.equal(result.issues.some((issue) => issue.type === 'server-only'), true);
  assert.equal(result.issues.some((issue) => issue.type === 'duplicate-project'), true);
  assert.equal(result.counts.bad, 2);
});
