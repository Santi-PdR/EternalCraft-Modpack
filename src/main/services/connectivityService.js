async function probe(url, timeoutMs=5500, attempts=2) {
  let last={ok:false,status:0,latency:0,error:'sin conexión'};
  for(let attempt=1;attempt<=attempts;attempt++){
    const started=Date.now(); const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),timeoutMs);
    try {
      const r=await fetch(url,{method:'GET',signal:controller.signal,headers:{'User-Agent':'EternalCraftLauncher/0.65.38',Accept:'application/json,text/plain,*/*'}});
      const result={ok:r.ok,status:r.status,latency:Date.now()-started};
      if(r.ok || (![408,425,429].includes(r.status) && r.status<500)) return result;
      last=result;
    } catch(err){ last={ok:false,status:0,latency:Date.now()-started,error:err.name==='AbortError'?'timeout':(err.message||String(err))}; }
    finally { clearTimeout(timer); }
    if(attempt<attempts)await new Promise(resolve=>setTimeout(resolve,250*attempt));
  }
  return last;
}
async function connectivityReport(config) {
  const packUrl=String(config.pack?.manifestUrl||'');
  const targets=[
    ['GitHub','https://api.github.com/',true],
  ];
  if(/^https?:\/\//i.test(packUrl)) targets.unshift(['Canal del pack',packUrl,true]);
  const results=[]; for(const [name,url,critical] of targets){results.push({name,url,critical,...await probe(url)});} return {checkedAt:new Date().toISOString(),results,online:results.filter(r=>r.critical).length>0&&results.filter(r=>r.critical).every(r=>r.ok)};
}
module.exports={probe,connectivityReport};
