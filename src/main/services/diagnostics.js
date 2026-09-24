const os = require('os');
const path = require('path');
const fs = require('fs/promises');
const { inspectJava } = require('./javaService');
const { checkInstallation } = require('./packService');

async function tailFile(filePath, maxBytes = 18000) {
  try {
    const stat = await fs.stat(filePath);
    const handle = await fs.open(filePath, 'r');
    const length = Math.min(stat.size, maxBytes);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, Math.max(0, stat.size - length));
    await handle.close();
    return buffer.toString('utf8');
  } catch (_) { return ''; }
}

async function newestCrashReport(root) {
  const dir = path.join(root, 'crash-reports');
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const rows = [];
    for (const entry of entries) {
      if (!entry.isFile() || !/\.txt$/i.test(entry.name)) continue;
      const full = path.join(dir, entry.name); const stat = await fs.stat(full);
      rows.push({ full, name: entry.name, mtimeMs: stat.mtimeMs });
    }
    rows.sort((a, b) => b.mtimeMs - a.mtimeMs);
    return rows[0] || null;
  } catch (_) { return null; }
}

function classifyLog(text = '') {
  const source = String(text || '');
  const tests = [
    { re:/OutOfMemoryError|Java heap space|GC overhead limit exceeded/i, code:'memory', title:'Falta de memoria', summary:'Minecraft se quedó sin memoria disponible. Probá el preset Equilibrado o Rendimiento y entre 5–6 GB de RAM.' },
    { re:/DuplicateModsFoundException|Found duplicate mods|duplicate mod/i, code:'duplicate', title:'Mods duplicados', summary:'Hay al menos un mod repetido. Usá Reparar para volver a la lista oficial del pack.' },
    { re:/Missing or unsupported mandatory dependencies|ModLoadingException.*dependenc|requires .* or above/i, code:'dependency', title:'Falta una dependencia', summary:'Un mod necesita otro archivo o una versión distinta. Reparar el modpack suele corregirlo.' },
    { re:/Mixin apply failed|MixinApplyError|InvalidMixinException/i, code:'mixin', title:'Conflicto entre mods', summary:'Falló una modificación interna de un mod. Revisá que el pack esté actualizado y sin archivos modificados.' },
    { re:/UnsupportedClassVersionError|has been compiled by a more recent version of the Java Runtime/i, code:'java', title:'Java incorrecto', summary:'El juego intentó usar una versión de Java incompatible. El launcher puede administrar Java 17 automáticamente.' },
    { re:/Connection refused|Failed to connect to the server|Connection timed out|No route to host/i, code:'network', title:'Problema de conexión', summary:'El cliente no pudo conectarse al servidor. Comprobá el estado del servidor y tu conexión.' },
    { re:/EXCEPTION_ACCESS_VIOLATION|SIGSEGV|Problematic frame/i, code:'native', title:'Crash nativo', summary:'El cierre ocurrió fuera de Java. Puede estar relacionado con drivers, shaders o una librería nativa.' },
    { re:/Mod File .* needs language provider|Failed to load mod/i, code:'modload', title:'Un mod no pudo cargar', summary:'Hay un mod incompatible o incompleto. Ejecutá Reparar y volvé a probar.' }
  ];
  for (const item of tests) if (item.re.test(source)) return { severity:'warn', ...item };
  if (/Exception|ERROR|FATAL/i.test(source)) return { severity:'warn', code:'unknown-error', title:'Se detectaron errores en el log', summary:'No encontré una causa única. Generá el diagnóstico completo y compartilo con soporte.' };
  return { severity:'ok', code:'clean', title:'No veo un error claro', summary:'El último log no contiene una causa típica de crash. Si el problema sigue, generá el diagnóstico completo.' };
}

async function quickDiagnostic(config) {
  const latest = await tailFile(path.join(config.pack.installDirectory, 'logs', 'latest.log'));
  const crash = await newestCrashReport(config.pack.installDirectory);
  const crashText = crash ? await tailFile(crash.full, 22000) : '';
  const result = classifyLog(`${crashText}\n${latest}`);
  return { ...result, crashReport: crash?.name || '', hasLatestLog: Boolean(latest) };
}

async function buildDiagnostic(config, manifest, launcherVersion = '') {
  const java = await inspectJava(config.minecraft.javaPath || 'java');
  const pack = await checkInstallation(config.pack.installDirectory, manifest).catch((err) => ({ error: err.message }));
  const logTail = await tailFile(path.join(config.pack.installDirectory, 'logs', 'latest.log'));
  const quick = await quickDiagnostic(config);

  const lines = [
    'ETERNAL CRAFT // DIAGNÓSTICO',
    `Fecha: ${new Date().toISOString()}`,
    launcherVersion ? `Launcher: ${launcherVersion}` : null,
    `Sistema: ${os.type()} ${os.release()} (${os.arch()})`,
    `RAM del sistema: ${(os.totalmem() / 1024 / 1024 / 1024).toFixed(1)} GB`,
    `RAM asignada: ${(Number(config.minecraft.maxMemoryMb || 0) / 1024).toFixed(1)} GB`,
    `Minecraft: ${manifest.minecraft || config.minecraft.version}`,
    `Forge: ${manifest.forge || config.minecraft.forgeVersion}`,
    `Pack esperado: ${manifest.version}`,
    `Pack instalado: ${pack.state?.version || 'sin detectar'}`,
    `Archivos correctos: ${pack.ok ?? '?'}/${pack.total ?? '?'}`,
    `Faltantes: ${pack.missing?.length ?? '?'}`,
    `Modificados/dañados: ${pack.changed?.length ?? '?'}`,
    `Java: ${java.found ? java.version : 'no encontrado'}`,
    `Java path: ${java.path}`,
    `Instancia: ${config.pack.installDirectory}`,
    `Servidor: ${config.server.host}:${config.server.port}`,
    `Análisis rápido: ${quick.title} — ${quick.summary}`
  ].filter(Boolean);

  if (pack.error) lines.push(`Error al revisar pack: ${pack.error}`);
  if (quick.crashReport) lines.push(`Crash report más reciente: ${quick.crashReport}`);
  if (logTail) lines.push('', '--- ÚLTIMAS LÍNEAS DE latest.log ---', logTail);
  return lines.join('\n');
}

module.exports = { buildDiagnostic, quickDiagnostic, classifyLog };
