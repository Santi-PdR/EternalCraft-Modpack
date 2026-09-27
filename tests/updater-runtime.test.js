const test = require('node:test');
const assert = require('node:assert/strict');
const { appImageRuntimeMessage } = require('../src/main/services/updateRuntime');

test('requires the AppImage runtime for packaged Linux self-updates', () => {
  assert.match(appImageRuntimeMessage({ packaged: true, platform: 'linux', appImagePath: '' }), /copia extraída/);
  assert.equal(appImageRuntimeMessage({ packaged: true, platform: 'linux', appImagePath: '/opt/EternalCraft.AppImage' }), '');
  assert.equal(appImageRuntimeMessage({ packaged: true, platform: 'win32', appImagePath: '' }), '');
  assert.equal(appImageRuntimeMessage({ packaged: false, platform: 'linux', appImagePath: '' }), '');
});
