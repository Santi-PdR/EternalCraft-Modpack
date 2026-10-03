const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { getManifestQuick } = require('../src/main/services/manifestService');

const validManifest={schema:2,version:'1.0.9',minecraft:'1.20.1',forge:'47.4.10',minimumLauncher:'0.80.0',files:[],remove:[]};

async function withTempDir(run){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'eternal-manifest-'));
  try{return await run(root)}finally{await fs.rm(root,{recursive:true,force:true});}
}

test('quick manifest lookup returns the last validated cache after one bounded network attempt', async () => {
  await withTempDir(async(root)=>{
    const local=path.join(root,'example.json'),cache=path.join(root,'cache.json');
    await fs.writeFile(local,JSON.stringify({...validManifest,version:'example'}));
    await fs.writeFile(cache,JSON.stringify({cachedAt:'2026-10-01T00:00:00.000Z',source:'stable',manifest:validManifest}));
    const previous=process.env.ETERNAL_PACK_MANIFEST;delete process.env.ETERNAL_PACK_MANIFEST;
    try{
      const result=await getManifestQuick({pack:{manifestUrl:'http://127.0.0.1:1/offline.json'}},local,cache,120);
      assert.equal(result.configured,true);assert.equal(result.stale,true);assert.equal(result.source,'cache');assert.equal(result.manifest.version,'1.0.9');
    }finally{if(previous!==undefined)process.env.ETERNAL_PACK_MANIFEST=previous;}
  });
});

test('quick manifest lookup validates and caches a live official manifest', async () => {
  await withTempDir(async(root)=>{
    const local=path.join(root,'example.json'),cache=path.join(root,'cache.json');
    await fs.writeFile(local,JSON.stringify(validManifest));
    const server=http.createServer((_request,response)=>{response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify(validManifest));});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const previous=process.env.ETERNAL_PACK_MANIFEST;delete process.env.ETERNAL_PACK_MANIFEST;
    try{
      const url=`http://127.0.0.1:${server.address().port}/stable.json`;
      const result=await getManifestQuick({pack:{manifestUrl:url}},local,cache,500);
      assert.equal(result.configured,true);assert.equal(result.stale,false);assert.equal(result.manifest.version,'1.0.9');
      assert.equal(JSON.parse(await fs.readFile(cache,'utf8')).manifest.version,'1.0.9');
    }finally{
      if(previous!==undefined)process.env.ETERNAL_PACK_MANIFEST=previous;
      await new Promise(resolve=>server.close(resolve));
    }
  });
});
