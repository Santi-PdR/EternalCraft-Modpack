async function probe(url, timeoutMs=5500) {
  const started=Date.now(); const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try {
    const r=await fetch(url,{method:'GET',signal:controller.signal,headers:{'User-Agent':'EternalCraftLauncher/0.25.0'}});
    return {ok:r.ok,status:r.status,latency:Date.now()-started};
  } catch(err){ return {ok:false,status:0,latency:Date.now()-started,error:err.name==='AbortError'?'timeout':(err.message||String(err))}; }
  finally { clearTimeout(timer); }
}
async function connectivityReport(config) {
  const packUrl=String(config.pack?.manifestUrl||'');
  const targets=[
    ['Modrinth','https://api.modrinth.com/v2/tag/loader'],
    ['GitHub','https://api.github.com/'],
  ];
  if(/^https?:\/\//i.test(packUrl)) targets.unshift(['Canal del pack',packUrl]);
  const results=[]; for(const [name,url] of targets){results.push({name,url,...await probe(url)});} return {checkedAt:new Date().toISOString(),results,online:results.some(r=>r.ok)};
}
module.exports={probe,connectivityReport};
