#!/usr/bin/env node
const fs=require('fs');
const fsp=require('fs/promises');
const path=require('path');
const os=require('os');
const {spawnSync}=require('child_process');
const sourceArg=process.argv.find(v=>v.startsWith('--source='));
const source=path.resolve(sourceArg?sourceArg.slice('--source='.length):path.join(os.homedir(),'.sklauncher','instances','siege'));
const roots=[source,path.join(source,'.minecraft'),path.join(source,'minecraft')];
const targets={
  'assets/siege/textures/gui/backgrounds/frontline_19.png':'frontline.png',
  'assets/siege/textures/gui/backgrounds/night_battle.png':'night.png',
  'assets/siege/textures/gui/backgrounds/canyon_engagement.png':'canyon.png',
  'assets/siege/textures/gui/backgrounds/anniversary.png':'anniversary.png',
  'assets/siege/textures/gui/backgrounds/cyborg.png':'cyborg.png',
  'assets/siege/textures/gui/backgrounds/dummies_assault.png':'dummies.png',
  'assets/siege/textures/gui/backgrounds/earth_orbit.png':'orbit.png',
  'assets/siege/textures/gui/backgrounds/last_stand.png':'laststand.png',
  'assets/siege/textures/gui/backgrounds/vought_siege.png':'vought.png',
  'assets/siege/textures/gui/backgrounds/night_operation.png':'nightop.png',
  'assets/siege/textures/gui/backgrounds/rooftop_squad.png':'rooftop.png',
  'assets/siege/textures/gui/backgrounds/tempest_jutcherson.png':'tempest.png',
  'assets/siege/textures/gui/backgrounds/urban_rendezvous.png':'urban.png'
};
async function findMods(){for(const root of roots){const dir=path.join(root,'mods');try{if((await fsp.stat(dir)).isDirectory())return dir;}catch(_){}}return'';}
function listJar(file){const r=spawnSync('unzip',['-Z1',file],{encoding:'utf8',maxBuffer:16*1024*1024});return r.status===0?r.stdout:'';}
function extract(file,entry){const r=spawnSync('unzip',['-p',file,entry],{encoding:null,maxBuffer:16*1024*1024});return r.status===0&&r.stdout?.length?r.stdout:null;}
(async()=>{if(process.platform==='win32'){console.log('Visuales SIEGE ya vienen empaquetados en la build de Windows.');return;}const mods=await findMods();if(!mods){console.log('No encontré la carpeta mods; mantengo los fondos incluidos.');return;}const names=(await fsp.readdir(mods)).filter(n=>/\.jar$/i.test(n));const ordered=[...names.filter(n=>/siege/i.test(n)),...names.filter(n=>!/siege/i.test(n))];let selected='',listing='';for(const name of ordered){const file=path.join(mods,name);const list=listJar(file);if(Object.keys(targets).some(e=>list.includes(e))){selected=file;listing=list;break;}}if(!selected){console.log('No encontré fondos SIEGE dentro de los mods.');return;}const out=path.join(process.cwd(),'src','renderer','assets','siege');await fsp.mkdir(out,{recursive:true});let count=0;for(const[entry,name]of Object.entries(targets)){if(!listing.includes(entry))continue;const buf=extract(selected,entry);if(!buf)continue;await fsp.writeFile(path.join(out,name),buf);count++;}console.log(`Fondos SIEGE sincronizados: ${count}/${Object.keys(targets).length} desde ${path.basename(selected)}`);})().catch(err=>{console.error(err.message||err);process.exit(0)});
