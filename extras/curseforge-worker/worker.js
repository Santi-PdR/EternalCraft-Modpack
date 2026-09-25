const API='https://api.curseforge.com/v1';
const CATEGORY_NAMES={optimization:['performance','server utility'],client:['client side'],qol:['utility','qol'],technology:['technology'],adventure:['adventure','rpg'],worldgen:['world gen'],mobs:['mobs'],magic:['magic'],equipment:['armor','tools','weapons'],decoration:['cosmetic','decoration'],storage:['storage'],library:['library','api'],food:['food'],transportation:['transport']};
function json(data,status=200,maxAge=120){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=utf-8','access-control-allow-origin':'*','cache-control':`public,max-age=${maxAge}`}})}
async function cf(path,key){const r=await fetch(`${API}${path}`,{headers:{accept:'application/json','x-api-key':key}});if(!r.ok)throw new Error(`CurseForge ${r.status}`);return r.json()}
async function categoryId(key,category){const wanted=CATEGORY_NAMES[category]||[];if(!wanted.length)return'';try{const data=await cf('/categories?gameId=432&classId=6',key);const hit=(data.data||[]).find(c=>wanted.some(w=>String(c.name||'').toLowerCase().includes(w)));return hit?.id?String(hit.id):''}catch(_){return''}}
function project(x){return{provider:'curseforge',id:String(x.id),name:x.name,slug:x.slug||'',summary:x.summary||'',author:(x.authors||[])[0]?.name||'',iconUrl:x.logo?.thumbnailUrl||'',downloads:x.downloadCount||0,updatedAt:x.dateModified||'',createdAt:x.dateCreated||'',websiteUrl:x.links?.websiteUrl||'',categories:(x.categories||[]).map(c=>c.name),sourceUrl:x.links?.sourceUrl||'',wikiUrl:x.links?.wikiUrl||''}}
export default{async fetch(req,env){try{
  if(req.method==='OPTIONS')return new Response(null,{headers:{'access-control-allow-origin':'*','access-control-allow-methods':'GET,OPTIONS','access-control-allow-headers':'content-type'}});
  if(!env.CF_API_KEY)return json({error:'CF_API_KEY no configurada'},503);
  const u=new URL(req.url);
  if(u.pathname==='/search'){
    const q=u.searchParams.get('q')||'';const sort=u.searchParams.get('sort')||'updated';const category=u.searchParams.get('category')||'all';
    const sortField=sort==='downloads'?'6':sort==='relevance'?'2':sort==='newest'?'11':'3';
    const offset=Math.max(0,Number(u.searchParams.get('offset')||0));
    const qs=new URLSearchParams({gameId:'432',classId:'6',gameVersion:'1.20.1',modLoaderType:'1',searchFilter:q,sortField,sortOrder:'desc',pageSize:'30',index:String(offset)});
    const cid=await categoryId(env.CF_API_KEY,category);if(cid)qs.set('categoryId',cid);
    const data=await cf(`/mods/search?${qs}`,env.CF_API_KEY);return json({results:(data.data||[]).map(project)});
  }
  if(u.pathname==='/project'){
    const id=u.searchParams.get('projectId');if(!id)return json({error:'projectId requerido'},400);
    const data=await cf(`/mods/${encodeURIComponent(id)}`,env.CF_API_KEY);const p=project(data.data||{});
    const screenshots=(data.data?.screenshots||[]).slice(0,6).map(x=>({url:x.url,title:x.title||'',description:x.description||''}));
    return json({project:{...p,gallery:screenshots,body:'',license:data.data?.allowModDistribution===false?'Distribución restringida':''}},200,300);
  }
  if(u.pathname==='/file'){
    const id=u.searchParams.get('projectId');if(!id)return json({error:'projectId requerido'},400);
    const qs=new URLSearchParams({gameVersion:'1.20.1',modLoaderType:'1',pageSize:'50'});const data=await cf(`/mods/${id}/files?${qs}`,env.CF_API_KEY);const raw=(data.data||[])[0];if(!raw)return json({error:'No hay archivo Forge 1.20.1'},404);
    let downloadUrl=raw.downloadUrl;if(!downloadUrl){const d=await cf(`/mods/${id}/files/${raw.id}/download-url`,env.CF_API_KEY);downloadUrl=d.data;}
    return json({file:{id:raw.id,fileName:raw.fileName,downloadUrl,displayName:raw.displayName||'',datePublished:raw.fileDate||''}});
  }
  if(u.pathname==='/categories'){
    const data=await cf('/categories?gameId=432&classId=6',env.CF_API_KEY);return json({categories:(data.data||[]).map(x=>({id:x.id,name:x.name,slug:x.slug||'',iconUrl:x.iconUrl||''}))},200,3600);
  }
  return json({ok:true,service:'Eternal Craft CurseForge proxy',version:'0.60.0'},200);
}catch(e){return json({error:e.message||String(e)},500)}}}
