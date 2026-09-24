const path = require('path');
const fsp = require('fs/promises');

const FILE = path.join('.launcher', 'change-history.json');

async function readHistory(root) {
  try {
    const data = JSON.parse(await fsp.readFile(path.join(root, FILE), 'utf8'));
    return Array.isArray(data?.events) ? data : { events: [] };
  } catch (_) { return { events: [] }; }
}

async function writeHistory(root, data) {
  const file = path.join(root, FILE);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fsp.rename(tmp, file);
}

function cleanEvent(event = {}) {
  const at = event.at || new Date().toISOString();
  return {
    id: String(event.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    at,
    type: String(event.type || 'change').slice(0, 48),
    title: String(event.title || 'Cambio').slice(0, 140),
    detail: String(event.detail || '').slice(0, 500),
    filenames: Array.isArray(event.filenames) ? event.filenames.map((v) => String(v).slice(0, 220)).slice(0, 40) : [],
    source: String(event.source || 'launcher').slice(0, 48),
    risk: ['low', 'medium', 'high'].includes(String(event.risk)) ? String(event.risk) : 'low'
  };
}

async function recordChange(root, event) {
  const data = await readHistory(root);
  data.events.unshift(cleanEvent(event));
  data.events = data.events.slice(0, 100);
  await writeHistory(root, data);
  return data.events[0];
}

async function listChanges(root, limit = 25) {
  const data = await readHistory(root);
  return data.events.slice(0, Math.max(1, Math.min(100, Number(limit) || 25)));
}

async function changesSince(root, since, limit = 25) {
  const threshold = new Date(since || 0).getTime();
  const rows = await listChanges(root, 100);
  return rows.filter((row) => new Date(row.at).getTime() >= threshold).slice(0, limit);
}

async function clearChanges(root) {
  await writeHistory(root, { events: [] });
  return true;
}

module.exports = { recordChange, listChanges, changesSince, clearChanges };
