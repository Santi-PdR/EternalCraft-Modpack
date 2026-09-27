const path = require('path');
const fs = require('fs');
const { Client, Authenticator } = require('minecraft-launcher-core');
const { ensureForgeInstaller } = require('./packService');
const { resolveJava17 } = require('./javaService');
const { ensurePreset } = require('./gamePresetService');
const { preferredGpuEnv } = require('./gpuService');

function requireLaunchedChild(child, detail = '') {
  if (!child || typeof child.once !== 'function') {
    throw new Error(`Minecraft no pudo crear el proceso de Java. ${detail || 'Revisá Java, Forge y los archivos de la instancia.'}`);
  }
  return child;
}

function resolveMemory(minValue, maxValue) {
  const minConfigured = Number.parseInt(minValue, 10);
  const maxConfigured = Number.parseInt(maxValue, 10);
  const min = Math.max(1024, Number.isFinite(minConfigured) ? minConfigured : 2048);
  const max = Math.max(min, 2048, Number.isFinite(maxConfigured) ? maxConfigured : 6144);
  return { min: `${min}M`, max: `${max}M` };
}

async function launchGame({ config, manifest, resourcesDir, managedJavaRoot = '', javaInfo = null, onLog = () => {}, onProgress = () => {}, onExit = () => {} }) {
  const root = config.pack.installDirectory;
  const username = String(config.minecraft.username || '').trim();
  if (!/^[A-Za-z0-9_]{3,16}$/.test(username)) throw new Error('Configurá un nick válido antes de jugar.');

  const java = javaInfo && javaInfo.found ? javaInfo : await resolveJava17(config.minecraft.javaPath || '', managedJavaRoot);
  if (!java.found || Number(java.major) < 17) throw new Error(`Eternal Craft necesita Java 17 o superior. Detectado: ${java.version || 'ninguno'}.`);
  // Seed options.txt only for new instances. Existing player settings are
  // preserved, while every fresh pack starts with Minecraft GUI scale 3.
  await ensurePreset(root, resourcesDir, config.minecraft.preset || 'balanced', false);
  const forgeInstaller = await ensureForgeInstaller(root, manifest, onProgress);

  const launcher = new Client();
  let launchFailure = '';
  launcher.on('debug', (line) => {
    const message = String(line);
    if (/Couldn't start Minecraft due to:|Failed to start due to/i.test(message)) launchFailure = message;
    onLog({ stream: 'debug', line: message });
  });
  launcher.on('data', (line) => onLog({ stream: 'game', line: String(line) }));

  const options = {
    authorization: config.minecraft.authorization || Authenticator.getAuth(username),
    root,
    version: { number: manifest.minecraft || config.minecraft.version || '1.20.1', type: 'release' },
    memory: resolveMemory(config.minecraft.minMemoryMb, config.minecraft.maxMemoryMb),
    window: {
      width: String(config.minecraft.width || 1280),
      height: String(config.minecraft.height || 720),
      fullscreen: Boolean(config.minecraft.fullscreen)
    },
    javaPath: java.path
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
  requireLaunchedChild(child, launchFailure);
  let exitReported = false;
  const reportExit = (session) => {
    if (exitReported) return;
    exitReported = true;
    onExit({
      code: Number.isInteger(session.code) ? session.code : null,
      signal: session.signal || null,
      error: session.error || '',
      startedAt: new Date(startedAt).toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: Math.max(0, Date.now() - startedAt)
    });
  };
  child.once('error', (error) => reportExit({ error: `No se pudo iniciar Java: ${error?.message || error}` }));
  child.once('close', (code, signal) => reportExit({ code, signal }));
  return { pid: child?.pid || null, root: path.resolve(root), startedAt: new Date(startedAt).toISOString() };
}

module.exports = { launchGame, requireLaunchedChild, resolveMemory };
