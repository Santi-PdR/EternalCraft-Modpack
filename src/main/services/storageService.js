const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

async function dirStats(root, opts = {}) {
  const maxDepth = Number.isFinite(opts.maxDepth) ? opts.maxDepth : 12;
  let bytes = 0, files = 0;
  async function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries=[]; try { entries=await fsp.readdir(dir,{withFileTypes:true}); } catch (_) { return; }
    for (const e of entries) {
      const full=path.join(dir,e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) await walk(full,depth+1);
      else if (e.isFile()) { try { const st=await fsp.stat(full); bytes+=st.size; files++; } catch (_) {} }
    }
  }
  await walk(root,0); return { bytes, files };
}
async function storageSummary(root) {
  const targets={
    mods:path.join(root,'mods'), config:path.join(root,'config'), logs:path.join(root,'logs'),
    cache:path.join(root,'.launcher','cache'), recovery:path.join(root,'.launcher','snapshots'),
    screenshots:path.join(root,'screenshots')
  };
  const out={}; for (const [k,v] of Object.entries(targets)) out[k]=await dirStats(v);
  out.totalManagedBytes=out.mods.bytes+out.config.bytes+out.cache.bytes+out.recovery.bytes+out.logs.bytes;
  return out;
}
async function cleanupLogs(root, days=14) {
  const dir=path.join(root,'logs'); const cutoff=Date.now()-Math.max(1,Number(days)||14)*86400000;
  let entries=[]; try { entries=await fsp.readdir(dir,{withFileTypes:true}); } catch (_) { return {removed:0,bytes:0}; }
  let removed=0, bytes=0;
  for (const e of entries) {
    if (!e.isFile()) continue; const full=path.join(dir,e.name);
    try { const st=await fsp.stat(full); if(st.mtimeMs<cutoff){bytes+=st.size;await fsp.rm(full,{force:true});removed++;} } catch (_) {}
  }
  return {removed,bytes};
}
module.exports={dirStats,storageSummary,cleanupLogs};
