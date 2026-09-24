#!/usr/bin/env node
const fsp = require('fs/promises');
const path = require('path');

const BASE = 'https://raw.githubusercontent.com/Santi-PdR/Siege/main/src/main/resources/assets/siege/textures/gui/backgrounds';
const FILES = {
  'frontline_19.png':'frontline.png',
  'night_battle.png':'night.png',
  'canyon_engagement.png':'canyon.png',
  'anniversary.png':'anniversary.png',
  'cyborg.png':'cyborg.png',
  'dummies_assault.png':'dummies.png',
  'earth_orbit.png':'orbit.png',
  'last_stand.png':'laststand.png',
  'vought_siege.png':'vought.png',
  'night_operation.png':'nightop.png',
  'rooftop_squad.png':'rooftop.png',
  'tempest_jutcherson.png':'tempest.png',
  'urban_rendezvous.png':'urban.png'
};

async function main(){
  const out=path.join(process.cwd(),'src','renderer','assets','siege');
  await fsp.mkdir(out,{recursive:true});
  let ok=0;
  for(const [remote,local] of Object.entries(FILES)){
    try{
      const res=await fetch(`${BASE}/${remote}`,{headers:{'User-Agent':'EternalCraftLauncher-build/0.25.0'}});
      if(!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf=Buffer.from(await res.arrayBuffer());
      if(buf.length<1024) throw new Error('archivo demasiado pequeño');
      await fsp.writeFile(path.join(out,local),buf);
      ok++;
      console.log(`✓ ${remote} -> ${local}`);
    }catch(err){
      console.warn(`! ${remote}: ${err.message}`);
    }
  }
  console.log(`Visuales SIEGE incluidos: ${ok}/${Object.keys(FILES).length}`);
  if(ok < 3) console.warn('Se usarán fondos SVG de respaldo donde falten PNGs.');
}
main().catch(err=>{console.error(err);process.exit(1)});
