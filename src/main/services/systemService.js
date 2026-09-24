const os = require('os');
const fsp = require('fs/promises');
const path = require('path');
const { detectGpus } = require('./gpuService');

const MB = 1024 * 1024;
const GB = 1024 * MB;

function recommendedRamGb(totalBytes = os.totalmem()) {
  const total = totalBytes / GB;
  if (total < 6) return 3;
  if (total < 10) return 4;
  if (total < 15) return 5;
  if (total < 23) return 6;
  return 8;
}

function maxRamGb(totalBytes = os.totalmem()) {
  const total = Math.floor(totalBytes / GB);
  return Math.max(4, Math.min(12, Math.floor(total * 0.7)));
}

async function nearestExisting(start) {
  let current = path.resolve(start || os.homedir());
  while (true) {
    try { await fsp.access(current); return current; }
    catch (_) {
      const parent = path.dirname(current);
      if (parent === current) return os.homedir();
      current = parent;
    }
  }
}

async function diskInfo(target) {
  try {
    const existing = await nearestExisting(target);
    const stats = await fsp.statfs(existing);
    const blockSize = Number(stats.bsize || stats.frsize || 0);
    const freeBytes = blockSize * Number(stats.bavail || stats.bfree || 0);
    const totalBytes = blockSize * Number(stats.blocks || 0);
    return { available: true, path: existing, freeBytes, totalBytes };
  } catch (err) {
    return { available: false, path: target, freeBytes: null, totalBytes: null, error: err.message };
  }
}

function requiredWorkingSpace(bytesRequired = 0) {
  const payload = Math.max(0, Number(bytesRequired || 0));
  // Staging + rollback can temporarily duplicate changed files. Keep an extra safety margin.
  return Math.max(512 * MB, Math.ceil(payload * 2.35 + 256 * MB));
}

async function ensureFreeSpace(target, bytesRequired = 0) {
  const disk = await diskInfo(target);
  const requiredBytes = requiredWorkingSpace(bytesRequired);
  if (disk.available && Number.isFinite(disk.freeBytes) && disk.freeBytes < requiredBytes) {
    const freeGb = (disk.freeBytes / GB).toFixed(1);
    const needGb = (requiredBytes / GB).toFixed(1);
    throw new Error(`No hay espacio suficiente para actualizar Eternal Craft. Libres: ${freeGb} GB · necesarios temporalmente: ${needGb} GB.`);
  }
  return { ...disk, requiredBytes };
}

async function systemProfile(installDirectory, bytesRequired = 0) {
  const totalMemoryBytes = os.totalmem();
  const freeMemoryBytes = os.freemem();
  const disk = await diskInfo(installDirectory);
  const gpus = await detectGpus().catch(() => []);
  return {
    platform: process.platform,
    arch: process.arch,
    totalMemoryBytes,
    freeMemoryBytes,
    recommendedRamGb: recommendedRamGb(totalMemoryBytes),
    maxRamGb: maxRamGb(totalMemoryBytes),
    gpus,
    disk: { ...disk, requiredBytes: requiredWorkingSpace(bytesRequired) }
  };
}

module.exports = { diskInfo, ensureFreeSpace, systemProfile, recommendedRamGb, maxRamGb, requiredWorkingSpace };
