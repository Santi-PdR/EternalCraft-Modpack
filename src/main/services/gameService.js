const path = require('path');
const fs = require('fs');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { ensureForgeInstaller } = require('./packService');
const { resolveJava17 } = require('./javaService');
const { ensurePreset } = require('./gamePresetService');
const { preferredGpuEnv } = require('./gpuService');

async function launchGame({ config, manifest, resourcesDir, managedJavaRoot = '', javaInfo = null, onLog = () => {}, onProgress = () => {}, onExit = () => {} }) {
  const root = config.pack.installDirectory;
  const username = String(config.minecraft.username || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw new Error('Configurá un nick válido antes de jugar.');

  const java = javaInfo && javaInfo.found ? javaInfo : await resolveJava17(config.minecraft.javaPath || '', managedJavaRoot);
  if (!java.found || Number(java.major) < 17) throw new Error(`Eternal Craft necesita Java 17 o superior. Detectado: ${java.version || 'ninguno'}.`);
  const forgeInstaller = await ensureForgeInstaller(root, manifest, onProgress);

  const launcher = new Client();
  launcher.on('debug', (line) => onLog({ stream: 'debug', line: String(line) }));
  launcher.on('data', (line) => onLog({ stream: 'game', line: String(line) }));

  const options = {
    authorization: Authenticator.getAuth(username),
    root,
    version: { number: manifest.minecraft || config.minecraft.version || '1.20.1', type: 'release' },
    memory: {
      min: `${Math.max(1024, Number(config.minecraft.minMemoryMb || 2048))}M`,
      max: `${Math.max(2048, Number(config.minecraft.maxMemoryMb || 6144))}M`
    },
    window: {
      width: String(config.minecraft.width || 1280),
      height: String(config.minecraft.height || 720),
      fullscreen: Boolean(config.minecraft.fullscreen)
    },
    javaPath: java.path,
    quickPlay: { type: 'multiplayer', identifier: `${config.server.host}:${config.server.port}` }
  };
  if (forgeInstaller && fs.existsSync(forgeInstaller)) options.forge = forgeInstaller;

  onLog({ stream: 'launcher', line: `Iniciando ${manifest.minecraft || config.minecraft.version} para ${username}` });
  const startedAt = Date.now();
  const gpuEnv = await preferredGpuEnv(config.minecraft.preferDedicatedGpu !== false);
  const previousEnv = {};
  for (const [key, value] of Object.entries(gpuEnv)) { previousEnv[key] = process.env[key]; process.env[key] = value; }
  let child;
  try { child = await launcher.launch(options); }
  finally {
    for (const key of Object.keys(gpuEnv)) {
      if (previousEnv[key] === undefined) delete process.env[key]; else process.env[key] = previousEnv[key];
    }
  }
  if (child && typeof child.once === 'function') {
    child.once('close', (code, signal) => {
      onExit({
        code: Number.isInteger(code) ? code : null,
        signal: signal || null,
        startedAt: new Date(startedAt).toISOString(),
        endedAt: new Date().toISOString(),
        durationMs: Math.max(0, Date.now() - startedAt)
      });
    });
  }
  return { pid: child?.pid || null, root: path.resolve(root), startedAt: new Date(startedAt).toISOString() };
}

module.exports = { launchGame };
