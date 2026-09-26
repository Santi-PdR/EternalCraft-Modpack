const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const mockConfig = {
  server:{host:'SiegeLacontinuacion.exaroton.me',port:18736},
  minecraft:{version:'1.20.1',forgeVersion:'47.4.10',username:'Santipdr',minMemoryMb:2048,maxMemoryMb:6144,width:1920,height:1080,useSystemResolution:true,fullscreen:false,javaPath:'',preset:'balanced',autoInstallJava:true,preferDedicatedGpu:true},
  pack:{channel:'stable',installDirectory:'/home/user/.config/eternal-craft-launcher/EternalCraft',autoUpdate:true,repairBeforeLaunch:false,manifestUrl:'preview'},
  launcher:{hideOnGameStart:false,refocusOnGameExit:true,background:'frontline',backgroundMode:'fixed',theme:'aurora',accent:'',accent2:'',cardRadius:16,clipsDirectory:'',density:'comfortable',glassEffects:true,scanlines:false,noise:false,reducedMotion:false,uiScale:'normal',startPage:'home',rememberLastPage:false,lastPage:'home',notifications:true,nativeNotifications:true,closeToTray:true,startWithSystem:false,startMinimized:false,autoUpdate:true,updateFeedUrl:'',lastPlayedAt:'',lastSession:null},
  developer:{sourceDirectory:'~/.sklauncher/instances/siege',testDirectory:'~/.sklauncher/instances/test-1',githubRepo:'',githubBranch:'main'},
  mods:{allowUserMods:true,sort:'recent',compatibilityWarnings:true,hideWarnings:false,protectServerCompatibility:true,autoChangeSnapshots:true},
  sync:{vaultDirectory:'',includeScreenshots:true,includeSaves:false,extraPaths:[]},
  onboarding:{completed:true},links:{}
};
const mockManifest = {
  schema:2,version:'1.0.0',releaseName:'Siege Origin',minecraft:'1.20.1',forge:'47.4.10',minimumLauncher:'0.65.12',files:[],remove:[],
  releaseNotes:{title:'SIEGE DEV',summary:'Base del launcher renovada y sistema de actualización segura.',addedCount:2,changedCount:4,removedCount:0,highlights:[{type:'changed',path:'mods/siege-menu.jar'},{type:'added',path:'config/eternal-client.toml'}]}
};

function merge(target, patch){
  const out={...(target||{})};
  for(const [k,v] of Object.entries(patch||{})) out[k]=v&&typeof v==='object'&&!Array.isArray(v)?merge(out[k]||{},v):v;
  return out;
}

const previewApi = {
  getState:async()=>({appVersion:'0.65.12',platform:'preview',packaged:false,config:mockConfig,manifest:mockManifest,manifestConfigured:true,manifestSource:'development',java:{found:true,major:17,version:'17.0.x',path:'java'},needsOnboarding:false,launcherUpdateConfigured:false,minimumLauncher:'0.65.12',launcherCompatible:true,developer:{configured:false,unlocked:false,developerAllowed:false},account:{authenticated:false,name:'',id:'',skins:[]},system:{recommendedRamGb:6,maxRamGb:11,totalMemoryBytes:16*1024**3,gpus:[{vendor:'NVIDIA',name:'NVIDIA GeForce GTX 1050'}],display:{width:1920,height:1080,workWidth:1920,workHeight:1040,scaleFactor:1,label:'Monitor principal'},disk:{available:true,freeBytes:180*1024**3,totalBytes:480*1024**3,requiredBytes:512*1024**2}}}),
  completeOnboarding:async(p)=>{mockConfig.minecraft.username=p.username;mockConfig.onboarding.completed=true;return previewApi.getState()},
  pingServer:async()=>({online:true,latency:57,players:{online:12,max:40},version:'Forge 1.20.1',favicon:null}),
  checkPack:async()=>({configured:true,state:{version:'SIEGE-DEV',updatedAt:new Date().toISOString()},expectedVersion:'SIEGE-DEV',versionMatches:true,total:247,ok:247,missing:[],changed:[],remove:[],bytesRequired:0,healthy:true}),
  updatePack:async()=>previewApi.checkPack(),repairPack:async()=>previewApi.checkPack(),
  listMods:async()=>({mods:[
    {filename:'embeddium-0.3.31.jar',displayName:'Embeddium 0.3.31',enabled:true,official:true,userAdded:false,size:1832000},
    {filename:'siege-menu-0.9.0.jar',displayName:'SIEGE Menu 0.9.0',enabled:true,official:true,userAdded:false,size:10800000},
    {filename:'voicechat-forge-1.20.1.jar',displayName:'Simple Voice Chat',enabled:true,official:true,userAdded:false,size:5200000},
    {filename:'my-extra-mod.jar',displayName:'My Extra Mod',enabled:true,official:false,userAdded:true,size:830000,provider:'local',projectId:'demo1',pinned:true},
    {filename:'client-helper.jar.disabled',displayName:'Client Helper',enabled:false,official:false,userAdded:true,size:420000}
  ],counts:{total:5,official:3,user:2,disabled:1,favorites:1,pinned:1}}),
  addMods:async()=>previewApi.listMods(),toggleMod:async()=>previewApi.listMods(),removeMod:async()=>previewApi.listMods(),favoriteMod:async()=>({favorite:true,listing:await previewApi.listMods()}),pinMod:async()=>({pinned:true,listing:await previewApi.listMods()}),setAllUserModsEnabled:async()=>({changed:[],listing:await previewApi.listMods()}),  modChangeHistory:async()=>[{id:'h1',at:new Date(Date.now()-12*60000).toISOString(),type:'mod-update',title:'ModernFix actualizado',detail:'modernfix-5.20.jar → modernfix-5.21.jar',filenames:['modernfix-5.21.jar'],risk:'high',source:'local'},{id:'h2',at:new Date(Date.now()-45*60000).toISOString(),type:'mod-install',title:'Client Helper instalado',detail:'1 archivo',filenames:['client-helper.jar'],risk:'medium',source:'local'}],crashGuard:async()=>({diagnostic:{severity:'warn',title:'Conflicto entre mods',summary:'Se detectó un error de carga.'},crashStreak:2,lastSession:{code:1,startedAt:new Date(Date.now()-20*60000).toISOString()},recentChanges:[],suspects:[{filename:'my-extra-mod.jar',name:'My Extra Mod',changeType:'mod-update',changedAt:new Date(Date.now()-12*60000).toISOString(),risk:'high',enabled:true,provider:'local'}]}),disableCrashSuspects:async()=>({changed:['my-extra-mod.jar'],listing:await previewApi.listMods()}),
  auditMods:async()=>({ok:true,counts:{bad:0,warn:0,info:1},issues:[{severity:'info',type:'unidentified',mod:'My Extra Mod',filename:'my-extra-mod.jar',text:'Mod local sin identificar; no puede actualizarse automáticamente.'}],checkedAt:new Date().toISOString(),total:5,user:2}),
    listRecoveryPoints:async()=>[{id:'demo',label:'Antes de actualizar a 1.0.1',createdAt:new Date(Date.now()-3600000).toISOString(),packVersion:'1.0.1',userMods:2}],createRecoveryPoint:async(label)=>({id:'new',label,createdAt:new Date().toISOString(),packVersion:'1.0.0',userMods:2}),restoreRecoveryPoint:async()=>({result:{},mods:await previewApi.listMods()}),deleteRecoveryPoint:async()=>true,healthCheck:async()=>({ok:true,issues:[],javaOk:true,packOk:true,serverOnline:true,userMods:2,disabledMods:1,diagnostic:{severity:'ok'}}),
  developerStatus:async()=>({configured:false,unlocked:false}),developerSetup:async()=>({configured:true,unlocked:true}),developerUnlock:async()=>({configured:true,unlocked:true}),developerResetAccess:async()=>({configured:false,unlocked:false}),developerLock:async()=>({configured:true,unlocked:false}),developerChangePassword:async()=>({configured:true,unlocked:true}),developerChooseSource:async()=>'/home/Santipdr/.sklauncher/instances/siege',developerChooseTest:async()=>'/home/Santipdr/.sklauncher/instances/test-1',developerOpenTest:async()=>true,developerLaunchTest:async()=>({pid:2044}),developerCopyModTest:async()=>({ok:true}),developerSyncTestMods:async()=>({ok:true,copied:['demo.jar']}),developerCompareTest:async()=>({counts:{testOnly:1,sourceOnly:0,changed:1,same:190},testOnly:[{name:'new-test-mod.jar',size:123456,modifiedAt:new Date().toISOString()}],changed:[{name:'siege-menu.jar',test:{name:'siege-menu.jar',size:234567,modifiedAt:new Date().toISOString()}}],newest:[]}),developerPromoteTestMod:async(name)=>({ok:true,filename:name}),developerPromoteAllTestMods:async()=>({promoted:['demo.jar'],diff:{counts:{testOnly:0,sourceOnly:0,changed:0,same:192},testOnly:[],changed:[]}}),developerPreviewPublish:async()=>({ok:true,preview:true,previousVersion:'1.0.0',version:'1.0.1',releaseName:'Core Boost',totalFiles:500,added:['mods/new.jar'],changed:['mods/siege.jar'],removed:[],unchanged:498,newBlobCount:2,sourceFingerprint:'preview-fingerprint'}),developerPublish:async()=>({ok:true,state:await previewApi.getState()}),
  installJava:async()=>({java:{found:true,major:17,version:'17.0.x',path:'managed/java',managed:true},config:mockConfig}),
  resetGamePreset:async()=>({applied:true}),launchGame:async()=>({pid:2044}),launchSafeGame:async()=>({pid:2045,safeMode:true,disabledMods:3}),
  buildDiagnostic:async()=> 'ETERNAL CRAFT // DIAGNÓSTICO\nPreview sin acceso al sistema local.',quickDiagnostic:async()=>({severity:'ok',title:'No veo un error claro',summary:'El último log no contiene una causa típica de crash.'}),copyDiagnostic:async()=>true,saveDiagnostic:async()=>'/tmp/EternalCraft-Diagnostico.txt',exportSupportBundle:async()=>'/tmp/EternalCraft-Soporte.json',
  saveSettings:async(p)=>{const next=merge(mockConfig,p);Object.assign(mockConfig,next);return mockConfig},exportSettings:async()=>'/tmp/EternalCraft-Ajustes.json',importSettings:async()=>mockConfig,clearPackCache:async()=>({clearedFiles:12,clearedBytes:120*1024*1024}),getStorageSummary:async()=>({mods:{bytes:2100*1024*1024,files:196},config:{bytes:12*1024*1024,files:81},cache:{bytes:210*1024*1024,files:14},recovery:{bytes:360*1024*1024,files:45},logs:{bytes:8*1024*1024,files:12}}),cleanupLogs:async()=>({removed:5,bytes:3*1024*1024}),vaultStatus:async()=>({configured:Boolean(mockConfig.sync?.vaultDirectory),directory:mockConfig.sync?.vaultDirectory||'',paths:['options.txt','servers.dat','screenshots'],files:42,bytes:28*1024*1024,lastPush:new Date(Date.now()-3600000).toISOString(),sourceDevice:'SANTI-PC',conflicts:[]}),chooseVaultDirectory:async()=>{mockConfig.sync.vaultDirectory='/home/user/Nextcloud/Eternal';return {config:mockConfig,status:await previewApi.vaultStatus()}},pushVault:async()=>({ok:true,files:42,bytes:28*1024*1024,createdAt:new Date().toISOString(),paths:['options.txt','servers.dat','screenshots']}),pullVault:async()=>({ok:true,copied:42,bytes:28*1024*1024,conflicts:0,createdAt:new Date().toISOString()}),connectivityCheck:async()=>({online:true,checkedAt:new Date().toISOString(),results:[{name:'Canal del pack',ok:true,latency:108},{name:'GitHub',ok:true,latency:124}]}),chooseInstallDirectory:async()=>mockConfig.pack.installDirectory,
  checkLauncherUpdate:async()=>({configured:false,development:true}),downloadLauncherUpdate:async()=>true,installLauncherUpdate:async()=>true,
  copyServerAddress:async()=>true,openInstance:async()=>'',openLogs:async()=>'',openLatestLog:async()=>'',openExternal:async()=>true,minimize:()=>{},toggleMaximize:()=>{},close:()=>{},clipsList:async()=>({configured:false,items:[],total:0,images:0,videos:0}),clipsChooseFolder:async()=>({configured:true,directory:'/home/user/Videos',items:[],total:0,images:0,videos:0}),clipsOpenFolder:async()=>true,clipsOpen:async()=>true,clipsClearFolder:async()=>({}),accountRefresh:async()=>({authenticated:true,name:mockConfig.minecraft.username||'Jugador',id:'preview',skins:[]}),accountSkins:async()=>({authenticated:true,name:mockConfig.minecraft.username||'Jugador',id:'preview',skins:[]}),accountUploadSkin:async()=>({authenticated:true,name:mockConfig.minecraft.username||'Jugador',id:'preview',skins:[]}),chooseSkinFile:async()=>null,
  onPackProgress:()=>()=>{},onGameLog:()=>()=>{},onGameExit:()=>()=>{},onMaximized:()=>()=>{},onLauncherUpdate:()=>()=>{},onDeveloperPublishLog:()=>()=>{},onUiCommand:()=>()=>{}
};
previewApi.accountStatus=async()=>({authenticated:false,name:'',id:''});
previewApi.accountLogin=async()=>({authenticated:true,name:mockConfig.minecraft.username||'Jugador',id:'preview'});
previewApi.accountLogout=async()=>({authenticated:false,name:'',id:''});
const api = window.eternal || previewApi;

let appState=null;
let packState=null;
let serverState=null;
let busy=false;
let launcherUpdateMode='check';
let serverTimer=null;
let opStats=null;
let modsState={mods:[],counts:{total:0,official:0,user:0,disabled:0}};
let modFilter='all';
let developerState={configured:false,unlocked:false};
let testDiffState=null;
let publishPreview=null;
let startupBackgroundApplied=false;
let backgroundRotationTimer=null;
let recoveryState=[];
let notificationHistory=[];
let notificationUnread=false;
const ignoredModWarnings=new Set();
let updateCenterState={pack:null,mods:null,launcher:'unknown',lastChecked:null};
let launcherUpdateAvailable=false;
let autoSaveTimer=null;
let operationMinimized=false;
let pingHistory=[];
let settingsGroup='game';
let packRefreshInFlight=null;
let updateCenterInFlight=null;
let healthInFlight=null;
let crashGuardInFlight=null;
let connectivityInFlight=null;
let modAuditInFlight=null;
let globalErrorAt=0;
let clipsState={configured:false,directory:'',items:[],total:0,images:0,videos:0};
let skinState={authenticated:false,name:'',skins:[]};
let clipsView={query:'',type:'all',sort:'newest'};
let clipsViewSaveTimer=null;

function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function escapeHtml(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}
function formatBytes(bytes){
  const n=Number(bytes||0); if(!n) return '0 MB';
  const units=['B','KB','MB','GB']; let value=n,i=0; while(value>=1024&&i<units.length-1){value/=1024;i++}
  return `${value>=10||i<2?value.toFixed(0):value.toFixed(1)} ${units[i]}`;
}
function formatStorage(bytes){
  const n=Number(bytes||0); if(!Number.isFinite(n)||n<=0)return'—';
  return n>=1024**3?`${(n/1024**3).toFixed(n>=100*1024**3?0:1)} GB`:formatBytes(n);
}
function formatDuration(ms){
  const m=Math.max(0,Math.round(Number(ms||0)/60000));
  if(m<1)return'< 1 min'; if(m<60)return`${m} min`; const h=Math.floor(m/60),r=m%60; return r?`${h} h ${r} min`:`${h} h`;
}
function timeAgo(value){
  if(!value)return'Nunca'; const t=new Date(value).getTime(); if(!Number.isFinite(t))return'—';
  const s=Math.max(0,Math.floor((Date.now()-t)/1000)); if(s<60)return'Hace un momento'; if(s<3600)return`Hace ${Math.floor(s/60)} min`; if(s<86400)return`Hace ${Math.floor(s/3600)} h`; const d=Math.floor(s/86400); return d===1?'Ayer':`Hace ${d} días`;
}
function initial(name){return String(name||'?').trim().slice(0,1).toUpperCase()||'?'}
function footer(text){if($('footerStatus'))$('footerStatus').textContent=text}
function toast(message,type=''){
  const text=String(message||'').trim();
  const duplicate=notificationHistory[0];
  if(duplicate&&duplicate.message===text&&duplicate.type===(type||'info')&&Date.now()-new Date(duplicate.time).getTime()<2500)return;
  const el=document.createElement('div'); el.className=`toast ${type}`.trim(); el.setAttribute('role',type==='error'?'alert':'status'); el.setAttribute('aria-live',type==='error'?'assertive':'polite'); el.textContent=text; $('toastArea').appendChild(el); setTimeout(()=>el.remove(),3800);
  if(text){notificationHistory.unshift({message:text,type:type||'info',time:new Date().toISOString()});notificationHistory=notificationHistory.slice(0,30);notificationUnread=true;renderNotifications();}
}
function reportUnexpectedError(prefix,error){
  const now=Date.now();
  if(now-globalErrorAt<2500)return;
  globalErrorAt=now;
  const detail=String(error?.reason?.message||error?.error?.message||error?.message||error||'Error desconocido').trim();
  toast(`${prefix}: ${detail}`,'error');
}
window.addEventListener('error',(event)=>reportUnexpectedError('Error inesperado',event.error||event.message));
window.addEventListener('unhandledrejection',(event)=>{event.preventDefault();reportUnexpectedError('Operación no completada',event.reason)});
function renderNotifications(){
  const host=$('notificationList'),badge=$('notificationsBadge');if(!host||!badge)return;
  badge.textContent=String(notificationHistory.length);badge.classList.toggle('hidden',notificationHistory.length===0||!notificationUnread);host.innerHTML='';
  if(!notificationHistory.length){host.innerHTML='<div class="empty-state">Todavía no hay notificaciones.</div>';return;}
  for(const item of notificationHistory){const row=document.createElement('div');row.className=`notification-item ${item.type||''}`;row.innerHTML='<i></i><div><b></b><small></small></div>';row.querySelector('b').textContent=item.message;row.querySelector('small').textContent=timeAgo(item.time);host.appendChild(row);}
}
function toggleNotifications(force){const drawer=$('notificationDrawer');if(!drawer)return;const show=typeof force==='boolean'?force:drawer.classList.contains('hidden');drawer.classList.toggle('hidden',!show);if(show){notificationUnread=false;renderNotifications();}}


let dialogResolver=null;
function closeAppDialog(value=null){
  $('appDialog').classList.add('hidden');
  const resolve=dialogResolver; dialogResolver=null;
  if(resolve)resolve(value);
}
function appDialog({title='Confirmar acción',message='',confirmText='Confirmar',cancelText='Cancelar',danger=false,input=false,inputLabel='Valor',value='',placeholder='',password=false}={}){
  if(dialogResolver)closeAppDialog(null);
  $('appDialogTitle').textContent=title; $('appDialogMessage').textContent=message;
  $('appDialogConfirm').textContent=confirmText; $('appDialogCancel').textContent=cancelText;
  $('appDialogConfirm').classList.toggle('danger',Boolean(danger)); $('appDialogMark').classList.toggle('danger',Boolean(danger));
  $('appDialogMark').textContent=danger?'!':input?'✎':'✓';
  const wrap=$('appDialogInputWrap'),field=$('appDialogInput'); wrap.classList.toggle('hidden',!input);
  if(input){$('appDialogInputLabel').textContent=inputLabel;field.type=password?'password':'text';field.value=value;field.placeholder=placeholder;setTimeout(()=>{field.focus();field.select()},40)}
  else setTimeout(()=>$('appDialogConfirm').focus(),40);
  $('appDialog').classList.remove('hidden');
  return new Promise(resolve=>{dialogResolver=resolve});
}
async function askConfirm(options={}){return Boolean(await appDialog(options));}
async function askPrompt(options={}){const r=await appDialog({...options,input:true});return r===null?null:String(r);}

const commandActions=[
  {id:'play',label:'Jugar Eternal Craft',hint:'Iniciar el modpack',icon:'▶',keys:'Ctrl 1',run:()=>launch()},
  {id:'mods',label:'Abrir Mods instalados',hint:'Administrar la instancia local',icon:'◇',keys:'Ctrl 2',run:()=>setPage('mods')},
  {id:'pack',label:'Abrir Modpack',hint:'Estado, actualizaciones y reparación',icon:'▦',keys:'Ctrl 3',run:()=>setPage('modpack')},
  {id:'updates',label:'Abrir Actualizaciones',hint:'Launcher, modpack y mods personales',icon:'↻',keys:'Ctrl 4',run:()=>setPage('updates')},
  {id:'gallery',label:'Abrir Galería',hint:'Capturas y clips guardados localmente',icon:'▧',keys:'Ctrl 7',run:()=>setPage('gallery')},
  {id:'support',label:'Abrir Soporte',hint:'Diagnóstico e inicio seguro',icon:'?',keys:'Ctrl 5',run:()=>setPage('support')},
  {id:'settings',label:'Abrir Ajustes',hint:'Juego, interfaz y sistema',icon:'⚙',keys:'Ctrl 6',run:()=>setPage('settings')},
  {id:'settings-search',label:'Buscar en Ajustes',hint:'Encontrar RAM, resolución, tema, caché y más',icon:'⌕',keys:'',run:()=>{setPage('settings');setTimeout(()=>$('settingsSearch')?.focus(),80)}},
  {id:'repair',label:'Reparar modpack',hint:'Verificar y recuperar archivos',icon:'↻',keys:'',run:()=>runPackAction('repair')},
  {id:'check',label:'Comprobar modpack',hint:'Buscar cambios sin modificar archivos',icon:'✓',keys:'',run:()=>refreshPack(true)},
  {id:'folder',label:'Abrir carpeta del juego',hint:'Ver la instancia administrada',icon:'▣',keys:'',run:()=>api.openInstance()},
  {id:'copyip',label:'Copiar IP del servidor',hint:'Copiar dirección al portapapeles',icon:'⌘',keys:'',run:async()=>{await api.copyServerAddress();toast('IP del servidor copiada.','success')}},
  {id:'safe',label:'Iniciar en modo seguro',hint:'Probar sin mods personales',icon:'◇',keys:'',run:()=>launchSafeGameAction()},
  {id:'refresh-all',label:'Revisar todo el launcher',hint:'Pack, mods, soporte, almacenamiento y galería',icon:'↻',keys:'Ctrl Shift R',run:()=>refreshEverything(true)}
];
let commandIndex=0;
function visibleCommands(){
  const raw=String($('commandPaletteInput')?.value||'').trim(); const q=raw.toLowerCase();
  const items=commandActions.filter(a=>!q||`${a.label} ${a.hint}`.toLowerCase().includes(q));
  if(q){
    const matches=(modsState.mods||[]).filter(mod=>`${mod.displayName||''} ${mod.filename||''} ${mod.provider||''}`.toLowerCase().includes(q)).slice(0,6);
    for(const mod of matches){items.push({id:`installed-mod:${mod.filename}`,label:mod.displayName||mod.filename,hint:`Mod instalado · ${mod.official?'oficial':mod.provider||'local'}${mod.enabled===false?' · desactivado':''}`,icon:'◇',keys:'',run:()=>{setPage('mods');modFilter='all';$$('[data-mod-filter]').forEach(x=>x.classList.toggle('active',x.dataset.modFilter==='all'));if($('modsSearch'))$('modsSearch').value=mod.displayName||mod.filename;renderMods(modsState);setTimeout(()=>$('modsSearch')?.focus(),80)}});}
  }
  return items.slice(0,18);
}
function renderCommandPalette(){
  const host=$('commandPaletteResults');if(!host)return;const items=visibleCommands();commandIndex=clamp(commandIndex,0,Math.max(0,items.length-1));host.innerHTML='';
  if(!items.length){const empty=document.createElement('div');empty.className='empty-state';empty.textContent='No hay acciones que coincidan.';host.appendChild(empty);return;}
  items.forEach((a,i)=>{
    const b=document.createElement('button');b.className=`command-item${i===commandIndex?' active':''}`;
    const icon=document.createElement('span');icon.className='command-item-icon';icon.textContent=a.icon||'•';
    const copy=document.createElement('span');const title=document.createElement('b');const hint=document.createElement('small');title.textContent=a.label||'';hint.textContent=a.hint||'';copy.append(title,hint);
    b.append(icon,copy);if(a.keys){const k=document.createElement('kbd');k.textContent=a.keys;b.appendChild(k)}
    b.addEventListener('mouseenter',()=>{commandIndex=i;renderCommandPalette()});b.addEventListener('click',()=>executeCommand(a));host.appendChild(b);
  });
}
function openCommandPalette(){commandIndex=0;$('commandPaletteInput').value='';$('commandPalette').classList.remove('hidden');renderCommandPalette();setTimeout(()=>$('commandPaletteInput').focus(),30)}
function closeCommandPalette(){$('commandPalette').classList.add('hidden')}
async function executeCommand(action){closeCommandPalette();try{await action?.run?.()}catch(err){toast(err.message||String(err),'error')}}
function setPage(page){
  const labels={home:'Jugar',mods:'Mods',modpack:'Modpack',updates:'Actualizaciones',gallery:'Galería',support:'Soporte',settings:'Ajustes'};
  $$('.nav-item').forEach(b=>{const active=b.dataset.page===page;b.classList.toggle('active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  const targetId=`page-${page}`;
  $$('.page').forEach(s=>{
    const active=s.id===targetId;
    s.classList.toggle('active',active);
    // Keep navigation recoverable if a previous renderer operation left a
    // transient inline/display state behind. Pages are static shells and must
    // never disappear because a refresh request failed.
    if(active){s.removeAttribute('hidden');s.style.removeProperty('display');s.style.removeProperty('visibility');s.style.removeProperty('opacity');}
  });
  document.title=`Eternal Craft — ${labels[page]||'Launcher'}`;
  document.querySelector('.content')?.scrollTo({top:0,behavior:document.body.classList.contains('reduced-motion')?'auto':'smooth'});
  if(appState?.config?.launcher?.rememberLastPage && ['home','mods','modpack','updates','gallery','support','settings'].includes(page)){appState.config.launcher.lastPage=page;queueSettingsSave();}
  if(page==='updates'){
    // Render the static update center before doing network/IPC work. This
    // prevents a rejected checkPack call from presenting an empty page.
    try{renderUpdateCenter();}
    catch(err){
      // A partial state must never turn navigation into a blank screen. Keep
      // the shell visible and make the retry action available to the user.
      reportUnexpectedError('No pude preparar Actualizaciones',err);
      if($('updatesHeroTitle'))$('updatesHeroTitle').textContent='Comprobación pendiente';
      if($('updatesHeroText'))$('updatesHeroText').textContent='La página está disponible; podés reintentar la comprobación.';
    }
    refreshUpdateCenter(false).catch(err=>{
      if($('updatesHeroTitle'))$('updatesHeroTitle').textContent='No se pudo comprobar ahora';
      if($('updatesHeroText'))$('updatesHeroText').textContent='La página sigue disponible; podés reintentar cuando vuelva la conexión.';
      if($('updatesPackText'))$('updatesPackText').textContent='Comprobación pendiente';
      if($('updatesModsText'))$('updatesModsText').textContent='Administrados localmente';
      if($('updatesLauncherText'))$('updatesLauncherText').textContent='Comprobación pendiente';
      // Keep the failure local to this page; the rest of the launcher remains usable.
      void err;
    });
  }
  if(page==='gallery')refreshClips(false).catch(()=>{});
  if(page==='settings'){if(String($('settingsSearch')?.value||'').trim())applySettingsSearch();else setSettingsGroup(settingsGroup);}
}
function statusClass(el,state){if(!el)return;el.classList.remove('ok','warn','bad');if(state)el.classList.add(state)}
function setHealth(id,text,state=''){const el=$(id);if(!el)return;el.textContent=text;el.className=state}
function setGlobalStatus(text,state='neutral'){const root=$('globalStatus'),label=$('globalStatusText');if(!root||!label)return;label.textContent=text;root.dataset.state=state;}
function setBusy(value,label='PROCESANDO'){
  busy=value;
  document.body.dataset.busy=value?'true':'false';
  document.querySelector('.content')?.setAttribute('aria-busy',value?'true':'false');
  ['playBtn','repairQuickBtn','updatePackBtn','checkPackBtn','quickCheck','refreshServerBtn','modsAuditBtn','updatesCheckAllBtn','updatesApplyAllBtn','updatesPackBtn','updatesModsBtn','developerPreviewBtn','developerPublishBtn','developerCompareTestBtn','developerPreflightBtn'].forEach(id=>{if($(id))$(id).disabled=value});
  footer(value?label:'LISTO'); updatePlayAvailability();
}
function applyBackground(name){
  const names=['frontline','night','canyon','anniversary','cyborg','dummies','orbit','laststand','vought','nightop','rooftop','tempest','urban','dvn-official-01','dvn-official-02','dvn-official-03','dvn-official-04','dvn-official-05','dvn-official-06'];
  const safe=names.includes(name)?name:'frontline'; const bg=$('background');
  names.forEach(n=>bg.classList.remove(`scene-${n}`)); bg.classList.add(`scene-${safe}`);
  document.body.dataset.background=safe;
  const hero=document.querySelector('.play-card-bg'); if(hero){
    const fallback=['night','orbit','cyborg','dvn-official-05','dvn-official-06'].includes(safe)?'night':['canyon','laststand','dvn-official-02','dvn-official-04'].includes(safe)?'canyon':'frontline';
    const extension='png';
    hero.style.backgroundImage=`url('assets/siege/${safe}.${extension}'), url('assets/${fallback}.svg')`;
  }
  if($('backgroundSelect') && $('backgroundSelect').value!==safe)$('backgroundSelect').value=safe;
  $$('#backgroundGallery .background-thumb').forEach(btn=>btn.classList.toggle('active',btn.dataset.background===safe));
}
function applyVisuals(config={}){
  document.body.dataset.theme=config.theme||'aurora';
  document.body.dataset.density=config.density||'comfortable';
  document.body.dataset.uiScale=config.uiScale||'normal';
  document.body.classList.toggle('glass-off',config.glassEffects===false);
  document.body.classList.toggle('reduced-motion',Boolean(config.reducedMotion));
  document.body.classList.toggle('no-scanlines',config.scanlines===false);
  document.body.classList.toggle('no-noise',config.noise===false);
  if(/^#[0-9a-f]{6}$/i.test(String(config.accent||''))) document.documentElement.style.setProperty('--themeAccent',config.accent);
  else document.documentElement.style.removeProperty('--themeAccent');
  if(/^#[0-9a-f]{6}$/i.test(String(config.accent2||''))) document.documentElement.style.setProperty('--themeAccent2',config.accent2);
  else document.documentElement.style.removeProperty('--themeAccent2');
  const radius=Number(config.cardRadius); document.documentElement.style.setProperty('--radius-lg',`${clamp(Number.isFinite(radius)?radius:16,8,28)}px`); const brightness=clamp(Number(config.backgroundBrightness)||1,.7,1.2); document.documentElement.style.setProperty('--backgroundBrightness',String(brightness));
  const names=['frontline','night','canyon','anniversary','cyborg','dummies','orbit','laststand','vought','nightop','rooftop','tempest','urban','dvn-official-01','dvn-official-02','dvn-official-03','dvn-official-04','dvn-official-05','dvn-official-06'];
  let selected=config.background||'frontline';
  if(config.backgroundMode==='randomStartup'&&!startupBackgroundApplied){selected=names[Math.floor(Math.random()*names.length)];startupBackgroundApplied=true;}
  applyBackground(selected);
  clearInterval(backgroundRotationTimer); backgroundRotationTimer=null;
  if(config.backgroundMode==='rotate5'||config.backgroundMode==='rotate15'){
    const ms=(config.backgroundMode==='rotate5'?5:15)*60*1000;
    backgroundRotationTimer=setInterval(()=>{const current=$('backgroundSelect')?.value||selected;let next=current;while(next===current&&names.length>1)next=names[Math.floor(Math.random()*names.length)];applyBackground(next);},ms);
  }
  $$('#themeGallery [data-theme-choice]').forEach(btn=>btn.classList.toggle('active',btn.dataset.themeChoice===(config.theme||'aurora')));
  renderBackgroundGallery(config.background||'frontline');
}
function renderBackgroundGallery(selected='frontline'){
  const host=$('backgroundGallery');if(!host)return;
  const items=[['frontline','Frontline'],['night','Night Battle'],['canyon','Canyon'],['anniversary','Anniversary'],['cyborg','Cyborg'],['dummies','Dummies'],['orbit','Earth Orbit'],['laststand','Last Stand'],['vought','Vought'],['nightop','Night Operation'],['rooftop','Rooftop'],['tempest','Tempest'],['urban','Urban'],['dvn-official-01','DVN Official 01'],['dvn-official-02','DVN Official 02'],['dvn-official-03','DVN Official 03'],['dvn-official-04','DVN Official 04'],['dvn-official-05','DVN Official 05'],['dvn-official-06','DVN Official 06']];
  host.innerHTML='';
  for(const [id,label] of items){const b=document.createElement('button');b.type='button';b.dataset.background=id;b.className=`background-thumb ${id===selected?'active':''}`;b.title='Miniatura oficial de Dummies vs Noobs';b.innerHTML=`<img loading="lazy" decoding="async" src="assets/siege/${id}.png" alt="${label}"><span>${label}</span>`;const img=b.querySelector('img');if(img)img.addEventListener('error',()=>{img.src='assets/frontline.svg';},{once:true});b.addEventListener('click',()=>{if($('backgroundSelect'))$('backgroundSelect').value=id;applyBackground(id);$$('.background-thumb').forEach(x=>x.classList.toggle('active',x===b));queueSettingsSave();});host.appendChild(b);}
}

function showOperation(title='SINCRONIZANDO'){
  opStats={start:performance.now(),lastTime:performance.now(),lastBytes:0,speed:0};operationMinimized=false;
  $('operationTitle').textContent=title; $('operationPercent').textContent='0%'; $('operationBar').style.width='0%';
  $('operationPhase').textContent='PREPARANDO...'; $('operationFile').textContent='—'; $('operationBytes').textContent='—'; $('operationSpeed').textContent='—'; $('operationEta').textContent='—';
  if($('operationTaskText'))$('operationTaskText').textContent=title; if($('operationTaskPercent'))$('operationTaskPercent').textContent='0%'; $('operationTaskPill')?.classList.add('hidden');
  $('operationOverlay').classList.remove('hidden');
}
function waitMs(ms){return new Promise(resolve=>setTimeout(resolve,Math.max(0,Number(ms)||0)))}
function minimizeOperation(){if(!opStats)return;operationMinimized=true;$('operationOverlay').classList.add('hidden');$('operationTaskPill')?.classList.remove('hidden')}
function restoreOperation(){if(!opStats)return;operationMinimized=false;$('operationTaskPill')?.classList.add('hidden');$('operationOverlay').classList.remove('hidden')}
function hideOperation(){$('operationOverlay').classList.add('hidden');$('operationTaskPill')?.classList.add('hidden');operationMinimized=false;opStats=null}
function phaseLabel(phase){return({checking:'COMPROBANDO',downloading:'DESCARGANDO',preparing:'PREPARANDO',applying:'APLICANDO',removing:'LIMPIANDO',forge:'PREPARANDO FORGE','java-resolving':'BUSCANDO JAVA 17','java-download':'DESCARGANDO JAVA 17','java-extract':'INSTALANDO JAVA 17','java-ready':'JAVA 17 LISTO'})[phase]||String(phase||'PROCESANDO').toUpperCase()}
function onPackProgress(p={}){
  const total=Number(p.total||0),current=Number(p.current||0); let percent=total>0?current/total*100:0;
  const bytes=Number(p.bytesReceived||0),bytesTotal=Number(p.bytesTotal||0);
  if((p.phase==='downloading'||p.phase==='forge'||p.phase==='java-download')&&bytesTotal>0) percent=bytes/bytesTotal*100;
  percent=clamp(percent,0,100); $('operationPercent').textContent=`${Math.round(percent)}%`; $('operationBar').style.width=`${percent}%`; if($('operationTaskPercent'))$('operationTaskPercent').textContent=`${Math.round(percent)}%`; if($('operationTaskText'))$('operationTaskText').textContent=phaseLabel(p.phase);
  $('operationPhase').textContent=phaseLabel(p.phase); $('operationFile').textContent=p.file||'—';
  if(bytesTotal>0){
    $('operationBytes').textContent=`${formatBytes(bytes)} / ${formatBytes(bytesTotal)}`;
    if(opStats){
      const now=performance.now(),dt=(now-opStats.lastTime)/1000,delta=Math.max(0,bytes-opStats.lastBytes);
      if(dt>.25){const instant=delta/dt;opStats.speed=opStats.speed?opStats.speed*.68+instant*.32:instant;opStats.lastTime=now;opStats.lastBytes=bytes;}
      if(opStats.speed>1024){$('operationSpeed').textContent=`${formatBytes(opStats.speed)}/s`;const remain=Math.max(0,bytesTotal-bytes);const eta=remain/opStats.speed;$('operationEta').textContent=eta<60?`${Math.ceil(eta)} s`:`${Math.ceil(eta/60)} min`;}
    }
  } else if(p.fromCache){$('operationBytes').textContent='DESDE CACHÉ';$('operationSpeed').textContent='LOCAL';$('operationEta').textContent='—';}
}

function renderReleaseNotes(){
  const notes=appState?.manifest?.releaseNotes||{}; $('releaseVersion').textContent=appState?.manifest?.version||'—';
  $('releaseTitle').textContent=notes.title||`Eternal Craft ${appState?.manifest?.version||''}`; $('releaseSummary').textContent=notes.summary||'Sin notas publicadas para esta versión.';
  const host=$('releaseHighlights'); host.innerHTML=''; const items=Array.isArray(notes.highlights)?notes.highlights.slice(0,7):[];
  if(!items.length){const el=document.createElement('span');el.className='release-item changed';el.textContent='Pack listo para jugar';host.appendChild(el);return;}
  for(const item of items){const el=document.createElement('span');el.className=`release-item ${item.type||'changed'}`;const label=item.type==='added'?'+':item.type==='removed'?'−':'↻';el.textContent=`${label} ${item.path||''}`;host.appendChild(el);}
}
function renderDiscordChannels(){
  const host=$('discordChannels'); if(!host)return;
  const channels=appState?.config?.links?.discordChannels||[]; host.innerHTML='';
  if(!channels.length){host.innerHTML='<div class="empty-state">No hay canales configurados.</div>';return;}
  for(const channel of channels){const row=document.createElement('button');row.className='connectivity-row';row.type='button';row.innerHTML=`<span><b>${escapeHtml(channel.name||'Discord')}</b><small>Canal oficial</small></span><strong>ABRIR ↗</strong>`;row.addEventListener('click',()=>api.openExternal(channel.url));host.appendChild(row);}
}
function renderSession(){
  const cfg=appState?.config?.launcher||{}; const last=cfg.lastSession; const user=appState?.config?.minecraft?.username||'—'; const stats=cfg.playStats||{totalMs:0,sessions:0,days:{}};
  $('sessionUsername').textContent=user; $('profileAvatar').textContent=initial(user); $('activityAvatar').textContent=initial(user);
  $('lastPlayedText').textContent=cfg.lastPlayedAt?`${timeAgo(cfg.lastPlayedAt)} · Eternal Craft SIEGE`:'Todavía no jugaste desde este launcher.';
  $('lastSessionDuration').textContent=last?.durationMs?formatDuration(last.durationMs):'—';
  $('lastSessionExit').textContent=last?((last.code===0||last.code===null)?'NORMAL':`CÓDIGO ${last.code}`):'—';
  if($('totalPlayTime'))$('totalPlayTime').textContent=stats.totalMs?formatDuration(stats.totalMs):'—';
  const host=$('activityWeek'); if(host){host.innerHTML='';const days=[];for(let i=6;i>=0;i--){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);const key=d.toISOString().slice(0,10);days.push({key,label:['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'][d.getDay()],ms:Number(stats.days?.[key]||0),today:i===0});}const max=Math.max(1,...days.map(x=>x.ms));for(const day of days){const el=document.createElement('div');el.className=`activity-day ${day.today?'today':''}`;const pct=day.ms?Math.max(8,Math.round(day.ms/max*100)):3;el.innerHTML=`<i style="height:${pct}%" title="${day.ms?formatDuration(day.ms):'Sin sesión'}"></i><span>${day.label}</span>`;host.appendChild(el);}}
}
function renderAccount(account={}){
  const premium=Boolean(account.authenticated);
  if($('minecraftAccountName'))$('minecraftAccountName').textContent=premium?(account.name||'Cuenta Microsoft'):'Perfil local';
  if($('minecraftAccountStatus'))$('minecraftAccountStatus').textContent=premium?'Sesión Microsoft guardada de forma segura en este equipo.':'Podés jugar en modo offline o iniciar sesión con Microsoft.';
  if($('sideProfileState'))$('sideProfileState').textContent=premium?'CUENTA MICROSOFT':'PERFIL LOCAL';
  $('minecraftLoginBtn')?.classList.toggle('hidden',premium); $('minecraftLogoutBtn')?.classList.toggle('hidden',!premium);
  if(premium&&$('usernameInput')&&account.name)$('usernameInput').value=account.name;
  skinState={authenticated:premium,name:account.name||'',skins:Array.isArray(account.skins)?account.skins:[]}; renderSkinGallery(skinState);
}
function renderSkinGallery(state=skinState){
  const host=$('skinGallery'); if(!host)return;
  host.innerHTML='';
  if(!state.authenticated){host.innerHTML='<div class="empty-state">Iniciá sesión con Microsoft para ver y cambiar tus skins.</div>';return;}
  const skins=Array.isArray(state.skins)?state.skins:[];
  if(!skins.length){host.innerHTML='<div class="empty-state">No hay skins disponibles todavía. Subí un PNG para crear la primera.</div>';return;}
  for(const skin of skins){const card=document.createElement('article');card.className='skin-card';const img=document.createElement('img');img.alt=`Skin ${skin.variant||''}`;img.loading='lazy';img.src=skin.url||'';const copy=document.createElement('div');const title=document.createElement('b');title.textContent=skin.variant==='slim'?'Slim':'Classic';const meta=document.createElement('small');meta.textContent=skin.state==='ACTIVE'?'ACTIVA':'Guardada en Microsoft';copy.append(title,meta);card.append(img,copy);host.appendChild(card);}
}
async function refreshSkins(showToast=false){
  if(!api.accountSkins)return null;
  try{const result=await api.accountSkins();skinState={authenticated:Boolean(result?.authenticated),name:result?.name||'',skins:Array.isArray(result?.skins)?result.skins:[]};renderSkinGallery(skinState);if(showToast)toast('Galería de skins actualizada.','success');return result;}catch(err){if(showToast)toast(err.message||String(err),'error');return null;}
}
async function uploadSkin(){
  if(!skinState.authenticated){toast('Iniciá sesión con Microsoft primero.','warn');return;}
  try{const variant=$('skinVariantSelect')?.value||'classic';setBusy(true,'SUBIENDO SKIN');const result=await api.accountUploadSkin(variant);if(result){skinState={authenticated:Boolean(result.authenticated),name:result.name||'',skins:result.skins||[]};renderSkinGallery(skinState);toast('Skin actualizada en tu cuenta Microsoft.','success');}}catch(err){toast(err.message||String(err),'error')}finally{setBusy(false);}
}
function renderClips(state=clipsState){
  const host=$('clipsGrid');if(!host)return;
  $('clipsFolderPath')?.replaceChildren(document.createTextNode(state.configured?state.directory:'Ninguna carpeta seleccionada'));
  if($('clipsTotal'))$('clipsTotal').textContent=String(state.total||0);if($('clipsImages'))$('clipsImages').textContent=String(state.images||0);if($('clipsVideos'))$('clipsVideos').textContent=String(state.videos||0);
  if($('clipsSearch'))$('clipsSearch').value=clipsView.query;if($('clipsTypeFilter'))$('clipsTypeFilter').value=clipsView.type;if($('clipsSort'))$('clipsSort').value=clipsView.sort;
  host.innerHTML='';if(!state.configured){host.innerHTML='<div class="empty-state">Elegí una carpeta para ver tus clips y capturas dentro del launcher.</div>';if($('clipsVisibleCount'))$('clipsVisibleCount').textContent='0 MOSTRADOS';return;}if(!state.items?.length){host.innerHTML='<div class="empty-state">La carpeta está vacía. Las imágenes y videos nuevos aparecerán al actualizar.</div>';if($('clipsVisibleCount'))$('clipsVisibleCount').textContent='0 MOSTRADOS';return;}
  const query=clipsView.query.toLowerCase();const items=state.items.filter(item=>(clipsView.type==='all'||item.type===clipsView.type)&&(!query||String(item.name).toLowerCase().includes(query))).slice().sort((a,b)=>{if(clipsView.sort==='name')return String(a.name).localeCompare(String(b.name),'es',{numeric:true});if(clipsView.sort==='size')return Number(b.size||0)-Number(a.size||0);const diff=new Date(b.modifiedAt||0)-new Date(a.modifiedAt||0);return clipsView.sort==='oldest'?-diff:diff;});
  if($('clipsVisibleCount'))$('clipsVisibleCount').textContent=`${items.length} MOSTRADOS`;
  if(!items.length){host.innerHTML='<div class="empty-state">No hay archivos que coincidan con esos filtros.</div>';return;}
  for(const item of items){const card=document.createElement('article');card.className='clip-card';const media=item.type==='video'?document.createElement('video'):document.createElement('img');media.src=item.url;media.loading='lazy';media.setAttribute('aria-label',item.name);if(item.type==='video'){media.muted=true;media.controls=true;media.preload='metadata';}const info=document.createElement('div');info.className='clip-card-copy';const name=document.createElement('b');name.textContent=item.name;const meta=document.createElement('small');meta.textContent=`${formatBytes(item.size)} · ${timeAgo(item.modifiedAt)}`;const open=document.createElement('button');open.className='ghost';open.type='button';open.textContent='ABRIR';open.addEventListener('click',()=>api.clipsOpen(item.path).catch(err=>toast(err.message||String(err),'error')));info.append(name,meta,open);card.append(media,info);host.appendChild(card);}
}
function queueClipsViewSave(){
  clearTimeout(clipsViewSaveTimer);clipsViewSaveTimer=setTimeout(async()=>{try{const cfg=await api.saveSettings({launcher:{galleryView:{...clipsView}}});if(appState)appState.config=cfg;}catch(_){/* filtering remains usable if persistence is unavailable */}},350);
}
function resetClipsView(){clipsView={query:'',type:'all',sort:'newest'};renderClips(clipsState);queueClipsViewSave();}
async function refreshClips(showToast=false){
  if(!api.clipsList)return null;try{clipsState=await api.clipsList();renderClips(clipsState);if(showToast)toast(`${clipsState.total||0} archivos encontrados.`,'success');return clipsState;}catch(err){if(showToast)toast(err.message||String(err),'error');return null;}
}
async function loginMicrosoft(){
  if(busy)return; setBusy(true,'ABRIENDO MICROSOFT');
  try{const account=await api.accountLogin();const cfg=await api.saveSettings({minecraft:{username:account.name||appState?.config?.minecraft?.username||'',accountMode:'premium'}});renderAccount(account);if(appState){appState.account=account;appState.config=cfg;}await refreshSkins(false);toast(`Sesión iniciada como ${account.name||'cuenta Microsoft'}.`,'success');}
  catch(err){toast(err.message||String(err),'error');}
  finally{setBusy(false);}
}
async function logoutMicrosoft(){
  if(!await askConfirm({title:'Cerrar sesión Microsoft',message:'Minecraft volverá a usar el modo offline de este equipo.',confirmText:'Cerrar sesión'}))return;
  try{const account=await api.accountLogout();const cfg=await api.saveSettings({minecraft:{accountMode:'offline'}});renderAccount(account);if(appState){appState.account=account;appState.config=cfg;}toast('Sesión Microsoft cerrada.','success');}catch(err){toast(err.message||String(err),'error');}
}

function fillBaseState(state){
  appState=state; const {config,manifest,java}=state; const user=config.minecraft.username||'—';
  const brightnessRange=$('backgroundBrightnessRange'); if(brightnessRange){brightnessRange.value=String(Math.round(clamp(Number(config.launcher?.backgroundBrightness)||1,.7,1.2)*100)); if($('backgroundBrightnessValue'))$('backgroundBrightnessValue').textContent=brightnessRange.value+'%';}
  $('titleBuild').textContent=`BUILD ${state.appVersion}`; $('footerBuild').textContent=`ETERNAL CRAFT LAUNCHER // ${state.appVersion}`;
  if($('aboutVersion'))$('aboutVersion').textContent=`v${state.appVersion}`; if($('settingsDeveloperTab'))$('settingsDeveloperTab').classList.toggle('hidden',state.developer?.developerAllowed!==true);
  if($('aboutPlatform'))$('aboutPlatform').textContent=state.platform==='win32'?'Windows':state.platform==='linux'?'Linux / Fedora':String(state.platform||'—');
  if($('aboutChannel'))$('aboutChannel').textContent=state.manifestStale?'Caché offline':state.manifestSource==='remote'?'Stable / GitHub':state.manifestSource==='development'?'Desarrollo local':'Sin publicar';
  if($('aboutJava'))$('aboutJava').textContent=java?.found?`Java ${java.major||17}${java.managed?' · administrado':''}`:'Automático';
  setGlobalStatus(state.manifestStale?'OFFLINE · CACHÉ':state.manifestSource==='remote'?'ONLINE':'LOCAL',state.manifestStale?'warn':state.manifestSource==='remote'?'ok':'neutral');
  $('sideUsername').textContent=user; $('sessionUsername').textContent=user; $('profileAvatar').textContent=initial(user); $('activityAvatar').textContent=initial(user);
  $('homePackVersion').textContent=state.manifestConfigured?(manifest.version||'—'):'SIN PUBLICAR'; $('homeMcVersion').textContent=manifest.minecraft||config.minecraft.version||'1.20.1'; $('homeForgeVersion').textContent=manifest.forge||config.minecraft.forgeVersion||'—'; $('homeRam').textContent=`${Math.round((config.minecraft.maxMemoryMb||6144)/1024)} GB`;
  const displayInfo=state.system?.display||{};const gpuNames=(state.system?.gpus||[]).map(g=>g.name).filter(Boolean);
  if($('homePresetBadge'))$('homePresetBadge').textContent='MANUAL';if($('homeProfileRam'))$('homeProfileRam').textContent=`${Math.round((config.minecraft.maxMemoryMb||6144)/1024)} GB`;if($('homeProfileResolution'))$('homeProfileResolution').textContent=config.minecraft.useSystemResolution!==false?`${displayInfo.width||config.minecraft.width||1920}×${displayInfo.height||config.minecraft.height||1080} · AUTO`:`${config.minecraft.width||1920}×${config.minecraft.height||1080}`;if($('homeProfileGpu'))$('homeProfileGpu').textContent=config.minecraft.preferDedicatedGpu!==false?(gpuNames[0]||'PREFERIDA'):'AUTOMÁTICA';if($('homeProfileJava'))$('homeProfileJava').textContent=java?.found?`JAVA ${java.major||17}`:'AUTO';
  $('serverAddress').textContent=`${config.server.host}:${config.server.port}`; $('instancePath').textContent=config.pack.installDirectory; $('settingsInstallPath').textContent=config.pack.installDirectory;
  $('packMc').textContent=manifest.minecraft||config.minecraft.version||'—'; $('packForge').textContent=manifest.forge||config.minecraft.forgeVersion||'—'; $('packChannel').textContent=String(config.pack.channel||'stable').toUpperCase(); $('packAutoUpdate').textContent=config.pack.autoUpdate?'ON':'OFF';
  $('packSource').textContent=state.manifestStale?'CACHÉ OFFLINE':state.manifestSource==='remote'?'OFICIAL':state.manifestSource==='development'?'DEV LOCAL':'NO PUBLICADO'; $('targetVersion').textContent=state.manifestConfigured?(manifest.version||'—'):'—';
  $('usernameInput').value=config.minecraft.username||''; $('ramRange').value=Math.max(3,Math.min(16,Math.round((config.minecraft.maxMemoryMb||6144)/1024))); $('ramValue').textContent=`${$('ramRange').value} GB`;
  $('gamePresetSelect').value=config.minecraft.preset||'balanced'; const display=state.system?.display||{width:config.minecraft.width||1920,height:config.minecraft.height||1080}; const res=`${config.minecraft.width||display.width}x${config.minecraft.height||display.height}`; $('resolutionSelect').value=config.minecraft.useSystemResolution!==false?'system':([...$('resolutionSelect').options].some(o=>o.value===res)?res:'1920x1080'); if($('resolutionDefault'))$('resolutionDefault').textContent=`Predeterminada detectada: ${display.width} × ${display.height}${display.scaleFactor&&display.scaleFactor!==1?` · escala ${Math.round(display.scaleFactor*100)}%`:''}`;
  $('fullscreenToggle').checked=Boolean(config.minecraft.fullscreen); $('dedicatedGpuToggle').checked=config.minecraft.preferDedicatedGpu!==false; $('autoJavaToggle').checked=config.minecraft.autoInstallJava!==false; $('autoUpdateToggle').checked=Boolean(config.pack.autoUpdate); $('repairBeforeToggle').checked=Boolean(config.pack.repairBeforeLaunch); if($('autoSnapshotToggle'))$('autoSnapshotToggle').checked=config.pack.autoSnapshot!==false; if($('protectServerCompatibilityToggle'))$('protectServerCompatibilityToggle').checked=config.mods?.protectServerCompatibility!==false;if($('autoChangeSnapshotsToggle'))$('autoChangeSnapshotsToggle').checked=config.mods?.autoChangeSnapshots!==false;if($('startPageSelect'))$('startPageSelect').value=config.launcher?.startPage||'home';if($('autoConnectivityToggle'))$('autoConnectivityToggle').checked=config.launcher?.autoConnectivityCheck!==false;if($('compatibilityWarningsToggle'))$('compatibilityWarningsToggle').checked=config.mods?.compatibilityWarnings!==false;if($('modWarningsToggle'))$('modWarningsToggle').checked=config.mods?.hideWarnings!==true;if($('vaultScreenshotsToggle'))$('vaultScreenshotsToggle').checked=config.sync?.includeScreenshots!==false;if($('vaultSavesToggle'))$('vaultSavesToggle').checked=Boolean(config.sync?.includeSaves);if($('vaultExtraPaths'))$('vaultExtraPaths').value=(config.sync?.extraPaths||[]).join(', '); $('hideOnStartToggle').checked=Boolean(config.launcher.hideOnGameStart); $('refocusOnExitToggle').checked=config.launcher.refocusOnGameExit!==false;
  if($('closeToTrayToggle'))$('closeToTrayToggle').checked=config.launcher.closeToTray!==false; if($('startWithSystemToggle'))$('startWithSystemToggle').checked=Boolean(config.launcher.startWithSystem); if($('startMinimizedToggle'))$('startMinimizedToggle').checked=Boolean(config.launcher.startMinimized); if($('nativeNotificationsToggle'))$('nativeNotificationsToggle').checked=config.launcher.nativeNotifications!==false; if($('rememberLastPageToggle'))$('rememberLastPageToggle').checked=Boolean(config.launcher.rememberLastPage);
  $('themeSelect').value=config.launcher.theme||'aurora'; $('backgroundSelect').value=config.launcher.background||'frontline'; if($('backgroundModeSelect'))$('backgroundModeSelect').value=config.launcher.backgroundMode||'fixed'; if($('densitySelect'))$('densitySelect').value=config.launcher.density||'comfortable'; if($('glassEffectsToggle'))$('glassEffectsToggle').checked=config.launcher.glassEffects!==false;if($('uiScaleSelect'))$('uiScaleSelect').value=config.launcher.uiScale||'normal'; $('scanlinesToggle').checked=config.launcher.scanlines!==false; $('noiseToggle').checked=Boolean(config.launcher.noise); $('reducedMotionToggle').checked=Boolean(config.launcher.reducedMotion); if($('accentColorInput'))$('accentColorInput').value=/^#[0-9a-f]{6}$/i.test(config.launcher.accent||'')?config.launcher.accent:'#2aa9c4'; if($('accent2ColorInput'))$('accent2ColorInput').value=/^#[0-9a-f]{6}$/i.test(config.launcher.accent2||'')?config.launcher.accent2:'#6a70d9'; if($('cardRadiusRange'))$('cardRadiusRange').value=String(config.launcher.cardRadius||16); if($('cardRadiusValue'))$('cardRadiusValue').textContent=`${config.launcher.cardRadius||16}px`; if($('clipsFolderPath'))$('clipsFolderPath').textContent=config.launcher.clipsDirectory||'Ninguna carpeta seleccionada'; const savedGallery=config.launcher.galleryView||{}; clipsView={query:String(savedGallery.query||''),type:['all','image','video'].includes(savedGallery.type)?savedGallery.type:'all',sort:['newest','oldest','name','size'].includes(savedGallery.sort)?savedGallery.sort:'newest'}; if($('modsSort'))$('modsSort').value=config.mods?.sort||'recent'; applyVisuals(config.launcher);
  const javaOk=Boolean(java?.found&&Number(java?.major)>=17); const javaManaged=Boolean(java?.managed); $('javaReadout').textContent=javaOk?`Java ${java.version} · ${javaManaged?'administrado por Eternal Craft':'detectado en el sistema'}`:'Java 17 o superior no encontrado'; $('installJavaBtn').textContent=javaOk?'JAVA COMPATIBLE':'PREPARAR JAVA'; $('installJavaBtn').disabled=javaOk;
  const rec=Number(state.system?.recommendedRamGb||6),max=Number(state.system?.maxRamGb||12); $('ramRange').max=String(Math.max(4,Math.min(16,max))); $('ramRecommendation').textContent=`Recomendado: ${rec} GB · máximo sugerido: ${max} GB${state.system?.gpus?.length?` · GPU: ${state.system.gpus.map(g=>g.name).join(' / ')}`:''}`; updateRamPicker();
  if($('onboardingRam'))$('onboardingRam').textContent=`${rec} GB`;if($('onboardingResolution'))$('onboardingResolution').textContent=`${display.width}×${display.height}`;if($('onboardingGpu'))$('onboardingGpu').textContent=state.system?.gpus?.length?'DEDICADA':'AUTO';if($('onboardingJava'))$('onboardingJava').textContent=javaOk?'17 LISTO':'AUTO';
  const disk=state.system?.disk; $('storageReadout').textContent=disk?.available?`Espacio libre: ${formatStorage(disk.freeBytes)} · el launcher reserva margen temporal para actualizar con seguridad.`:'No pude calcular el espacio libre de esta unidad.';
  setHealth('sideJava',javaOk?'OK':config.minecraft.autoInstallJava!==false?'AUTO':'REVISAR',javaOk?'ok':config.minecraft.autoInstallJava!==false?'warn':'bad'); setHealth('sidePack',state.manifestStale?'CACHÉ':state.manifestConfigured?'LINKED':'DEV',state.manifestStale?'warn':state.manifestConfigured?'ok':'warn');
  setHealth('readyJava',javaOk?'LISTO':config.minecraft.autoInstallJava!==false?'AUTOMÁTICO':'REVISAR',javaOk?'ok':config.minecraft.autoInstallJava!==false?'warn':'bad'); setHealth('readyLauncher',state.launcherCompatible?'LISTO':`v${state.minimumLauncher}+`,state.launcherCompatible?'ok':'bad');
  renderDeveloper(state.developer||{configured:false,unlocked:false}); renderAccount(state.account||{}); renderClips(clipsState); renderReleaseNotes(); renderDiscordChannels(); renderSession(); updatePlayAvailability(); renderReadiness();
}

function renderPackInfo(){
  if(!appState)return;
  const manifest=appState.manifest||{};
  const notes=manifest.releaseNotes||{};
  const officialMods=(manifest.files||[]).filter(f=>String(f.path||'').toLowerCase().startsWith('mods/')&&String(f.path||'').toLowerCase().endsWith('.jar')).length;
  const totalSize=(manifest.files||[]).reduce((sum,f)=>sum+Number(f.size||0),0);
  const userMods=modsState?.counts?.user||0;
  if($('packReleaseName'))$('packReleaseName').textContent=(manifest.releaseName||'SIEGE ORIGIN').toUpperCase();
  if($('packInfoVersion'))$('packInfoVersion').textContent=manifest.version||'1.0.0';
  if($('packInfoOfficialMods'))$('packInfoOfficialMods').textContent=String(officialMods);
  if($('packInfoUserMods'))$('packInfoUserMods').textContent=String(userMods);
  if($('packInfoSize'))$('packInfoSize').textContent=formatStorage(totalSize);
  if($('packInfoGenerated'))$('packInfoGenerated').textContent=manifest.generatedAt?timeAgo(manifest.generatedAt):'—';
  if($('packInfoTitle'))$('packInfoTitle').textContent=notes.title||`${manifest.version||'1.0.0'} — ${manifest.releaseName||'Siege Origin'}`;
  if($('packInfoSummary'))$('packInfoSummary').textContent=notes.summary||'El launcher conserva tus mods personales y solo reemplaza archivos administrados por el pack.';
}

function normalizePackStatus(status){
  if(status&&typeof status==='object')return status;
  return {configured:false,healthy:false,total:0,ok:0,missing:[],changed:[],remove:[],bytesRequired:0,system:{disk:{available:false}},cache:{bytes:0},error:'No se recibió el estado del modpack.'};
}
function renderPack(status){
  status=normalizePackStatus(status);
  packState=status; const total=Number(status.total||0),ok=Number(status.ok||0),missing=status.missing||[],changed=status.changed||[],removed=status.remove||[];
  if($('packLastChecked'))$('packLastChecked').textContent=status.checkedAt?timeAgo(status.checkedAt):'Ahora';
  const pct=total?Math.round(ok/total*100):(status.healthy?100:0); $('packRing').style.setProperty('--p',String(pct)); $('packRingValue').textContent=`${pct}%`;
  $('installedVersion').textContent=status.state?.version||'NO INSTALADO'; $('targetVersion').textContent=status.expectedVersion||appState?.manifest?.version||'—'; $('packBytes').textContent=formatBytes(status.bytesRequired||0);
  $('packMissing').textContent=missing.length; $('packChanged').textContent=changed.length; $('packRemoved').textContent=removed.length; $('pendingCount').textContent=missing.length+changed.length+removed.length;
  $('packStorage').textContent=status.system?.disk?.available?formatStorage(status.system.disk.freeBytes):'—'; $('packCache').textContent=status.cache?.bytes?formatStorage(status.cache.bytes):'VACÍO';
  const disk=status.system?.disk||{}; const free=Number(disk.freeBytes||0); const required=Number(disk.requiredBytes||0); const safety=$('packDiskSafety');
  if(safety){
    const ratio=free>0?Math.min(1,required/free):0; const pct=Math.max(required>0?4:0,Math.round(ratio*100)); $('packDiskBar').style.width=`${pct}%`;
    safety.classList.remove('warn','bad'); let label='LISTO'; let text='Hay margen suficiente para staging y rollback.';
    if(!disk.available){label='SIN DATOS';text='No pude calcular el espacio libre de esta unidad.';safety.classList.add('warn');}
    else if(required>free){label='SIN ESPACIO';text=`Se necesitan temporalmente ${formatStorage(required)} y hay ${formatStorage(free)} libres.`;safety.classList.add('bad');}
    else if(free-required<2*1024**3){label='MARGEN BAJO';text=`Necesario: ${formatStorage(required)} · libre: ${formatStorage(free)}. Conviene liberar espacio antes de actualizar.`;safety.classList.add('warn');}
    else{text=`Necesario temporalmente: ${formatStorage(required)} · libre: ${formatStorage(free)}.`;}
    $('packDiskStatus').textContent=label;$('packDiskText').textContent=text;
  }
  const healthy=Boolean(status.healthy); $('packStateKicker').textContent=healthy?'INSTALACIÓN VERIFICADA':'ATENCIÓN'; $('packStateTitle').textContent=healthy?'LISTO PARA JUGAR':status.configured?'ACTUALIZACIÓN PENDIENTE':'PACK NO PUBLICADO';
  $('packStateText').textContent=healthy?`${ok} archivos verificados. No hay cambios pendientes.`:status.configured?`${missing.length} faltantes · ${changed.length} modificados · ${removed.length} a eliminar · ${formatBytes(status.bytesRequired)}.`:'El canal del modpack todavía no está configurado.';
  $('homePackStatus').textContent=healthy?'PACK LISTO':status.configured?'ACTUALIZACIÓN':'SIN PACK'; statusClass($('homePackStatus'),healthy?'ok':status.configured?'warn':'bad');
  setHealth('sidePack',healthy?'OK':status.configured?'UPDATE':'DEV',healthy?'ok':status.configured?'warn':'bad'); setHealth('readyPack',healthy?'LISTO':status.configured?'ACTUALIZAR':'NO DISP.',healthy?'ok':status.configured?'warn':'bad');
  $('navPackBadge').classList.toggle('hidden',healthy||!status.configured);
  const host=$('pendingList');host.innerHTML=''; const rows=[...missing.map(x=>({type:'missing',label:'NUEVO',path:x.path})),...changed.map(x=>({type:'changed',label:'CAMBIO',path:x.path})),...removed.map(x=>({type:'removed',label:'QUITAR',path:x}))].slice(0,14);
  if(!rows.length){host.innerHTML='<div class="empty-state">No hay cambios pendientes.</div>';} else for(const row of rows){const el=document.createElement('div');el.className=`pending-file ${row.type}`;el.innerHTML=`<b>${row.label}</b><span></span>`;el.querySelector('span').textContent=row.path;host.appendChild(el);}
  updatePlayAvailability(); renderReadiness(); renderPackInfo();
}
function renderPingTrend(){const host=$('serverPingTrend');if(!host)return;host.innerHTML='';const values=pingHistory.length?pingHistory:[0];const max=Math.max(100,...values);for(const value of values){const bar=document.createElement('i');bar.style.height=`${Math.max(10,Math.round(value/max*100))}%`;bar.title=`${value} ms`;bar.className=value<=70?'good':value<=130?'ok':value<=220?'warn':'bad';host.appendChild(bar)}}
function setSettingsGroup(group='game'){settingsGroup=group;$$('[data-settings-tab]').forEach(b=>b.classList.toggle('active',b.dataset.settingsTab===group));$$('[data-settings-group]').forEach(el=>el.classList.toggle('settings-group-hidden',el.dataset.settingsGroup!==group));document.querySelector('#page-settings .content')?.scrollTo?.({top:0});}
function applySettingsSearch(){
  const input=$('settingsSearch'); if(!input)return; const q=String(input.value||'').trim().toLowerCase(); const page=$('page-settings'); const cards=$$('#page-settings [data-settings-group]');
  page?.classList.toggle('settings-searching',Boolean(q)); let matches=0;
  for(const card of cards){
    const isDeveloper=card.dataset.settingsGroup==='developer'; const developerVisible=!$('settingsDeveloperTab')?.classList.contains('hidden');
    if(!q){card.classList.remove('settings-search-hidden','settings-search-match');card.classList.toggle('settings-group-hidden',card.dataset.settingsGroup!==settingsGroup);continue;}
    const hay=`${card.textContent||''}`.toLowerCase(); const match=hay.includes(q)&&(!isDeveloper||developerVisible);
    card.classList.toggle('settings-group-hidden',false); card.classList.toggle('settings-search-hidden',!match); card.classList.toggle('settings-search-match',match); if(match)matches++;
  }
  if($('settingsSearchCount'))$('settingsSearchCount').textContent=q?`${matches} ${matches===1?'sección encontrada':'secciones encontradas'}`:'Todas las opciones';
}
function clearSettingsSearch(){if($('settingsSearch'))$('settingsSearch').value='';applySettingsSearch();}

function renderServer(status){
  serverState=status; const lobby=Boolean(status?.providerLobby); const online=Boolean(status?.online)&&!lobby; const label=lobby?'NO CONFIRMADO':online?'ONLINE':'OFFLINE'; $('serverOnline').textContent=label; $('serverStateBadge').textContent=label; statusClass($('serverStateBadge'),lobby?'warn':online?'ok':'bad');
  $('serverPlayers').textContent=online?`${status.players?.online??0} / ${status.players?.max??'—'}`:'—'; $('serverPing').textContent=online&&Number.isFinite(status.latency)?`${status.latency} ms`:'—';
  const latency=Number(status?.latency||0); if(online&&Number.isFinite(latency)){pingHistory.push(latency);pingHistory=pingHistory.slice(-12);renderPingTrend();} const quality=!online?'OFFLINE':latency<=70?'EXCELENTE':latency<=130?'BUENA':latency<=220?'ACEPTABLE':'ALTA';
  if(lobby){if($('homeQuickConnection'))$('homeQuickConnection').textContent='NO CONFIRMADA';if($('homeQuickConnectionMeta'))$('homeQuickConnectionMeta').textContent='Exaroton respondió con su lobby';}
  else {if($('homeQuickConnection'))$('homeQuickConnection').textContent=quality;if($('homeQuickConnectionMeta'))$('homeQuickConnectionMeta').textContent=online?`${latency} ms · ${status.players?.online??0}/${status.players?.max??'—'} jugadores`:'Servidor no disponible';}
  const icon=status?.favicon||'assets/logo.svg'; $('serverIcon').src=icon; setHealth('sideLink',lobby?'REVISAR':online?'ONLINE':'OFFLINE',lobby?'warn':online?'ok':'bad'); setHealth('readyServer',lobby?'NO CONFIRMADO':online?'ONLINE':'OFFLINE',lobby||online?'warn':'bad');
  $('footerServer').textContent=lobby?'LINK NO CONFIRMADO':online?`LINK ONLINE // ${status.players?.online??0} PLAYERS`:'LINK OFFLINE'; renderReadiness();
}
function renderReadiness(){
  if(!appState)return; const javaOk=Boolean(appState.java?.found&&Number(appState.java?.major)>=17)||appState.config.minecraft.autoInstallJava!==false,packOk=Boolean(packState?.healthy),launcherOk=appState.launcherCompatible!==false;
  const count=[javaOk,packOk,launcherOk].filter(Boolean).length; $('readinessPercent').textContent=`${count}/3`;
}
function renderMods(state=modsState){
  modsState=state||{mods:[],counts:{total:0,official:0,user:0,disabled:0}};
  const counts=modsState.counts||{};
  $('modsTotal').textContent=counts.total??0; $('modsOfficial').textContent=counts.official??0; $('modsUser').textContent=counts.user??0; $('modsDisabled').textContent=counts.disabled??0; if($('modsPinned'))$('modsPinned').textContent=counts.pinned??0;
  if($('homeQuickMods'))$('homeQuickMods').textContent=`${counts.total??0} MODS`; if($('homeQuickModsMeta'))$('homeQuickModsMeta').textContent=`${counts.official??0} oficiales · ${counts.user??0} personales${counts.favorites?` · ${counts.favorites} favoritos`:''}`;
  const modBadge=$('navModsBadge'); if(modBadge){modBadge.classList.toggle('hidden',counts.user===0);modBadge.textContent=counts.user?String(counts.user):'+';} renderPackInfo();
  const query=String($('modsSearch')?.value||'').trim().toLowerCase();
  const filtered=(modsState.mods||[]).filter(mod=>{
    if(query && !`${mod.displayName} ${mod.filename} ${mod.provider}`.toLowerCase().includes(query)) return false;
    if(modFilter==='official'&&!mod.official)return false; if(modFilter==='user'&&!mod.userAdded)return false; if(modFilter==='disabled'&&mod.enabled)return false; if(modFilter==='favorites'&&!mod.favorite)return false;if(modFilter==='pinned'&&!mod.pinned)return false;if(modFilter==='local'&&(!mod.userAdded||mod.provider!=='local'))return false; return true;
  });
  const host=$('modsList'); host.innerHTML='';
  if(!filtered.length){host.innerHTML='<div class="empty-state">No hay mods que coincidan con este filtro.</div>';return;}
  for(const mod of filtered){
    const row=document.createElement('div'); row.className=`mod-row ${mod.userAdded?'user':'official'} ${mod.enabled?'':'disabled'}`;
    const tagOfficial=mod.official?'<span class="mod-tag">OFICIAL</span>':'<span class="mod-tag user">AGREGADO</span>';
    const tagDisabled=mod.enabled?'':'<span class="mod-tag disabled">DESACTIVADO</span>';
    const provider=mod.provider&&mod.provider!=='official'?`<span class="provider-mark">${String(mod.provider).toUpperCase()}</span>`:'';
    const envClient=String(mod.environment?.client||''); const envServer=String(mod.environment?.server||'');
    const envTag=envClient.includes('client_only')?'<span class="mod-tag env">CLIENTE</span>':(envClient&&envServer?'<span class="mod-tag env">C/S</span>':'');
    const date=(mod.updatedAt||mod.installedAt)?` · ${timeAgo(mod.updatedAt||mod.installedAt)}`:'';
    const testBtn=developerState.unlocked&&mod.userAdded?`<button class="test-action" data-mod-test="${encodeURIComponent(mod.filename)}">TEST-1</button>`:'';
    const updateTag=''; const favoriteTag=mod.favorite?'<span class="mod-tag favorite">★ FAVORITO</span>':''; const pinnedTag=mod.pinned?'<span class="mod-tag pinned">FIJADO</span>':''; const trustTag=mod.official?'<span class="mod-tag trust">VERIFICADO · PACK</span>':'<span class="mod-tag">LOCAL · MANUAL</span>';
    const favoriteBtn=`<button class="favorite-action ${mod.favorite?'active':''}" data-mod-favorite="${encodeURIComponent(mod.filename)}" title="${mod.favorite?'Quitar de favoritos':'Marcar como favorito'}">${mod.favorite?'★':'☆'}</button>`; const pinBtn=mod.userAdded?`<button class="pin-action ${mod.pinned?'active':''}" data-mod-pin="${encodeURIComponent(mod.filename)}" title="${mod.pinned?'Permitir actualizaciones':'Fijar esta versión'}">${mod.pinned?'FIJADO':'FIJAR'}</button>`:'';
    const actions=mod.official?`${favoriteBtn}<span class="locked">ADMINISTRADO POR EL PACK</span>`:`${favoriteBtn}${pinBtn}${testBtn}<button data-mod-toggle="${encodeURIComponent(mod.filename)}">${mod.enabled?'DESACTIVAR':'ACTIVAR'}</button><button class="danger" data-mod-remove="${encodeURIComponent(mod.filename)}">QUITAR</button>`;
    const icon=mod.iconUrl?`<img class="mod-row-icon" src="${mod.iconUrl}" alt="">`:`<div class="mod-icon">${mod.official?'EC':'+'}</div>`;
    row.innerHTML=`${icon}<div class="mod-info"><b></b><small></small><div class="mod-tags">${tagOfficial}${tagDisabled}${provider}${envTag}${updateTag}${favoriteTag}${pinnedTag}${trustTag}</div></div><div class="mod-actions">${actions}</div>`;
    row.querySelector('.mod-info b').textContent=mod.displayName||mod.filename; row.querySelector('.mod-info small').textContent=`${mod.versionName?mod.versionName+' · ':''}${formatBytes(mod.size||0)}${date} · ${mod.filename}`; const localTag=row.querySelector('.mod-tag.untrusted');if(localTag){localTag.className='mod-tag';localTag.textContent='LOCAL · MANUAL';} host.appendChild(row);
  }
  $$('[data-mod-toggle]').forEach(btn=>btn.addEventListener('click',()=>toggleUserMod(decodeURIComponent(btn.dataset.modToggle))));
  $$('[data-mod-remove]').forEach(btn=>btn.addEventListener('click',()=>removeUserMod(decodeURIComponent(btn.dataset.modRemove))));
  $$('[data-mod-test]').forEach(btn=>btn.addEventListener('click',()=>copyUserModToTest(decodeURIComponent(btn.dataset.modTest))));
  $$('[data-mod-favorite]').forEach(btn=>btn.addEventListener('click',()=>toggleFavoriteMod(decodeURIComponent(btn.dataset.modFavorite))));
  $$('[data-mod-pin]').forEach(btn=>btn.addEventListener('click',()=>togglePinnedMod(decodeURIComponent(btn.dataset.modPin))));
}
function resetModsFilters(){
  modFilter='all';
  $$('[data-mod-filter]').forEach(x=>x.classList.toggle('active',x.dataset.modFilter==='all'));
  if($('modsSearch'))$('modsSearch').value='';
  if($('modsSort'))$('modsSort').value='recent';
  renderMods(modsState);
  api.saveSettings({mods:{sort:'recent'}}).then(cfg=>{if(appState)appState.config=cfg}).catch(()=>{});
  toast('Filtros de mods restablecidos.','success');
}
async function toggleFavoriteMod(filename){try{const r=await api.favoriteMod(filename);if(r.listing)renderMods(r.listing);toast(r.favorite?'Agregado a favoritos.':'Quitado de favoritos.','success')}catch(err){toast(err.message||String(err),'error')}}
async function togglePinnedMod(filename){try{const r=await api.pinMod(filename);if(r.listing)renderMods(r.listing);toast(r.pinned?'Versión fijada: Update All no la tocará.':'Versión liberada: volverá a recibir actualizaciones.','success')}catch(err){toast(err.message||String(err),'error')}}
async function setAllPersonalModsEnabled(enabled){if(busy)return;const verb=enabled?'activar':'desactivar';if(!await askConfirm({title:`${enabled?'Activar':'Desactivar'} mods personales`,message:`Se van a ${verb} todos los mods que agregaste. Los mods oficiales no se tocan.`,confirmText:enabled?'Activar todos':'Desactivar todos'}))return;setBusy(true,'ACTUALIZANDO MODS');try{const r=await api.setAllUserModsEnabled(enabled);if(r.listing)renderMods(r.listing);toast(`${r.changed?.length||0} mods personales actualizados.`,'success')}catch(err){toast(err.message||String(err),'error')}finally{setBusy(false)}}
async function refreshMods(showToast=false){
  if(refreshMods.inFlight)return refreshMods.inFlight;
  refreshMods.inFlight=(async()=>{try{const state=await api.listMods();renderMods(state);if(showToast)toast('Lista de mods actualizada.','success');return state;}catch(err){if(showToast)toast(err.message||String(err),'error');return null;}})();
  try{return await refreshMods.inFlight}finally{refreshMods.inFlight=null}
}
async function addUserMods(){if(busy)return;setBusy(true,'AGREGANDO MODS');try{const state=await api.addMods();renderMods(state);toast('Mods agregados a Eternal Craft.','success');}catch(err){toast(err.message||String(err),'error');}finally{setBusy(false)}}
async function toggleUserMod(filename){if(busy)return;setBusy(true,'ACTUALIZANDO MOD');try{const state=await api.toggleMod(filename);renderMods(state);toast('Estado del mod actualizado.','success');}catch(err){toast(err.message||String(err),'error');}finally{setBusy(false)}}
async function removeUserMod(filename){if(busy)return;if(!await askConfirm({title:'Quitar mod',message:'Este mod personal se eliminará de Eternal Craft. Los mods oficiales nunca se pueden quitar desde acá.',confirmText:'Quitar mod',danger:true}))return;setBusy(true,'QUITANDO MOD');try{const state=await api.removeMod(filename);renderMods(state);toast('Mod quitado.','success');}catch(err){toast(err.message||String(err),'error');}finally{setBusy(false)}}
async function copyUserModToTest(filename){try{await api.developerCopyModTest(filename);toast('Mod copiado a test-1 para probarlo.','success')}catch(err){toast(err.message||String(err),'error')}}

async function refreshModAudit(showToast=false){
  const bar=$('modsAuditBar'); if(!bar||!api.auditMods)return null;
  if(modAuditInFlight)return modAuditInFlight;
  modAuditInFlight=(async()=>{try{
    const r=await api.auditMods(); const bad=Number(r.counts?.bad||0),warn=Number(r.counts?.warn||0),info=Number(r.counts?.info||0);
    bar.classList.toggle('hidden',shouldHideModWarning('audit'));bar.classList.toggle('bad',bad>0);bar.classList.toggle('warn',bad===0&&warn>0);bar.classList.toggle('ok',bad===0&&warn===0);
    $('modsAuditBar').querySelector('.mods-audit-icon').textContent=bad?'!':warn?'•':'✓';
    $('modsAuditTitle').textContent=bad?`${bad} problema${bad===1?'':'s'} de compatibilidad`:warn?`${warn} advertencia${warn===1?'':'s'}`:'Compatibilidad verificada';
    const visible=(r.issues||[]).slice(0,2).map(x=>`${x.mod}: ${x.text}`).join(' · ');
    $('modsAuditText').textContent=visible||`${r.total||0} mods revisados · sin conflictos detectados.`;
    if(showToast)toast(bad?'Hay problemas que conviene corregir antes de jugar.':warn?'Hay advertencias de mods para revisar.':'No detecté conflictos en tus mods.',bad?'error':warn?'warn':'success');
    return r;
  }catch(err){bar.classList.remove('ok','warn','bad');$('modsAuditTitle').textContent='No pude revisar compatibilidad';$('modsAuditText').textContent=err.message||String(err);if(showToast)toast(err.message||String(err),'error');return null;}})();
  try{return await modAuditInFlight}finally{modAuditInFlight=null;}
}
function shouldHideModWarning(kind){return ignoredModWarnings.has(kind)||appState?.config?.mods?.hideWarnings===true;}
async function hideAllModWarnings(){
  ignoredModWarnings.add('updates'); ignoredModWarnings.add('audit');
  try{const cfg=await api.saveSettings({mods:{hideWarnings:true}});if(appState)appState.config=cfg;}catch(err){toast(err.message||String(err),'error');return;}
  $('modsAuditBar')?.classList.add('hidden');if($('modWarningsToggle'))$('modWarningsToggle').checked=false;
  toast('Los avisos de mods quedaron ocultos. Podés reactivarlos en Ajustes.','success');
}
function ignoreModWarning(kind){ignoredModWarnings.add(kind);if(kind==='audit')$('modsAuditBar')?.classList.add('hidden');}
async function clearPackCacheAction(){
  if(!await askConfirm({title:'Limpiar caché local',message:'Se borrarán copias de descarga usadas para reparaciones rápidas. No borra el modpack ni tus mods personales.',confirmText:'Limpiar caché'}))return;
  try{const r=await api.clearPackCache();toast(`Caché limpiada · ${r.clearedFiles||0} archivos · ${formatBytes(r.clearedBytes||0)} liberados.`,'success');await refreshPack(false);}catch(err){toast(err.message||String(err),'error')}
}
async function autoConfigureRecommended(){
  const rec=Number(appState?.system?.recommendedRamGb||6);const display=appState?.system?.display||{width:1920,height:1080};
  setRam(rec);$('gamePresetSelect').value='balanced';$('resolutionSelect').value='system';$('dedicatedGpuToggle').checked=true;$('autoJavaToggle').checked=true;$('fullscreenToggle').checked=false;
  const patch={minecraft:{maxMemoryMb:rec*1024,preset:'balanced',useSystemResolution:true,width:display.width,height:display.height,preferDedicatedGpu:true,autoInstallJava:true,fullscreen:false}};
  try{const cfg=await api.saveSettings(patch);appState.config=cfg;fillBaseState({...appState,config:cfg});toast('Configuración recomendada aplicada para este equipo.','success')}catch(err){toast(err.message||String(err),'error')}
}
async function exportSettingsAction(){try{const file=await api.exportSettings();if(file)toast('Ajustes exportados. No incluye secretos de desarrollador.','success')}catch(err){toast(err.message||String(err),'error')}}
async function importSettingsAction(){
  if(!await askConfirm({title:'Importar ajustes',message:'Se reemplazarán preferencias de juego e interfaz. No se modifican la instancia, la contraseña de developer ni claves privadas.',confirmText:'Importar'}))return;
  try{const cfg=await api.importSettings();if(cfg){const state=await api.getState();fillBaseState(state);toast('Ajustes importados correctamente.','success')}}catch(err){toast(`No pude importar los ajustes: ${err.message||String(err)}`,'error')}
}

function setRam(value){
  const input=$('ramRange'); if(!input)return; const min=Number(input.min||3),max=Number(input.max||12); input.value=String(clamp(Math.round(Number(value)||6),min,max)); updateRamPicker();
}
function updateRamPicker(){
  const input=$('ramRange'); if(!input)return; const value=Number(input.value||6); if($('ramValue'))$('ramValue').textContent=`${value} GB`;
  $$('#ramPresets [data-ram]').forEach(btn=>btn.classList.toggle('active',Number(btn.dataset.ram)===value));
}
function renderRecovery(items=[]){
  recoveryState=items||[]; const host=$('recoveryList'); if(!host)return; host.innerHTML='';
  if(!recoveryState.length){host.innerHTML='<div class="empty-state">Todavía no hay puntos de restauración. El launcher crea uno automáticamente antes de aplicar cambios importantes.</div>';return;}
  for(const item of recoveryState){
    const row=document.createElement('div');row.className='recovery-row';
    row.innerHTML='<div class="recovery-marker">↶</div><div class="recovery-copy"><b></b><span></span></div><div class="recovery-actions"><button class="ghost restore">RESTAURAR</button><button class="ghost delete">×</button></div>';
    row.querySelector('b').textContent=item.label||'Punto de restauración';row.querySelector('span').textContent=`${timeAgo(item.createdAt)} · pack ${item.packVersion||'—'} · ${item.userMods||0} mods personales`;
    row.querySelector('.restore').addEventListener('click',()=>restoreRecovery(item.id));row.querySelector('.delete').addEventListener('click',()=>removeRecovery(item.id));host.appendChild(row);
  }
}
async function refreshRecovery(){try{renderRecovery(await api.listRecoveryPoints())}catch(err){if($('recoveryList'))$('recoveryList').innerHTML='<div class="empty-state">No pude leer los puntos de restauración.</div>';}}
async function createRecovery(){const label=await askPrompt({title:'Crear punto de restauración',message:'Guardará mods personales, configuración y opciones para poder volver a este estado.',inputLabel:'NOMBRE',value:'Antes de hacer cambios',placeholder:'Punto de restauración',confirmText:'Crear punto'});if(label===null)return;try{await api.createRecoveryPoint(label||'Punto manual');await refreshRecovery();toast('Punto de restauración creado.','success')}catch(err){toast(err.message||String(err),'error')}}
async function restoreRecovery(id){if(!await askConfirm({title:'Restaurar este punto',message:'Se reemplazarán tus mods personales, config y opciones por los que tenía este punto de restauración.',confirmText:'Restaurar',danger:true}))return;try{const r=await api.restoreRecoveryPoint(id);if(r.mods)renderMods(r.mods);await refreshRecovery();toast('Punto de restauración aplicado.','success')}catch(err){toast(err.message||String(err),'error')}}
async function removeRecovery(id){if(!await askConfirm({title:'Eliminar punto',message:'Este punto de restauración se borrará de forma permanente.',confirmText:'Eliminar',danger:true}))return;try{await api.deleteRecoveryPoint(id);await refreshRecovery();}catch(err){toast(err.message||String(err),'error')}}

function renderChangeHistory(items=[]){
  const host=$('changeHistoryList');if(!host)return;host.innerHTML='';
  if(!items.length){host.innerHTML='<div class="empty-state">Todavía no hay cambios registrados.</div>';return;}
  for(const item of items.slice(0,10)){const row=document.createElement('div');row.className=`change-history-row risk-${item.risk||'low'}`;row.innerHTML='<i></i><div><b></b><span></span></div><small></small>';row.querySelector('i').textContent=item.type==='game-crash'?'!':item.type.includes('update')?'↻':item.type.includes('remove')?'−':item.type.includes('install')?'+':'•';row.querySelector('b').textContent=item.title||'Cambio';row.querySelector('span').textContent=item.detail||'';row.querySelector('small').textContent=timeAgo(item.at);host.appendChild(row);}
}
async function refreshChangeHistory(){try{renderChangeHistory(await api.modChangeHistory(12));}catch(_){} }
function renderCrashGuard(result={}){
  const suspects=result.suspects||[];const host=$('crashGuardSuspects');if(!host)return;host.innerHTML='';
  const bad=Number(result.crashStreak||0)>0||result.diagnostic?.severity!=='ok';$('crashGuardBadge').textContent=bad?'REVISAR':'SIN ALERTAS';$('crashGuardBadge').className=bad?'warn':'ok';$('crashGuardIcon').textContent=bad?'!':'✓';$('crashGuardTitle').textContent=suspects.length?`${suspects.length} mod${suspects.length===1?'':'s'} reciente${suspects.length===1?'':'s'} a revisar`:'No hay un cambio reciente claramente sospechoso';$('crashGuardText').textContent=suspects.length?'Crash Guard cruzó el último cierre con instalaciones y actualizaciones recientes. Podés desactivarlos temporalmente de una vez.':(result.diagnostic?.summary||'Los últimos cambios no apuntan a un mod personal concreto.');
  for(const mod of suspects){const row=document.createElement('div');row.className='crash-suspect';row.innerHTML='<div><b></b><span></span></div><em></em>';row.querySelector('b').textContent=mod.name||mod.filename;row.querySelector('span').textContent=`${mod.changeType||'cambio'} · ${timeAgo(mod.changedAt)}`;row.querySelector('em').textContent=mod.enabled?'ACTIVO':'YA DESACTIVADO';host.appendChild(row);}if(!suspects.length)host.innerHTML='<div class="empty-state">Sin sospechosos recientes. Inicio Seguro sigue disponible para descartar todos los mods personales.</div>';$('crashGuardDisableBtn').disabled=!suspects.some(x=>x.enabled);$('crashGuardDisableBtn').dataset.files=JSON.stringify(suspects.filter(x=>x.enabled).map(x=>x.filename));
}
async function refreshCrashGuard(showToast=false){
  if(crashGuardInFlight)return crashGuardInFlight;
  crashGuardInFlight=(async()=>{try{const r=await api.crashGuard();renderCrashGuard(r);if(showToast)toast(r.suspects?.length?`${r.suspects.length} mod(s) reciente(s) para revisar.`:'Crash Guard no encontró un sospechoso claro.',r.suspects?.length?'warn':'success');return r}catch(err){if(showToast)toast(err.message||String(err),'error');return null}})();
  try{return await crashGuardInFlight}finally{crashGuardInFlight=null}
}
async function quarantineCrashSuspects(){let files=[];try{files=JSON.parse($('crashGuardDisableBtn')?.dataset.files||'[]')}catch(_){}if(!files.length)return;if(!await askConfirm({title:'Poner mods en cuarentena',message:`Se desactivarán temporalmente ${files.length} mod(s) personal(es) sospechoso(s). Antes se crea un punto de restauración.`,confirmText:'Desactivar sospechosos'}))return;try{const r=await api.disableCrashSuspects(files);if(r.listing)renderMods(r.listing);await refreshCrashGuard(false);await refreshChangeHistory();toast(`${r.changed?.length||0} mod(s) puestos en cuarentena. Probá iniciar Minecraft de nuevo.`,'success')}catch(err){toast(err.message||String(err),'error')}}

function renderHealth(result={}){
  const ok=Boolean(result.ok); const issues=result.issues||[]; const icon=$('healthIcon'); if(!icon)return;
  icon.textContent=ok?'✓':issues.some(x=>x.severity==='bad')?'!':'•'; $('healthTitle').textContent=ok?'SISTEMA LISTO':'REVISAR ANTES DE JUGAR';
  const free=result.system?.disk?.freeBytes?formatStorage(result.system.disk.freeBytes):'';
  $('healthText').textContent=ok?`Java, modpack y launcher están listos.${free?` ${free} libres en disco.`:''}`:issues.map(x=>x.text).slice(0,2).join(' · ')||'Hay elementos para revisar.';
  $('healthRibbon').classList.toggle('warn',!ok); $('healthRibbon').classList.toggle('ok',ok);
  $('healthJava').textContent=`JAVA · ${result.javaOk?'OK':'REVISAR'}`;$('healthPack').textContent=`PACK · ${result.packOk?'OK':'REVISAR'}`;$('healthServer').textContent=`SERVER · ${result.serverOnline?'ONLINE':'INFO'}`;$('healthMods').textContent=`MODS · ${result.userMods||0}${result.disabledMods?` / ${result.disabledMods} OFF`:''}`;
}
async function refreshHealth(showToast=false){
  if(healthInFlight)return healthInFlight;
  healthInFlight=(async()=>{try{const r=await api.healthCheck();renderHealth(r);if(showToast)toast(r.ok?'Todo listo para jugar.':'Encontré cosas para revisar.',r.ok?'success':'warn');return r}catch(err){if(showToast)toast(err.message||String(err),'error');return null;}})();
  try{return await healthInFlight}finally{healthInFlight=null}
}

async function promoteAllTestMods(){if(!await askConfirm({title:'Promover todos a SIEGE',message:'Se copiarán todos los mods nuevos o modificados desde test-1. Antes de reemplazar archivos se crearán backups.',confirmText:'Promover todos'}))return;try{const r=await api.developerPromoteAllTestMods();renderTestDiff(r.diff||{});toast(`${r.promoted?.length||0} mods promovidos a SIEGE. Todavía no están publicados.`, 'success');}catch(err){toast(err.message||String(err),'error')}}

function renderDeveloper(status={}){
  developerState={...developerState,...status};if(appState)appState.developer={...developerState};const unlocked=Boolean(developerState.unlocked),configured=Boolean(developerState.configured);
  if($('developerSection'))$('developerSection').classList.toggle('hidden',developerState.developerAllowed!==true);
  if($('developerLocked'))$('developerLocked').classList.toggle('hidden',unlocked);if($('developerUnlocked'))$('developerUnlocked').classList.toggle('hidden',!unlocked);
  if($('developerStateBadge')){$('developerStateBadge').textContent=unlocked?'ACTIVO':configured?'BLOQUEADO':'SIN CONFIGURAR';$('developerStateBadge').classList.toggle('developer-state-on',unlocked);}
  const canSetup=developerState.canSetup!==false;
  if($('developerGateTitle'))$('developerGateTitle').textContent=configured?'Ingresar al modo desarrollador':canSetup?'Crear acceso de desarrollador':'Modo de mantenimiento';
  if($('developerGateText'))$('developerGateText').textContent=configured?'Ingresá tu contraseña local para cambiar o publicar el pack.':canSetup?'Elegí una contraseña local. No se guarda en texto plano.':'La versión de Windows para jugadores no permite inicializar el modo desarrollador.';
  if($('developerPassword'))$('developerPassword').disabled=!configured&&!canSetup; if($('developerUnlockBtn'))$('developerUnlockBtn').disabled=!configured&&!canSetup;
  if($('developerResetBtn'))$('developerResetBtn').classList.toggle('hidden',developerState.developerAllowed!==true||!configured);
  if(appState?.config?.developer){if($('developerSourcePath'))$('developerSourcePath').textContent=appState.config.developer.sourceDirectory||'~/.sklauncher/instances/siege';if($('developerTestPath'))$('developerTestPath').textContent=appState.config.developer.testDirectory||'~/.sklauncher/instances/test-1';if($('developerRepo'))$('developerRepo').value=appState.config.developer.githubRepo||'';}
  if($('developerGithubStatus')){const ready=Boolean(developerState.githubReady);$('developerGithubStatus').textContent=ready?`GitHub conectado${developerState.githubLogin?` como ${developerState.githubLogin}`:''}`:'GitHub CLI no conectado · iniciá sesión una sola vez en tu Fedora';$('developerGithubStatus').className=`dev-github-status ${ready?'ok':'warn'}`;if($('developerPublishBtn'))$('developerPublishBtn').disabled=!ready;}
  renderDeveloperPreflight();
}
async function unlockDeveloper(){
  const password=$('developerPassword').value; if(!password){toast('Ingresá una contraseña.','warn');return;}
  try{const status=developerState.configured?await api.developerUnlock(password):await api.developerSetup(password);$('developerPassword').value='';renderDeveloper(status);toast('Modo desarrollador activo.','success');}
  catch(err){toast(err.message||String(err),'error')}
}
async function resetDeveloperAccess(){
  if(!await askConfirm({title:'Restablecer acceso',message:'Se eliminará la contraseña local del modo desarrollador y podrás crear una nueva. Esta acción no borra mods ni publicaciones.',confirmText:'Restablecer acceso',danger:true}))return;
  try{const status=await api.developerResetAccess();$('developerPassword').value='';renderDeveloper(status);toast('Acceso restablecido. Elegí una contraseña nueva.','success')}catch(err){toast(err.message||String(err),'error')}
}
async function chooseDeveloperSource(){try{const folder=await api.developerChooseSource();if(folder){$('developerSourcePath').textContent=folder;if(appState)appState.config.developer.sourceDirectory=folder;toast('Instancia maestra actualizada.','success')}}catch(err){toast(err.message||String(err),'error')}}
async function chooseDeveloperTest(){try{const folder=await api.developerChooseTest();if(folder){$('developerTestPath').textContent=folder;if(appState)appState.config.developer.testDirectory=folder;toast('Instancia test-1 actualizada.','success')}}catch(err){toast(err.message||String(err),'error')}}
async function syncDeveloperTest(){try{const r=await api.developerSyncTestMods();toast(`${r.copied?.length||0} mods personales sincronizados con test-1.`, 'success')}catch(err){toast(err.message||String(err),'error')}}
async function previewDeveloperPack(){
  if(busy)return;const repo=$('developerRepo').value.trim();const source=$('developerSourcePath').textContent.trim();const version=$('developerVersion').value.trim();const notes=$('developerNotes')?.value.trim()||'';if(!repo.includes('/')){toast('Usá un repo como Santi-PdR/EternalCraft-Modpack.','error');return;}
  setBusy(true,'PREVISUALIZANDO');$('developerPublishLog').textContent='Comparando SIEGE con la versión publicada…\n';
  try{const r=await api.developerPreviewPublish({repo,source,version,notes});publishPreview=r;const card=$('developerPreviewCard');card.classList.remove('hidden');$('developerPreviewVersion').textContent=r.version||'—';$('developerPreviewName').textContent=r.releaseName||'—';$('developerPreviewAdded').textContent=String((r.added||[]).length);$('developerPreviewChanged').textContent=String((r.changed||[]).length);$('developerPreviewRemoved').textContent=String((r.removed||[]).length);const pf=$('developerPreviewFiles');if(pf){const groups=[['+','Añadidos',r.added||[]],['↻','Cambiados',r.changed||[]],['−','Eliminados',r.removed||[]]];pf.innerHTML=groups.filter(g=>g[2].length).map(g=>`<div><b>${g[0]} ${g[1]}</b>${g[2].slice(0,8).map(x=>`<span>${escapeHtml(x)}</span>`).join('')}${g[2].length>8?`<small>+${g[2].length-8} más</small>`:''}</div>`).join('')||'<span>Sin cambios.</span>';}renderDeveloperPreflight();toast('Preview listo. Revisá los cambios antes de publicar.','success');}
  catch(err){toast(err.message||String(err),'error');$('developerPublishLog').textContent+=`\nERROR: ${err.message||String(err)}`;}finally{setBusy(false)}
}
function renderTestDiff(result){
  testDiffState=result;const host=$('developerTestDiff');if(!host)return;host.innerHTML='';const candidates=[...(result.testOnly||[]).map(x=>({type:'NUEVO',name:x.name,size:x.size,modifiedAt:x.modifiedAt})),...(result.changed||[]).map(x=>({type:'CAMBIO',name:x.name,size:x.test?.size||0,modifiedAt:x.test?.modifiedAt||''}))];
  if(!candidates.length){host.innerHTML='<div class="test-diff-ok">✓ test-1 no tiene mods nuevos o modificados respecto a SIEGE.</div>';return;}
  const toolbar=document.createElement('div');toolbar.className='test-diff-toolbar';toolbar.innerHTML='<input type="search" class="developer-test-search" placeholder="Buscar mods de test-1…"><span class="test-selection-count">Seleccioná uno o más mods</span>';host.appendChild(toolbar);
  const summary=document.createElement('div');summary.className='test-diff-summary';summary.innerHTML=`<span>${result.counts?.testOnly||0} nuevos</span><span>${result.counts?.changed||0} modificados</span><span>${result.counts?.sourceOnly||0} solo en SIEGE</span>`;host.appendChild(summary);
  const rows=document.createElement('div');rows.className='test-diff-rows';host.appendChild(rows);
  const renderRows=(query='')=>{rows.innerHTML='';for(const item of candidates.filter(x=>!query||String(x.name).toLowerCase().includes(query.toLowerCase())).sort((a,b)=>new Date(b.modifiedAt)-new Date(a.modifiedAt))){const row=document.createElement('div');row.className='test-diff-row';row.innerHTML=`<input type="checkbox" class="test-mod-check" data-test-name=""><span class="test-diff-type">${item.type}</span><div><b></b><small></small></div><button class="ghost">PROMOVER</button>`;row.querySelector('.test-mod-check').dataset.testName=item.name;row.querySelector('b').textContent=item.name;row.querySelector('small').textContent=`${formatBytes(item.size||0)}${item.modifiedAt?` · ${timeAgo(item.modifiedAt)}`:''}`;row.querySelector('button').addEventListener('click',()=>promoteTestMod(item.name));rows.appendChild(row);}}
  renderRows();toolbar.querySelector('.developer-test-search').addEventListener('input',e=>renderRows(e.target.value));
}
async function compareDeveloperTest(){try{const r=await api.developerCompareTest();renderTestDiff(r);toast('Comparación test-1 / SIEGE completada.','success')}catch(err){toast(err.message||String(err),'error')}}
async function promoteTestMod(filename){if(!await askConfirm({title:'Promover mod a SIEGE',message:`${filename} se copiará desde test-1 a la instancia maestra. Todavía no se publicará.`,confirmText:'Promover'}))return;try{await api.developerPromoteTestMod(filename);toast(`${filename} copiado a SIEGE. Todavía no está publicado.`, 'success');await compareDeveloperTest();}catch(err){toast(err.message||String(err),'error')}}
async function promoteSelectedTestMods(){const names=$$('.test-mod-check:checked').map(x=>x.dataset.testName).filter(Boolean);if(!names.length){toast('Seleccioná al menos un mod de test-1.','warn');return;}if(!await askConfirm({title:'Promover mods seleccionados',message:`Se copiarán ${names.length} mod(s) desde test-1 a SIEGE. Todavía no se publicarán.`,confirmText:'Promover seleccionados'}))return;try{for(const name of names)await api.developerPromoteTestMod(name);toast(`${names.length} mod(s) copiados a SIEGE. Todavía no están publicados.`,'success');await compareDeveloperTest();}catch(err){toast(err.message||String(err),'error')}}
async function publishDeveloperPack(){
  if(busy)return;const repo=$('developerRepo').value.trim();const source=$('developerSourcePath').textContent.trim();const version=$('developerVersion').value.trim();const notes=$('developerNotes')?.value.trim()||'';if(!repo.includes('/')){toast('Usá un repo como Santi-PdR/EternalCraft-Modpack.','error');return;}
  if(!publishPreview){await previewDeveloperPack();if(!publishPreview)return;}
  const label=`${publishPreview.version||'nueva versión'} — ${publishPreview.releaseName||'SIEGE Update'}`;const changes=(publishPreview.added||[]).length+(publishPreview.changed||[]).length+(publishPreview.removed||[]).length;
  if(!await askConfirm({title:'Publicar modpack',message:`Vas a publicar ${label} con ${changes} cambios. GitHub pasará a ser el canal estable para todos los jugadores.`,confirmText:'Publicar actualización'}))return;
  setBusy(true,'PUBLICANDO MODPACK');showOperation('PUBLICANDO MODPACK');$('developerPublishLog').textContent=`Publicando ${label}…\n`;$('operationPhase').textContent='SUBIENDO CAMBIOS A GITHUB';$('operationFile').textContent='La interfaz seguirá disponible en segundo plano.';
  try{const result=await api.developerPublish({repo,source,version,notes,expectedFingerprint:publishPreview?.sourceFingerprint||''});publishPreview=null;$('developerPreviewCard')?.classList.add('hidden');if(result.state){fillBaseState(result.state)}toast('Modpack publicado en GitHub. Los launchers conectados lo recibirán al comprobar actualizaciones.','success');}
  catch(err){toast(err.message||String(err),'error');$('developerPublishLog').textContent+=`\nERROR: ${err.message||String(err)}`;}
  finally{hideOperation();setBusy(false)}
}
async function changeDeveloperPassword(){const current=await askPrompt({title:'Cambiar contraseña',message:'Ingresá la contraseña de desarrollador actual.',inputLabel:'CONTRASEÑA ACTUAL',password:true,confirmText:'Continuar'});if(current===null)return;const next=await askPrompt({title:'Nueva contraseña',message:'Usá al menos 6 caracteres. Esta contraseña queda guardada únicamente de forma local.',inputLabel:'NUEVA CONTRASEÑA',password:true,confirmText:'Cambiar contraseña'});if(next===null)return;try{const status=await api.developerChangePassword({currentPassword:current,nextPassword:next});renderDeveloper(status);toast('Contraseña actualizada.','success')}catch(err){toast(err.message||String(err),'error')}}

function renderUpdateCenter(){
  const pack=updateCenterState.pack,mods=updateCenterState.mods;const modCount=Number(mods?.count||0);const packNeeds=Boolean(pack&&pack.configured&&pack.healthy===false);const launcherNeeds=Boolean(launcherUpdateAvailable);const total=(packNeeds?1:0)+modCount+(launcherNeeds?1:0);
  if($('navUpdatesBadge')){$('navUpdatesBadge').textContent=String(total);$('navUpdatesBadge').classList.toggle('hidden',total===0);}
  if($('updatesLastCheck'))$('updatesLastCheck').textContent=updateCenterState.lastChecked?timeAgo(updateCenterState.lastChecked):'—';
  if($('updatesPackTitle'))$('updatesPackTitle').textContent=!pack?'Sin comprobar':packNeeds?(pack.state?.version?'Actualización disponible':'Instalación necesaria'):'Al día';
  if($('updatesPackText')){const free=Number(pack?.system?.disk?.freeBytes||0),required=Number(pack?.system?.disk?.requiredBytes||0);const low=packNeeds&&free>0&&required>free;$('updatesPackText').textContent=!pack?'—':packNeeds?`${(pack.missing?.length||0)+(pack.changed?.length||0)} archivos · ${formatBytes(pack.bytesRequired||0)}${low?' · ESPACIO INSUFICIENTE':''}`:`${pack.ok||pack.total||0} archivos verificados`;}

  if($('updatesModsTitle'))$('updatesModsTitle').textContent=modCount?`${modCount} actualización${modCount===1?'':'es'}`:'Al día';
  if($('updatesModsText'))$('updatesModsText').textContent='Los mods instalados se administran localmente; las versiones oficiales llegan con el modpack.';
  if($('updatesLauncherTitle'))$('updatesLauncherTitle').textContent=launcherNeeds?'Nueva versión disponible':`v${appState?.appVersion||'0.65.12'}`;
  if($('updatesLauncherText'))$('updatesLauncherText').textContent=launcherNeeds?'Podés descargarla sin tocar el modpack.':appState?.packaged?'Canal del launcher comprobado.':'Modo desarrollo · updater desactivado.';
  const javaOk=Boolean(appState?.java?.found&&Number(appState?.java?.major)>=17);if($('updatesRuntimeTitle'))$('updatesRuntimeTitle').textContent=javaOk?`Java ${appState.java.version||17}`:'Java compatible pendiente';if($('updatesRuntimeText'))$('updatesRuntimeText').textContent=javaOk?(appState.java.managed?'Runtime administrado por Eternal Craft.':'Runtime detectado en el sistema.'):'Elegí un Java 17 o superior en tu sistema.';
  if($('updatesHeroMark'))$('updatesHeroMark').textContent=total?'!':'✓';if($('updatesHero'))$('updatesHero').classList.toggle('has-updates',total>0);if($('updatesHeroTitle'))$('updatesHeroTitle').textContent=total?`${total} actualización${total===1?'':'es'} pendiente${total===1?'':'s'}`:'Todo está actualizado';if($('updatesHeroText'))$('updatesHeroText').textContent=total?'Podés revisar cada componente o aplicar las actualizaciones disponibles.':'Launcher, modpack y mods personales están listos.';
  if($('homeQuickUpdate'))$('homeQuickUpdate').textContent=total?`${total} PENDIENTE${total===1?'':'S'}`:'TODO AL DÍA'; if($('homeQuickUpdateMeta'))$('homeQuickUpdateMeta').textContent=packNeeds?`${formatBytes(pack.bytesRequired||0)} de pack`:launcherNeeds?'Launcher disponible':'Sin descargas pendientes';
}
async function refreshUpdateCenter(showToast=false){
  if(updateCenterInFlight)return updateCenterInFlight;
  updateCenterInFlight=(async()=>{
  if($('updatesHeroTitle'))$('updatesHeroTitle').textContent='Comprobando actualizaciones…';
  try{
    const [packResult]=await Promise.all([api.checkPack()]); const pack=normalizePackStatus(packResult); const mods={count:0,updates:[]};
    updateCenterState.pack=pack;updateCenterState.mods=mods;updateCenterState.lastChecked=new Date().toISOString();renderPack(pack);
    renderMods(modsState);
    if(appState?.packaged&&appState?.launcherUpdateConfigured)await api.checkLauncherUpdate().catch(()=>{});
    renderUpdateCenter();if(showToast)toast('Comprobación completa.','success');return updateCenterState;
  }catch(err){if(showToast)toast(err.message||String(err),'error');throw err;}
  })();
  try{return await updateCenterInFlight}finally{updateCenterInFlight=null}
}
async function refreshEverything(showToast=false){
  if(busy)return;
  setBusy(true,'REVISANDO TODO');
  try{
    const results=await Promise.allSettled([
      refreshUpdateCenter(false),
      refreshHealth(false),
      refreshStorage(false),
      refreshVault(false),
      refreshClips(false),
      refreshModAudit(false),
      refreshCrashGuard(false),
      refreshChangeHistory()
    ]);
    const failed=results.filter(result=>result.status==='rejected').length;
    renderNotifications();
    if(showToast)toast(failed?`Revisión completa con ${failed} sección(es) sin respuesta.`:'Revisión completa: todas las secciones están actualizadas.',failed?'warn':'success');
    return {failed};
  } finally { setBusy(false); }
}
async function applyAllUpdates(){
  if(busy)return;const packNeeds=Boolean(updateCenterState.pack?.healthy===false);const modCount=Number(updateCenterState.mods?.count||0);if(!packNeeds&&!modCount&&!launcherUpdateAvailable){toast('No hay actualizaciones pendientes.','success');return;}
  if(!await askConfirm({title:'Actualizar todo',message:`Se actualizará ${packNeeds?'el modpack':''}${packNeeds&&modCount?' y ':''}${modCount?`${modCount} mod${modCount===1?'':'s'} personal${modCount===1?'':'es'}`:''}. El launcher se gestiona por separado para evitar reinicios inesperados.`,confirmText:'Actualizar'}))return;
  if(packNeeds)await runPackAction('update');if(modCount)await updateAllPersonalMods();await refreshUpdateCenter(false);toast('Actualizaciones de contenido completadas.','success');
}
function renderDeveloperPreflight(){
  const host=$('developerPreflightList');if(!host)return;const source=String(appState?.config?.developer?.sourceDirectory||'');const test=String(appState?.config?.developer?.testDirectory||'');const rows=[
    ['GitHub',developerState.githubReady?'Conectado':'Requiere sesión',developerState.githubReady?'ok':'warn'],
    ['SIEGE',source?'Fuente configurada':'Sin instancia',source?'ok':'bad'],
    ['test-1',test?'Instancia configurada':'Sin instancia',test?'ok':'warn'],
    ['Preview',publishPreview?`${publishPreview.version||''} · ${publishPreview.releaseName||''}`:'Pendiente','info']
  ];host.innerHTML='';for(const [label,text,state] of rows){const row=document.createElement('div');row.className=`preflight-row ${state}`;row.innerHTML='<span></span><b></b><small></small>';row.querySelector('span').textContent=state==='ok'?'✓':state==='bad'?'×':'•';row.querySelector('b').textContent=label;row.querySelector('small').textContent=text;host.appendChild(row);}
}
async function runDeveloperPreflight(){
  try{
    const r=await api.developerPreflight();const host=$('developerPreflightList');if(!host)return;
    const rows=[
      ['GitHub',r.githubReady?`Conectado${r.githubLogin?` como ${r.githubLogin}`:''}`:'Requiere sesión',r.githubReady?'ok':'bad'],
      ['Repositorio',r.repoReady?`${r.repo} accesible`:`${r.repo||'Sin repo'} · revisar`,r.repoReady?'ok':'warn'],
      ['SIEGE',r.sourceReady?`${r.sourceMods} mods · fuente válida`:'Instancia no válida',r.sourceReady?'ok':'bad'],
      ['test-1',r.testReady?`${r.testMods} mods · ${r.pendingTestChanges||0} cambios pendientes`:'Instancia no válida',r.testReady?'ok':'warn'],
      ['Preview',publishPreview?`${publishPreview.version||''} · ${publishPreview.releaseName||''}`:'Pendiente','info']
    ];
    host.innerHTML='';for(const [label,text,state] of rows){const row=document.createElement('div');row.className=`preflight-row ${state}`;row.innerHTML='<span></span><b></b><small></small>';row.querySelector('span').textContent=state==='ok'?'✓':state==='bad'?'×':'•';row.querySelector('b').textContent=label;row.querySelector('small').textContent=text;host.appendChild(row);}toast('Preflight real completado.','success');
  }catch(err){toast(err.message||String(err),'error')}
}
function updatePlayAvailability(){
  if(!$('playBtn')||!appState)return; const javaOk=Boolean(appState.java?.found&&Number(appState.java?.major)>=17),javaAuto=appState.config.minecraft.autoInstallJava!==false,configured=Boolean(appState.manifestConfigured),compatible=appState.launcherCompatible!==false,healthy=packState?.healthy;
  let disabled=busy||!configured||(!javaOk&&!javaAuto)||!compatible; let caption='INICIAR';
  const neverInstalled=packState&& !packState.state?.version;
  if(!configured)caption='PACK NO PUBLICADO'; else if(!compatible)caption='ACTUALIZÁ EL LAUNCHER'; else if(!javaOk&&javaAuto)caption=neverInstalled?'PREPARAR E INSTALAR':'PREPARAR JAVA Y JUGAR'; else if(!javaOk)caption='JAVA 17 REQUERIDO'; else if(packState&&healthy===false){caption=neverInstalled?'INSTALAR Y JUGAR':appState.config.pack.autoUpdate?'ACTUALIZAR Y JUGAR':'REQUIERE ACTUALIZACIÓN';if(!appState.config.pack.autoUpdate)disabled=true;}
  if(!javaOk&&!javaAuto)caption='JAVA 17+ REQUERIDO'; $('playBtn').disabled=disabled; $('playCaption').textContent=caption;
}

async function refreshServer(showToast=false){
  if(refreshServer.inFlight)return refreshServer.inFlight;
  refreshServer.inFlight=(async()=>{try{const status=await api.pingServer();renderServer(status);if(showToast)toast('Estado de conexión actualizado.','info');return status;}
  catch(err){renderServer({online:false});if(showToast)toast('No pude comprobar la conexión.','warn');return null;}})();
  try{return await refreshServer.inFlight}finally{refreshServer.inFlight=null}
}
async function performPackRefresh(showOverlay=false){
  if(showOverlay && busy)return null;
  const ownsBusy=Boolean(showOverlay);
  const started=performance.now();
  try{
    if(ownsBusy){setBusy(true,'COMPROBANDO MODPACK');showOperation('COMPROBANDO MODPACK');}
    const status=normalizePackStatus(await api.checkPack());
    renderPack(status);
    if(ownsBusy){
      const configured=status?.configured!==false;
      $('operationPercent').textContent='100%'; $('operationBar').style.width='100%';
      $('operationPhase').textContent=configured?'COMPROBACIÓN COMPLETA':'SIN CANAL PUBLICADO';
      $('operationFile').textContent=configured?`${status?.ok||0}/${status?.total||0} archivos verificados`:'Configura el canal desde Modo desarrollador';
      if(status?.configured===false)toast('El modpack todavía no está publicado: no hay un canal remoto que comprobar. Configuralo desde Modo desarrollador.','info');
      else if(status?.healthy)toast(`Modpack verificado: ${status.ok||0}/${status.total||0} archivos correctos.`,'success');
      else toast(`Hay ${Number(status?.missing?.length||0)+Number(status?.changed?.length||0)} archivo(s) del modpack para actualizar o reparar.`,'warn');
      await waitMs(650-(performance.now()-started));
    }
    return status;
  } catch(err){
    if(ownsBusy){$('operationPhase').textContent='NO SE PUDO COMPROBAR';$('operationFile').textContent=String(err?.message||err||'Error').slice(0,180);await waitMs(650-(performance.now()-started));}
    toast(err.message||String(err),'error');throw err;
  } finally{if(ownsBusy){hideOperation();setBusy(false)}}
}
async function refreshPack(showOverlay=false){
  if(packRefreshInFlight)return packRefreshInFlight;
  packRefreshInFlight=performPackRefresh(showOverlay);
  try{return await packRefreshInFlight}finally{packRefreshInFlight=null}
}
async function runPackAction(mode='update'){
  if(busy)return;const started=performance.now();setBusy(true,mode==='repair'?'REPARANDO':'ACTUALIZANDO');showOperation(mode==='repair'?'REPARANDO MODPACK':'ACTUALIZANDO MODPACK');
  try{const result=mode==='repair'?await api.repairPack():await api.updatePack(true);renderPack(result);$('operationPercent').textContent='100%';$('operationBar').style.width='100%';$('operationPhase').textContent='COMPLETADO';$('operationFile').textContent=result?.updated===false?'La instalación ya estaba al día.':'Instalación verificada';toast(result.updated===false?'El modpack ya estaba al día.':'Modpack listo.','success');await waitMs(500-(performance.now()-started));}
  catch(err){toast(err.message||String(err),'error');}
  finally{hideOperation();setBusy(false)}
}
async function launch(){
  if(busy)return;
  try{
    const health=await api.healthCheck().catch(()=>null);
    const critical=health?.issues?.find(x=>x.severity==='bad');
    if(critical){toast(`No conviene iniciar todavía: ${critical.text}.`,'error');setPage('support');return;}
  }catch(_){}
  setBusy(true,'PREPARANDO JUEGO');showOperation(packState?.healthy===false?'ACTUALIZANDO ANTES DE JUGAR':'INICIANDO MINECRAFT');
  try{await api.launchGame();hideOperation();toast('Minecraft iniciado.','success');appState.config.launcher.lastPlayedAt=new Date().toISOString();renderSession();}
  catch(err){hideOperation();toast(err.message||String(err),'error');}
  finally{setBusy(false)}
}
function problemHelp(type){
  const map={
    start:['MINECRAFT NO INICIA','Primero comprobá el modpack. Si está correcto, revisá que Java 17 aparezca como LISTO y generá un diagnóstico.'],
    crash:['CRASH / CIERRE INESPERADO','Generá el diagnóstico y abrí Logs. Si existe crash-reports, adjuntá también el archivo más reciente.'],
    server:['NO PUEDO ENTRAR','Comprobá que el servidor esté ONLINE y que el modpack figure LISTO. Una versión vieja suele impedir la conexión.'],
    fps:['FPS / RENDIMIENTO','Probá el preset Rendimiento y 5–6 GB de RAM. Dar demasiada RAM tampoco mejora necesariamente los FPS.']
  }; const [title,text]=map[type]||['SOPORTE','Generá un diagnóstico.']; $('helpTitle').textContent=title;$('helpText').textContent=text;$('helpStrip').classList.remove('hidden');
}
function validUsername(value){return /^[A-Za-z0-9_]{3,16}$/.test(String(value||'').trim())}
async function saveSettings(silent=false){
  clearTimeout(autoSaveTimer); autoSaveTimer=null;
  if(silent&&$('settingsSaved'))$('settingsSaved').textContent='GUARDANDO…';
  const typedUsername=$('usernameInput').value.trim(); const username=validUsername(typedUsername)?typedUsername:String(appState?.config?.minecraft?.username||'').trim(); if(!validUsername(username)){if(!silent)toast('El nick debe tener entre 3 y 16 caracteres.','error');return;}
  const resolution=$('resolutionSelect').value; const systemResolution=resolution==='system'; let width=appState?.system?.display?.width||1920,height=appState?.system?.display?.height||1080; if(!systemResolution){[width,height]=resolution.split('x').map(Number)}
  const patch={
    minecraft:{username,maxMemoryMb:Number($('ramRange').value)*1024,preset:$('gamePresetSelect').value,width,height,useSystemResolution:systemResolution,fullscreen:$('fullscreenToggle').checked,autoInstallJava:$('autoJavaToggle').checked,preferDedicatedGpu:$('dedicatedGpuToggle').checked},
    pack:{autoUpdate:$('autoUpdateToggle').checked,repairBeforeLaunch:$('repairBeforeToggle').checked,autoSnapshot:$('autoSnapshotToggle')?.checked!==false},
    mods:{...(appState?.config?.mods||{}),sort:$('modsSort')?.value||appState?.config?.mods?.sort||'recent',compatibilityWarnings:$('compatibilityWarningsToggle')?.checked!==false,hideWarnings:$('modWarningsToggle')?.checked===false,protectServerCompatibility:$('protectServerCompatibilityToggle')?.checked!==false,autoChangeSnapshots:$('autoChangeSnapshotsToggle')?.checked!==false},
    sync:{...(appState?.config?.sync||{}),includeScreenshots:$('vaultScreenshotsToggle')?.checked!==false,includeSaves:Boolean($('vaultSavesToggle')?.checked),extraPaths:String($('vaultExtraPaths')?.value||'').split(/[,;\n]+/).map(x=>x.trim()).filter(Boolean).slice(0,20)},
    launcher:{hideOnGameStart:$('hideOnStartToggle').checked,refocusOnGameExit:$('refocusOnExitToggle').checked,startPage:$('startPageSelect')?.value||'home',rememberLastPage:Boolean($('rememberLastPageToggle')?.checked),autoConnectivityCheck:$('autoConnectivityToggle')?.checked!==false,closeToTray:$('closeToTrayToggle')?.checked!==false,startWithSystem:Boolean($('startWithSystemToggle')?.checked),startMinimized:Boolean($('startMinimizedToggle')?.checked),nativeNotifications:$('nativeNotificationsToggle')?.checked!==false,sidebarCollapsed:document.body.classList.contains('sidebar-collapsed'),theme:$('themeSelect').value,background:$('backgroundSelect').value,backgroundMode:$('backgroundModeSelect')?.value||'fixed',backgroundBrightness:clamp(Number($('backgroundBrightnessRange')?.value||100)/100,.7,1.2),density:$('densitySelect')?.value||'comfortable',uiScale:$('uiScaleSelect')?.value||'normal',accent:$('accentColorInput')?.value||'',accent2:$('accent2ColorInput')?.value||'',cardRadius:clamp(Number($('cardRadiusRange')?.value||16),8,28),glassEffects:$('glassEffectsToggle')?.checked!==false,scanlines:$('scanlinesToggle').checked,noise:$('noiseToggle').checked,reducedMotion:$('reducedMotionToggle').checked}
  };
  patch.launcher.backgroundBrightness=clamp(Number($('backgroundBrightnessRange')?.value||100)/100,.7,1.2);
  try{const config=await api.saveSettings(patch);appState.config=config;if(!silent){fillBaseState({...appState,config,developer:developerState});$('settingsSaved').textContent='GUARDADO';setTimeout(()=>$('settingsSaved').textContent='',2200);toast('Ajustes guardados.','success');}else if($('settingsSaved')){ $('settingsSaved').textContent='AUTOGUARDADO'; setTimeout(()=>{if($('settingsSaved')?.textContent==='AUTOGUARDADO')$('settingsSaved').textContent=''},1400); }}catch(err){if($('settingsSaved'))$('settingsSaved').textContent='NO GUARDADO';if(!silent)toast(err.message||String(err),'error')}
}
function queueSettingsSave(){clearTimeout(autoSaveTimer);if($('settingsSaved'))$('settingsSaved').textContent='PENDIENTE';autoSaveTimer=setTimeout(()=>saveSettings(true),450)}
async function resetAppearance(){
  if(!await askConfirm({title:'Restablecer apariencia',message:'Se restaurarán tema, fondo, colores, escala, densidad y efectos visuales. Tus ajustes de apariencia vuelven a los valores iniciales.',confirmText:'Restablecer'}))return;
  const patch={launcher:{theme:'aurora',background:'frontline',backgroundMode:'fixed',backgroundBrightness:1,density:'comfortable',uiScale:'normal',accent:'',accent2:'',cardRadius:16,glassEffects:true,scanlines:true,noise:false,reducedMotion:false}};
  try{const config=await api.saveSettings(patch);appState.config=config;fillBaseState({...appState,config,developer:developerState});toast('Apariencia restaurada.','success');}catch(err){toast(err.message||String(err),'error');}
}

function renderVault(status={}){
  const configured=Boolean(status.configured);const conflicts=Array.isArray(status.conflicts)?status.conflicts:[];
  if($('vaultBadge')){$('vaultBadge').textContent=configured?(conflicts.length?'CONFLICTOS':'LISTO'):'SIN CONFIGURAR';$('vaultBadge').className=`vault-badge ${conflicts.length?'warn':configured?'ok':''}`;}
  if($('vaultPath'))$('vaultPath').textContent=configured?(status.directory||'Configurado'):'No elegida';
  if($('vaultLastPush'))$('vaultLastPush').textContent=status.lastPush?timeAgo(status.lastPush):'—';
  if($('vaultSummary'))$('vaultSummary').textContent=configured?`${status.files||0} archivos · ${formatBytes(status.bytes||0)}`:'Elegí una carpeta';
  const note=$('vaultConflictNote');if(note){if(conflicts.length){note.classList.remove('hidden');note.textContent=`Hay ${conflicts.length} archivo(s) local(es) más nuevos que la copia del Vault. Al restaurar te voy a pedir confirmación.`;}else{note.classList.add('hidden');note.textContent='';}}
  if($('vaultPushBtn'))$('vaultPushBtn').disabled=!configured;if($('vaultPullBtn'))$('vaultPullBtn').disabled=!configured;
}
async function refreshVault(showToast=false){try{const r=await api.vaultStatus();renderVault(r);if(showToast)toast(r.configured?'Personal Vault revisado.':'Elegí una carpeta para activar Personal Vault.',r.configured?'success':'warn');return r}catch(err){if(showToast)toast(err.message||String(err),'error');return null}}
async function chooseVault(){try{const r=await api.chooseVaultDirectory();if(!r)return;if(r.config){appState.config=r.config;fillBaseState({...appState,config:r.config})}renderVault(r.status||{});toast('Carpeta de Personal Vault configurada.','success')}catch(err){toast(err.message||String(err),'error')}}
async function pushVaultAction(){if(busy)return;try{await saveSettings();setBusy(true,'GUARDANDO PERSONAL VAULT');showOperation('GUARDANDO PERSONAL VAULT');const r=await api.pushVault();toast(`${r.files||0} archivos guardados en tu Vault · ${formatBytes(r.bytes||0)}.`,'success');await refreshVault(false)}catch(err){toast(err.message||String(err),'error')}finally{hideOperation();setBusy(false)}}
async function pullVaultAction(){if(busy)return;try{await saveSettings();setBusy(true,'RESTAURANDO PERSONAL VAULT');showOperation('RESTAURANDO PERSONAL VAULT');let r=await api.pullVault(false);if(r?.needsConfirmation){const sample=(r.conflicts||[]).slice(0,5).join('\n');const ok=await askConfirm({title:'Resolver conflictos de Personal Vault',message:`Hay ${r.count||r.conflicts?.length||0} archivo(s) locales más nuevos que la copia guardada.${sample?`\n\nEjemplos:\n${sample}`:''}\n\nSi continuás, se crea un punto de restauración antes de reemplazarlos.`,confirmText:'Restaurar igualmente'});if(!ok)return;r=await api.pullVault(true);}toast(`${r.copied||0} archivos restaurados desde Personal Vault.`,'success');await refreshVault(false)}catch(err){toast(err.message||String(err),'error')}finally{hideOperation();setBusy(false)}}

async function installJava(){
  if(busy)return; setBusy(true,'PREPARANDO JAVA 17'); showOperation('PREPARANDO JAVA 17');
  try{const result=await api.installJava();hideOperation();const state=await api.getState();fillBaseState(state);toast(`Java ${result.java?.version||'17'} listo.`, 'success');}
  catch(err){hideOperation();toast(err.message||String(err),'error');}
  finally{setBusy(false)}
}
async function runQuickDiagnostic(){
  try{const result=await api.quickDiagnostic();const badge=$('quickDiagBadge'),icon=$('quickDiagIcon');$('quickDiagTitle').textContent=result.title||'Análisis completo';$('quickDiagText').textContent=result.summary||'No hay información adicional.';badge.textContent=result.severity==='ok'?'SIN ALERTAS':'REVISAR';badge.className=result.severity==='ok'?'ok':'warn';icon.textContent=result.severity==='ok'?'✓':'!';icon.classList.toggle('warn',result.severity!=='ok');}
  catch(err){toast(err.message||String(err),'error')}
}
function handleLauncherUpdate(event={}){
  const banner=$('launcherUpdateBanner'),btn=$('launcherUpdateBtn');
  if(event.type==='checking'){setHealth('readyLauncher','BUSCANDO','warn');return;}
  if(event.type==='available'){
    launcherUpdateAvailable=true;updateCenterState.launcher='available';renderUpdateCenter();
    launcherUpdateMode='download';banner.classList.remove('hidden');$('launcherUpdateBannerTitle').textContent=`Launcher ${event.info?.version||'nuevo'} disponible`;$('launcherUpdateBannerText').textContent='Actualiza el launcher sin tocar ni volver a descargar el modpack.';btn.textContent='DESCARGAR';setHealth('readyLauncher','UPDATE','warn');toast('Hay una actualización del launcher.','warn');return;
  }
  if(event.type==='none'){launcherUpdateAvailable=false;updateCenterState.launcher='current';renderUpdateCenter();banner.classList.add('hidden');setHealth('readyLauncher','LISTO','ok');return;}
  if(event.type==='progress'){launcherUpdateMode='downloading';banner.classList.remove('hidden');const p=Math.round(event.progress?.percent||0);$('launcherUpdateBannerTitle').textContent=`Descargando launcher · ${p}%`;$('launcherUpdateBannerText').textContent=`${formatBytes(event.progress?.transferred||0)} / ${formatBytes(event.progress?.total||0)}`;btn.textContent='DESCARGANDO';btn.disabled=true;return;}
  if(event.type==='downloaded'){launcherUpdateAvailable=true;updateCenterState.launcher='downloaded';renderUpdateCenter();launcherUpdateMode='install';banner.classList.remove('hidden');$('launcherUpdateBannerTitle').textContent='Actualización lista';$('launcherUpdateBannerText').textContent='Reiniciá el launcher para instalarla.';btn.textContent='REINICIAR E INSTALAR';btn.disabled=false;setHealth('readyLauncher','REINICIAR','warn');return;}
  if(event.type==='error'){btn.disabled=false;toast(`Actualización del launcher: ${event.message||'error'}`,'error');}
}
async function launchSafeGameAction(){
  if(busy)return;setBusy(true,'INICIO SEGURO');
  try{const r=await api.launchSafeGame();toast(`Inicio seguro: ${r.disabledMods||0} mods personales desactivados temporalmente.`,'success')}
  catch(err){toast(err.message||String(err),'error')}
  finally{setBusy(false)}
}

async function launcherUpdateAction(){
  try{
    if(launcherUpdateMode==='install'){await api.installLauncherUpdate();return;}
    if(launcherUpdateMode==='download'){await api.downloadLauncherUpdate();return;}
    const result=await api.checkLauncherUpdate();if(!result?.configured&&result?.development)toast('Las actualizaciones automáticas se activan en la AppImage/EXE final.','warn');
  }catch(err){toast(err.message||String(err),'error')}
}


async function refreshConnectivity(showToast=false){
  const host=$('connectivityList'),badge=$('connectivityBadge'); if(!host||!api.connectivityCheck)return;
  if(connectivityInFlight)return connectivityInFlight;
  host.innerHTML='<div class="empty-state">Comprobando servicios…</div>'; badge.textContent='COMPROBANDO'; badge.className='warn';
  connectivityInFlight=(async()=>{try{const r=await api.connectivityCheck();host.innerHTML='';for(const item of r.results||[]){const row=document.createElement('div');row.className='connectivity-row';const detail=item.ok?`${item.latency} ms`:item.status?`HTTP ${item.status}`:'SIN CONEXIÓN';row.innerHTML=`<span><i class="${item.ok?'ok':'bad'}"></i>${escapeHtml(item.name)}${item.critical===false?' <small>(opcional)</small>':''}</span><b class="${item.ok?'ok':'bad'}">${detail}</b>`;host.appendChild(row);}const ok=r.online===true;badge.textContent=ok?'TODO ONLINE':'REVISAR';badge.className=ok?'ok':'warn';if(showToast)toast(ok?'Conectividad correcta.':'Hay servicios críticos sin conexión.',ok?'success':'warn');return r;}catch(err){host.innerHTML=`<div class="empty-state">${escapeHtml(err.message||String(err))}</div>`;badge.textContent='ERROR';badge.className='bad';if(showToast)toast(err.message||String(err),'error');return null;}})();
  try{return await connectivityInFlight}finally{connectivityInFlight=null}
}
async function refreshStorage(showToast=false){
  if(!api.getStorageSummary)return;try{const r=await api.getStorageSummary();const set=(id,v)=>{if($(id))$(id).textContent=`${formatBytes(v?.bytes||0)} · ${v?.files||0}`};set('storageMods',r.mods);set('storageConfig',r.config);set('storageCacheDetail',r.cache);set('storageRecovery',r.recovery);set('storageLogs',r.logs);if(showToast)toast('Uso de almacenamiento actualizado.','success');return r;}catch(err){if(showToast)toast(err.message||String(err),'error')}
}
async function cleanupOldLogs(){if(!await askConfirm({title:'Limpiar logs antiguos',message:'Se eliminarán logs de más de 14 días. Los logs recientes se conservan.',confirmText:'Limpiar'}))return;try{const r=await api.cleanupLogs(14);toast(`${r.removed||0} logs eliminados · ${formatBytes(r.bytes||0)} liberados.`,'success');await refreshStorage(false);}catch(err){toast(err.message||String(err),'error')}}

function bind(){
  $('maintenanceClearCacheBtn')?.addEventListener('click',clearPackCacheAction);$('refreshStorageBtn')?.addEventListener('click',()=>refreshStorage(true));$('cleanupLogsBtn')?.addEventListener('click',cleanupOldLogs);$('connectivityBtn')?.addEventListener('click',()=>refreshConnectivity(true));
  $('notificationsBtn')?.addEventListener('click',()=>toggleNotifications());$('notificationsClearBtn')?.addEventListener('click',()=>{notificationHistory=[];notificationUnread=false;renderNotifications();toggleNotifications(false)});document.addEventListener('mousedown',e=>{const d=$('notificationDrawer'),b=$('notificationsBtn');if(d&&!d.classList.contains('hidden')&&!d.contains(e.target)&&!b?.contains(e.target))toggleNotifications(false)});
  $('commandPaletteBtn')?.addEventListener('click',openCommandPalette);
  $('commandPalette')?.addEventListener('mousedown',e=>{if(e.target===$('commandPalette'))closeCommandPalette()});
  $('commandPaletteInput')?.addEventListener('input',()=>{commandIndex=0;renderCommandPalette()});
  $('commandPaletteInput')?.addEventListener('keydown',e=>{const items=visibleCommands();if(e.key==='ArrowDown'){e.preventDefault();commandIndex=clamp(commandIndex+1,0,Math.max(0,items.length-1));renderCommandPalette()}else if(e.key==='ArrowUp'){e.preventDefault();commandIndex=clamp(commandIndex-1,0,Math.max(0,items.length-1));renderCommandPalette()}else if(e.key==='Enter'&&items.length){e.preventDefault();executeCommand(items[commandIndex])}else if(e.key==='Escape')closeCommandPalette()});
  $('appDialogCancel')?.addEventListener('click',()=>closeAppDialog(null));
  $('appDialogConfirm')?.addEventListener('click',()=>closeAppDialog($('appDialogInputWrap').classList.contains('hidden')?true:$('appDialogInput').value));
  $('appDialog')?.addEventListener('mousedown',e=>{if(e.target===$('appDialog'))closeAppDialog(null)});
  $('appDialogInput')?.addEventListener('keydown',e=>{if(e.key==='Enter')closeAppDialog(e.currentTarget.value);else if(e.key==='Escape')closeAppDialog(null)});
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('commandPalette').classList.contains('hidden')?openCommandPalette():closeCommandPalette();return}
    if((e.ctrlKey||e.metaKey)&&e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='r'){e.preventDefault();refreshEverything(true);return}
    if(e.key==='Escape'){if(!$('commandPalette').classList.contains('hidden'))closeCommandPalette();else if(!$('appDialog').classList.contains('hidden'))closeAppDialog(null)}
    if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&['1','2','3','4','5','6','7'].includes(e.key)){e.preventDefault();const pages=['home','mods','modpack','updates','support','settings','gallery'];setPage(pages[Number(e.key)-1])}
  });
  $$('.nav-item').forEach(btn=>btn.addEventListener('click',()=>{setPage(btn.dataset.page);if(btn.dataset.page==='mods')refreshMods(false);if(btn.dataset.page==='modpack')refreshRecovery();if(btn.dataset.page==='updates')refreshUpdateCenter(false);if(btn.dataset.page==='support'){refreshCrashGuard(false).catch(()=>{});refreshChangeHistory().catch(()=>{})}}));
  $$('[data-page-jump]').forEach(btn=>btn.addEventListener('click',()=>setPage(btn.dataset.pageJump)));
  $('minimizeBtn').addEventListener('click',api.minimize);$('maximizeBtn').addEventListener('click',api.toggleMaximize);$('closeBtn').addEventListener('click',api.close);$('operationMinimizeBtn')?.addEventListener('click',minimizeOperation);$('operationTaskPill')?.addEventListener('click',restoreOperation);$('sidebarCollapseBtn')?.addEventListener('click',async()=>{const collapsed=!document.body.classList.contains('sidebar-collapsed');document.body.classList.toggle('sidebar-collapsed',collapsed);try{const cfg=await api.saveSettings({launcher:{sidebarCollapsed:collapsed}});if(appState)appState.config=cfg}catch(_){}});$$('[data-settings-tab]').forEach(btn=>btn.addEventListener('click',()=>{queueSettingsSave();if($('settingsSearch'))$('settingsSearch').value='';setSettingsGroup(btn.dataset.settingsTab);applySettingsSearch();}));
  $$('#page-settings input, #page-settings select, #page-settings textarea').filter(el=>!el.closest('[data-settings-group="developer"]')).forEach(el=>{el.addEventListener('input',queueSettingsSave);el.addEventListener('change',queueSettingsSave)});
  $('playBtn').addEventListener('click',launch);$('safeLaunchBtn')?.addEventListener('click',launchSafeGameAction);$('repairQuickBtn').addEventListener('click',()=>runPackAction('repair'));$('quickFolder').addEventListener('click',()=>api.openInstance());
  $('homeRecommendedBtn')?.addEventListener('click',autoConfigureRecommended);$('settingsSearch')?.addEventListener('input',applySettingsSearch);$('settingsSearch')?.addEventListener('keydown',e=>{if(e.key==='Escape'){e.currentTarget.value='';applySettingsSearch();e.currentTarget.blur();}});
  $('homeConnectionCard')?.addEventListener('click',()=>refreshServer(true));$('refreshServerBtn').addEventListener('click',()=>refreshServer(true));$('copyServerBtn').addEventListener('click',async()=>{try{await api.copyServerAddress();toast('IP del servidor copiada.','success')}catch(err){toast(err.message||String(err),'error')}});$('quickSupport').addEventListener('click',()=>setPage('support'));$('sessionAlertSupport').addEventListener('click',()=>setPage('support'));$('sessionAlertClose').addEventListener('click',()=>$('sessionAlert').classList.add('hidden'));$('sessionAlertSafe')?.addEventListener('click',()=>{ $('sessionAlert').classList.add('hidden'); launchSafeGameAction(); });
  $('modsEnableAllBtn')?.addEventListener('click',()=>setAllPersonalModsEnabled(true));$('modsDisableAllBtn')?.addEventListener('click',()=>setAllPersonalModsEnabled(false));$('openModsFolderBtn')?.addEventListener('click',()=>api.openInstance());$('modsSearch')?.addEventListener('input',()=>renderMods(modsState));$$('[data-mod-filter]').forEach(btn=>btn.addEventListener('click',()=>{modFilter=btn.dataset.modFilter;$$('[data-mod-filter]').forEach(x=>x.classList.toggle('active',x===btn));renderMods(modsState)}));
  $('modsSort')?.addEventListener('change',async()=>{await api.saveSettings({mods:{sort:$('modsSort').value}});if(appState)appState.config.mods={...(appState.config.mods||{}),sort:$('modsSort').value};refreshMods(false)});$('modsResetFiltersBtn')?.addEventListener('click',resetModsFilters);
  $('checkPackBtn').addEventListener('click',()=>refreshPack(true));$('quickCheck').addEventListener('click',()=>refreshPack(true));$('updatePackBtn').addEventListener('click',()=>runPackAction('update'));$('openInstanceBtn').addEventListener('click',()=>api.openInstance());
  $('clearCacheBtn')?.addEventListener('click',clearPackCacheAction);$('modsAuditBtn')?.addEventListener('click',()=>refreshModAudit(true));$('modsAuditIgnoreBtn')?.addEventListener('click',()=>ignoreModWarning('audit'));$('modsHideWarningsBtn')?.addEventListener('click',hideAllModWarnings);$('modWarningsToggle')?.addEventListener('change',async()=>{ignoredModWarnings.clear();await saveSettings(true);if($('modWarningsToggle').checked){refreshModAudit(false).catch(()=>{});}});$('openLastLogMaintenanceBtn')?.addEventListener('click',()=>api.openLatestLog?api.openLatestLog():api.openLogs());
  $('createRecoveryBtn')?.addEventListener('click',createRecovery);$('refreshAllBtn')?.addEventListener('click',()=>refreshEverything(true));$('healthRefreshBtn')?.addEventListener('click',()=>refreshHealth(true));
  $$('.problem-card').forEach(btn=>btn.addEventListener('click',()=>problemHelp(btn.dataset.problem)));
  $('quickDiagnoseBtn').addEventListener('click',runQuickDiagnostic);$('crashGuardRefreshBtn')?.addEventListener('click',()=>refreshCrashGuard(true));$('crashGuardDisableBtn')?.addEventListener('click',quarantineCrashSuspects);$('buildDiagnosticBtn').addEventListener('click',async()=>{try{$('diagnosticOutput').textContent=await api.buildDiagnostic()}catch(err){toast(err.message||String(err),'error')}});
  $('copyDiagnosticBtn').addEventListener('click',async()=>{try{await api.copyDiagnostic();toast('Diagnóstico copiado.','success')}catch(err){toast(err.message||String(err),'error')}});
  $('saveDiagnosticBtn')?.addEventListener('click',async()=>{try{const file=await api.saveDiagnostic();if(file)toast('Informe de soporte guardado.','success')}catch(err){toast(err.message||String(err),'error')}});$('supportBundleBtn')?.addEventListener('click',async()=>{try{const file=await api.exportSupportBundle();if(file)toast('Paquete de soporte guardado. No incluye contraseñas, API keys ni mundos.','success')}catch(err){toast(err.message||String(err),'error')}});$('openLogsBtn').addEventListener('click',()=>api.openLogs());
  $('ramRange').addEventListener('input',updateRamPicker); $('ramMinus').addEventListener('click',()=>setRam(Number($('ramRange').value)-1)); $('ramPlus').addEventListener('click',()=>setRam(Number($('ramRange').value)+1)); $$('#ramPresets [data-ram]').forEach(btn=>btn.addEventListener('click',()=>setRam(Number(btn.dataset.ram))));
  $('themeSelect').addEventListener('change',()=>{document.body.dataset.theme=$('themeSelect').value;$$('#themeGallery [data-theme-choice]').forEach(b=>b.classList.toggle('active',b.dataset.themeChoice===$('themeSelect').value));queueSettingsSave()});$$('#themeGallery [data-theme-choice]').forEach(btn=>btn.addEventListener('click',()=>{$('themeSelect').value=btn.dataset.themeChoice;document.body.dataset.theme=btn.dataset.themeChoice;$$('#themeGallery [data-theme-choice]').forEach(b=>b.classList.toggle('active',b===btn));queueSettingsSave()}));$('backgroundSelect').addEventListener('change',()=>{applyBackground($('backgroundSelect').value);queueSettingsSave()});$('densitySelect')?.addEventListener('change',()=>{document.body.dataset.density=$('densitySelect').value;queueSettingsSave()});$('uiScaleSelect')?.addEventListener('change',()=>{document.body.dataset.uiScale=$('uiScaleSelect').value;queueSettingsSave()});$('glassEffectsToggle')?.addEventListener('change',()=>{document.body.classList.toggle('glass-off',!$('glassEffectsToggle').checked);queueSettingsSave()});$('scanlinesToggle').addEventListener('change',()=>{document.body.classList.toggle('no-scanlines',!$('scanlinesToggle').checked);queueSettingsSave()});$('noiseToggle').addEventListener('change',()=>{document.body.classList.toggle('no-noise',!$('noiseToggle').checked);queueSettingsSave()});$('reducedMotionToggle').addEventListener('change',()=>{document.body.classList.toggle('reduced-motion',$('reducedMotionToggle').checked);queueSettingsSave()});
  $('accentColorInput')?.addEventListener('input',()=>{const value=$('accentColorInput').value;document.documentElement.style.setProperty('--themeAccent',value);if($('accentColorValue'))$('accentColorValue').textContent=value;queueSettingsSave()});$('accent2ColorInput')?.addEventListener('input',()=>{const value=$('accent2ColorInput').value;document.documentElement.style.setProperty('--themeAccent2',value);if($('accent2ColorValue'))$('accent2ColorValue').textContent=value;queueSettingsSave()});$('cardRadiusRange')?.addEventListener('input',()=>{const value=clamp(Number($('cardRadiusRange').value),8,28);document.documentElement.style.setProperty('--radius-lg',`${value}px`);if($('cardRadiusValue'))$('cardRadiusValue').textContent=`${value}px`;queueSettingsSave()});$('backgroundBrightnessRange')?.addEventListener('input',()=>{const value=clamp(Number($('backgroundBrightnessRange').value),70,120);$('backgroundBrightnessRange').value=String(value);if($('backgroundBrightnessValue'))$('backgroundBrightnessValue').textContent=value+'%';document.documentElement.style.setProperty('--backgroundBrightness',String(value/100));queueSettingsSave()});$('resetAppearanceBtn')?.addEventListener('click',resetAppearance);
  $('installJavaBtn').addEventListener('click',installJava);$('saveSettingsBtn').addEventListener('click',saveSettings);$('resetPresetBtn').addEventListener('click',async()=>{try{await api.resetGamePreset($('gamePresetSelect').value);toast('Ajustes recomendados restaurados.','success')}catch(err){toast(err.message||String(err),'error')}});
  $('minecraftLoginBtn')?.addEventListener('click',loginMicrosoft);$('minecraftLogoutBtn')?.addEventListener('click',logoutMicrosoft);$('refreshSkinsBtn')?.addEventListener('click',()=>refreshSkins(true));$('uploadSkinBtn')?.addEventListener('click',uploadSkin);
  $('clipsChooseBtn')?.addEventListener('click',async()=>{try{const result=await api.clipsChooseFolder();if(result){clipsState=result;renderClips(result);toast('Carpeta de clips configurada.','success');}}catch(err){toast(err.message||String(err),'error')}});$('clipsRefreshBtn')?.addEventListener('click',()=>refreshClips(true));$('clipsOpenFolderBtn')?.addEventListener('click',()=>api.clipsOpenFolder().catch(err=>toast(err.message||String(err),'error')));$('clipsClearBtn')?.addEventListener('click',async()=>{try{await api.clipsClearFolder();clipsState={configured:false,directory:'',items:[],total:0,images:0,videos:0};renderClips(clipsState);toast('Carpeta de clips quitada.','success')}catch(err){toast(err.message||String(err),'error')}});$('clipsResetBtn')?.addEventListener('click',resetClipsView);$('clipsSearch')?.addEventListener('input',e=>{clipsView.query=e.target.value;renderClips(clipsState);queueClipsViewSave()});$('clipsTypeFilter')?.addEventListener('change',e=>{clipsView.type=e.target.value;renderClips(clipsState);queueClipsViewSave()});$('clipsSort')?.addEventListener('change',e=>{clipsView.sort=e.target.value;renderClips(clipsState);queueClipsViewSave()});
  $('autoConfigureBtn')?.addEventListener('click',autoConfigureRecommended);$('exportSettingsBtn')?.addEventListener('click',exportSettingsAction);$('importSettingsBtn')?.addEventListener('click',importSettingsAction);
  $('vaultChooseBtn')?.addEventListener('click',chooseVault);$('vaultPushBtn')?.addEventListener('click',pushVaultAction);$('vaultPullBtn')?.addEventListener('click',pullVaultAction);
  $('changeInstallBtn').addEventListener('click',async()=>{try{const folder=await api.chooseInstallDirectory();if(folder){appState.config.pack.installDirectory=folder;$('instancePath').textContent=folder;$('settingsInstallPath').textContent=folder;toast('Carpeta actualizada.','success')}}catch(err){toast(err.message||String(err),'error')}});
  $('developerOpenRepoBtn')?.addEventListener('click',()=>{const repo=$('developerRepo')?.value.trim();if(repo?.includes('/'))api.openExternal(`https://github.com/${repo}`);else toast('Configurá el repositorio primero.','warn')});$('developerUnlockBtn').addEventListener('click',unlockDeveloper);$('developerResetBtn')?.addEventListener('click',resetDeveloperAccess);$('developerPassword').addEventListener('keydown',e=>{if(e.key==='Enter')unlockDeveloper()});$('developerChooseSource').addEventListener('click',chooseDeveloperSource);$('developerChooseTest')?.addEventListener('click',chooseDeveloperTest);$('developerOpenTestBtn')?.addEventListener('click',()=>api.developerOpenTest().catch(err=>toast(err.message||String(err),'error')));$('developerLaunchTestBtn')?.addEventListener('click',async()=>{try{await api.developerLaunchTest();toast('test-1 iniciado con la configuración actual.','success')}catch(err){toast(err.message||String(err),'error')}});$('developerPreviewBtn')?.addEventListener('click',previewDeveloperPack);$('developerPublishBtn').addEventListener('click',publishDeveloperPack);$('developerCompareTestBtn')?.addEventListener('click',compareDeveloperTest);$('developerPromoteSelectedBtn')?.addEventListener('click',promoteSelectedTestMods);
  $('onboardingContinue').addEventListener('click',completeOnboarding);$('onboardingUsername').addEventListener('keydown',e=>{if(e.key==='Enter')completeOnboarding()});
  $('whatsNewClose')?.addEventListener('click',closeWhatsNew);$('launcherUpdateBtn').addEventListener('click',launcherUpdateAction);$('updatesCheckAllBtn')?.addEventListener('click',()=>refreshUpdateCenter(true));$('updatesApplyAllBtn')?.addEventListener('click',applyAllUpdates);$('updatesPackBtn')?.addEventListener('click',()=>setPage('modpack'));$('updatesModsBtn')?.addEventListener('click',()=>setPage('mods'));$('updatesLauncherBtn')?.addEventListener('click',launcherUpdateAction);$('updatesRuntimeBtn')?.addEventListener('click',()=>setPage('settings'));$('developerPreflightBtn')?.addEventListener('click',runDeveloperPreflight);
  api.onPackProgress(onPackProgress);api.onLauncherUpdate(handleLauncherUpdate);if(api.onUiCommand)api.onUiCommand(cmd=>{if(cmd==='play')launch();else if(cmd==='updates')setPage('updates')});if(api.onDeveloperPublishLog)api.onDeveloperPublishLog(line=>{const el=$('developerPublishLog');if(el){el.textContent+=(el.textContent.endsWith('\n')?'':'\n')+line;el.scrollTop=el.scrollHeight;}if($('operationFile'))$('operationFile').textContent=String(line||'').slice(-180);if($('operationPhase'))$('operationPhase').textContent='PUBLICANDO · PROGRESO EN VIVO';});
  api.onGameExit(async(session)=>{
    if(session?.test){toast(`test-1 finalizó${Number.isInteger(session.code)?` · código ${session.code}`:''}.`,session.code===0?'success':'warn');return;}
    if(session?.safeMode)toast('Inicio seguro finalizado: tus mods personales fueron restaurados.','success');
    try{const state=await api.getState();fillBaseState(state)}catch(_){if(appState){appState.config.launcher.lastSession=session;renderSession()}}
    refreshHealth(false).catch(()=>{});refreshChangeHistory().catch(()=>{});refreshCrashGuard(false).catch(()=>{}); if(session && Number.isInteger(session.code) && session.code!==0){const streak=Number(appState?.config?.launcher?.crashStreak||0);$('sessionAlertTitle').textContent=`Minecraft se cerró con código ${session.code}`;$('sessionAlertText').textContent=streak>=2?'Se detectaron cierres inesperados repetidos. Probá Inicio Seguro para descartar mods personales.':'Abrí Soporte para revisar el diagnóstico y latest.log.';$('sessionAlertSafe')?.classList.toggle('hidden',streak<2);$('sessionAlert').classList.remove('hidden');toast('Minecraft se cerró de forma inesperada.','error');}
  });
}
async function completeOnboarding(){
  const username=$('onboardingUsername').value.trim(); if(!validUsername(username)){$('onboardingError').textContent='Usá entre 3 y 16 caracteres: letras, números o _.';return}
  try{const state=await api.completeOnboarding({username});$('onboarding').classList.add('hidden');fillBaseState(state);toast(`Bienvenido, ${username}.`,'success')}
  catch(err){$('onboardingError').textContent=err.message||String(err)}
}
async function maybeShowWhatsNew(){if(!appState)return;const current=String(appState.appVersion||'');const seen=String(appState.config?.launcher?.lastSeenVersion||'');if(current&&current!==seen){$('whatsNewOverlay')?.classList.remove('hidden')}}
async function closeWhatsNew(){if(!$('whatsNewOverlay'))return;$('whatsNewOverlay').classList.add('hidden');try{const cfg=await api.saveSettings({launcher:{lastSeenVersion:String(appState?.appVersion||'')}});if(appState)appState.config=cfg}catch(_){}}
async function init(){
  bind();
  try{
    const state=await api.getState();fillBaseState(state);if(state.configRecovery)toast('La configuración local estaba dañada. El launcher inició con valores seguros y guardó una copia para recuperación.','warn');if(state.manifestStale)toast('Sin conexión al canal del pack: usando la última versión conocida en caché.','warn');
    if(state.needsOnboarding){$('onboardingUsername').value='';$('onboarding').classList.remove('hidden');setTimeout(()=>$('onboardingUsername').focus(),50)}
    await Promise.all([refreshPack(false),refreshMods(false),refreshHealth(false),refreshRecovery(),refreshModAudit(false),refreshCrashGuard(false),refreshChangeHistory(),refreshVault(false),refreshClips(false)]);renderBackgroundGallery(state.config.launcher?.background||'frontline');renderNotifications();setSettingsGroup('game');const remembered=state.config.launcher?.rememberLastPage?state.config.launcher?.lastPage:'';const preferred=remembered||state.config.launcher?.startPage;const firstPage=['home','mods','updates','modpack','gallery','support','settings'].includes(preferred)?preferred:'home';setPage(firstPage);refreshStorage(false).catch(()=>{});if(state.config.launcher?.autoConnectivityCheck!==false)setTimeout(()=>refreshConnectivity(false).catch(()=>{}),700);setTimeout(()=>maybeShowWhatsNew(),420);setTimeout(()=>refreshUpdateCenter(false).catch(()=>{}),1200);runQuickDiagnostic().catch(()=>{});footer('LISTO');
    if(state.packaged&&state.config.launcher.autoUpdate&&state.launcherUpdateConfigured)api.checkLauncherUpdate().catch(()=>{});
  }catch(err){toast(err.message||String(err),'error');footer('ERROR DE INICIO')}
  finally{setTimeout(()=>$('bootScreen')?.classList.add('done'),160)}
}
init();
