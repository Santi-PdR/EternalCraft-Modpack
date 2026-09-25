const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { pathToFileURL } = require('url');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv']);
const MAX_ITEMS = 500;

function isInside(root, candidate) {
  const base = path.resolve(root);
  const value = path.resolve(candidate);
  return value === base || value.startsWith(`${base}${path.sep}`);
}

function mediaType(file) {
  const ext = path.extname(file).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  return '';
}

async function walk(root, depth = 0, output = []) {
  if (depth > 2 || output.length >= MAX_ITEMS) return output;
  let entries;
  try { entries = await fsp.readdir(root, { withFileTypes: true }); } catch (_) { return output; }
  entries.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  for (const entry of entries) {
    if (output.length >= MAX_ITEMS) break;
    if (entry.name.startsWith('.')) continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) { await walk(full, depth + 1, output); continue; }
    const type = mediaType(full); if (!type) continue;
    try {
      const stat = await fsp.stat(full);
      output.push({
        name: entry.name,
        path: full,
        url: pathToFileURL(full).href,
        type,
        size: stat.size,
        modifiedAt: stat.mtime.toISOString()
      });
    } catch (_) {}
  }
  return output;
}

async function listMedia(directory) {
  const root = path.resolve(String(directory || '').trim());
  let valid = false;
  try { valid = Boolean(directory) && fs.statSync(root).isDirectory(); } catch (_) { valid = false; }
  if (!valid) return { configured: false, directory: '', items: [], total: 0, images: 0, videos: 0 };
  const items = await walk(root);
  items.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  return { configured: true, directory: root, items, total: items.length, images: items.filter((x) => x.type === 'image').length, videos: items.filter((x) => x.type === 'video').length };
}

function isAllowedFile(root, file) {
  const absolute = path.resolve(String(file || ''));
  return isInside(root, absolute) && Boolean(mediaType(absolute));
}

module.exports = { listMedia, isAllowedFile };
