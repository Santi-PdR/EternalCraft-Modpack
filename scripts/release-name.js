function clean(paths = []) { return paths.map(p => String(p).toLowerCase()); }
function hasAny(paths, words) { return paths.some(p => words.some(w => p.includes(w))); }
function twoWordReleaseName(changes = {}) {
  const added = clean(changes.added || []); const changed = clean(changes.changed || []); const removed = clean(changes.removed || []); const all = [...added, ...changed, ...removed];
  const mods = all.filter(p => p.startsWith('mods/'));
  if (removed.length > Math.max(added.length, changed.length) && removed.length >= 3) return 'Clean Sweep';
  if (hasAny(mods, ['embeddium','sodium','rubidium','modernfix','ferrite','culling','spark','memory','performance'])) return 'Core Boost';
  if (hasAny(mods, ['gun','weapon','combat','tacz','tac','siege','soldier','army','ballistic'])) return 'Steel Surge';
  if (hasAny(mods, ['create','tech','machine','industrial','mekanism','thermal'])) return 'Machine Rise';
  if (hasAny(mods, ['magic','spell','mana','ars_','irons_spell','wizard'])) return 'Arcane Pulse';
  if (hasAny(mods, ['dimension','worldgen','biome','structure','dungeon','adventure','travel'])) return 'Frontier Shift';
  if (hasAny(mods, ['zombie','horror','infect','undead','parasite','sculk'])) return 'Dark Outbreak';
  if (mods.length === 0 && all.some(p => p.startsWith('config/'))) return 'System Tune';
  if (added.length > removed.length + changed.length) return 'Content Drop';
  if (changed.length > added.length + removed.length) return 'Pack Refresh';
  return 'Siege Update';
}
function nextVersion(previous, changes = {}) {
  if (!previous || !/^\d+\.\d+\.\d+$/.test(String(previous))) return '1.0.0';
  let [major,minor,patch] = String(previous).split('.').map(Number);
  const modAddRemove = [...(changes.added||[]),...(changes.removed||[])].filter(p=>String(p).startsWith('mods/')).length;
  if (modAddRemove >= 8) { minor += 1; patch = 0; }
  else patch += 1;
  return `${major}.${minor}.${patch}`;
}
module.exports = { twoWordReleaseName, nextVersion };
