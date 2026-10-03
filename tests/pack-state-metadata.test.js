const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {readState}=require('../src/main/services/packService');

test('installed-pack state exposes version and Forge metadata without a file-index or hash scan',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'eternal-pack-state-'));
  try{
    await fs.writeFile(path.join(root,'.eternal-pack.json'),JSON.stringify({version:'1.0.8',minecraft:'1.20.1',forge:'47.4.10',minimumLauncher:'0.80.0',forgeInstaller:{url:'https://example.org/forge.jar',sha256:'a'.repeat(64)},updatedAt:'2026-10-01T00:00:00.000Z'}));
    const state=await readState(root);
    assert.equal(state.version,'1.0.8');assert.equal(state.minecraft,'1.20.1');assert.equal(state.forge,'47.4.10');assert.equal(state.minimumLauncher,'0.80.0');assert.equal(state.forgeInstaller.sha256,'a'.repeat(64));
  }finally{await fs.rm(root,{recursive:true,force:true});}
});

test('legacy or missing state remains a safe, empty play-check result',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'eternal-pack-state-'));
  try{assert.deepEqual(await readState(root),{version:null,minecraft:null,forge:null,forgeInstaller:null,minimumLauncher:null,updatedAt:null});}
  finally{await fs.rm(root,{recursive:true,force:true});}
});
