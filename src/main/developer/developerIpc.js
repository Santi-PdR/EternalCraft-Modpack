function registerDeveloperIpc(context) {
  const {
    ipcMain, app, dialog, shell, store, developerService, mainWindow, path, os, fsp,
    runExclusive, configWithDisplay, currentManifest, ensurePlayableJava, launchGame,
    resourcesDir, managedJavaRoot, emit, packProgress, markPublishedOfficial,
    appendLauncherError, invalidateRuntimeCaches, primeManifestCache, safeStatePayload
  } = context;
  ipcMain.handle('developer:status', async () => developerService.statusAsync());
  ipcMain.handle('developer:preflight', async () => { const cfg=store.load(); return developerService.preflightAsync(cfg.developer?.sourceDirectory, cfg.developer?.testDirectory, cfg.developer?.githubRepo); });
  ipcMain.handle('developer:backup-source', async () => { const cfg=store.load(); return developerService.backupSourceMods(cfg.developer?.sourceDirectory); });
  ipcMain.handle('developer:setup', async (_event, password) => developerService.setup(password));
  ipcMain.handle('developer:unlock', async (_event, password) => developerService.unlock(password));
  ipcMain.handle('developer:reset-access', async () => developerService.resetAccess());
  ipcMain.handle('developer:lock', async () => developerService.lock());
  ipcMain.handle('developer:change-password', async (_event, payload = {}) => {
    payload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    return developerService.changePassword(payload.currentPassword, payload.nextPassword);
  });
  ipcMain.handle('developer:choose-source', async () => {
    const cfg = store.load(); const folder = await developerService.chooseSource(dialog, mainWindow, cfg.developer?.sourceDirectory);
    if (folder) store.save({ developer: { sourceDirectory: folder } }); return folder;
  });
  ipcMain.handle('developer:choose-test', async () => {
    const cfg = store.load(); const fallback = path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1');
    const folder = await developerService.chooseTest(dialog, mainWindow, cfg.developer?.testDirectory || fallback);
    if (folder) store.save({ developer: { testDirectory: folder } }); return folder;
  });
  ipcMain.handle('developer:open-test', async () => {
    developerService.requireUnlocked(); const cfg=store.load(); const folder=cfg.developer?.testDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1');
    const root=developerService.resolveRoot(folder); await fsp.mkdir(path.join(root,'mods'),{recursive:true}); return shell.openPath(root);
  });
  ipcMain.handle('developer:launch-test', async () => runExclusive('inicio de test-1', async () => {
    developerService.requireUnlocked(); let cfg=configWithDisplay(store.load());
    const testCandidate=cfg.developer?.testDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1'); const test=developerService.resolveRoot(testCandidate);
    const info=await currentManifest(cfg); const java=await ensurePlayableJava(cfg);
    cfg={...cfg,pack:{...cfg.pack,installDirectory:test},launcher:{...cfg.launcher,hideOnGameStart:false}};
    return launchGame({
      config:cfg, manifest:info.manifest, resourcesDir:resourcesDir(), managedJavaRoot:managedJavaRoot(), javaInfo:java,
      onLog:(line)=>emit('game:log',{...line,test:true}), onProgress:(p)=>packProgress(p)
    }, { test:true });
  }));
  ipcMain.handle('developer:copy-mod-test', async (_event, filename) => {
    developerService.requireUnlocked(); const cfg=store.load(); const test=developerService.resolveRoot(cfg.developer?.testDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1'));
    const target=await copyModToRoot(cfg.pack.installDirectory,test,filename); return {ok:true,target};
  });
  ipcMain.handle('developer:sync-test-mods', async () => {
    developerService.requireUnlocked(); const cfg=store.load(); const testCandidate=cfg.developer?.testDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1'); const test=developerService.resolveRoot(testCandidate);
    const info=await currentManifest(cfg); const listing=await listMods(cfg.pack.installDirectory,info.manifest,'recent'); const copied=[];
    for(const mod of listing.mods.filter(m=>m.userAdded&&m.enabled)){ await copyModToRoot(cfg.pack.installDirectory,test,mod.filename); copied.push(mod.filename); }
    return {ok:true,copied,testDirectory:test};
  });
  ipcMain.handle('developer:publish-preview', async (_event, payload = {}) => runExclusive('preview de publicación', async () => {
    payload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const current = store.load(); const repo = String(payload.repo || current.developer?.githubRepo || '').trim();
    const source = String(payload.source || current.developer?.sourceDirectory || '').trim() || path.join(require('os').homedir(), '.sklauncher', 'instances', 'siege');
    const preflight = await developerService.preflightAsync(source, current.developer?.testDirectory, repo);
    if (!preflight.githubReady) throw new Error('Preview detenido: GitHub CLI no está autenticado en la build de mantenimiento.');
    if (!preflight.sourceReady) throw new Error(`Preview detenido: no encontré una carpeta mods válida en ${preflight.sourceRoot || source}.`);
    return developerService.previewPublish({ repo, source, version: String(payload.version || '').trim(), notes: String(payload.notes || ''), onLine: (line) => emit('developer:publish-log', line) });
  }));
  ipcMain.handle('developer:test-compare', async () => {
    developerService.requireUnlocked(); const cfg=store.load();
    const source=cfg.developer?.sourceDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'siege');
    const test=cfg.developer?.testDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1');
    return developerService.compareTestAsync(source,test);
  });
  ipcMain.handle('developer:test-promote', async (_event, filename) => {
    developerService.requireUnlocked(); const cfg=store.load();
    const source=cfg.developer?.sourceDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'siege');
    const test=cfg.developer?.testDirectory || path.join(require('os').homedir(), '.sklauncher', 'instances', 'test-1');
    return developerService.promoteTestMod(source,test,String(filename||''));
  });

  ipcMain.handle('developer:test-promote-all', async () => runExclusive('promoción de mods de test-1', async () => {
    const cfg=store.load(); const source=cfg.developer?.sourceDirectory; const test=cfg.developer?.testDirectory;
    if(!source||!test) throw new Error('Configurá las instancias SIEGE y test-1.');
    const diff=await developerService.compareTestAsync(source,test);
    const names=[...(diff.testOnly||[]).map(x=>x.name),...(diff.changed||[]).map(x=>x.name)];
    const promoted=[];
    for(const name of names){ await developerService.promoteTestMod(source,test,name); promoted.push(name); }
    return { promoted, diff:await developerService.compareTestAsync(source,test) };
  }));

  ipcMain.handle('developer:publish', async (_event, payload = {}) => runExclusive('publicación del modpack', async () => {
    payload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
    const current = store.load();
    const repo = String(payload.repo || current.developer?.githubRepo || '').trim();
    const source = String(payload.source || current.developer?.sourceDirectory || '').trim() || path.join(require('os').homedir(), '.sklauncher', 'instances', 'siege');
    const preflight = await developerService.preflightAsync(source, current.developer?.testDirectory, repo);
    const blockers = [];
    if (!preflight.githubReady) blockers.push('GitHub CLI no está autenticado');
    if (!preflight.sourceReady) blockers.push(`la instancia SIEGE no tiene una carpeta mods válida (${preflight.sourceRoot || source})`);
    if (!repo.includes('/')) blockers.push('el repositorio debe tener formato USUARIO/REPO');
    if (blockers.length) throw new Error(`Publicación detenida por preflight: ${blockers.join('; ')}.`);
    emit('developer:publish-log', `Preflight OK · ${preflight.sourceMods} mods detectados · GitHub ${preflight.githubLogin || 'conectado'}`);
    const cfg = store.save({ developer: { githubRepo: repo, sourceDirectory: source } });
    const result = await developerService.publish({ repo, source, version: String(payload.version || '').trim(), notes: String(payload.notes || ''), expectedFingerprint: String(payload.expectedFingerprint || ''), onLine: (line) => emit('developer:publish-log', line) });
    // A refreshed preview means the source changed after review. Return it to
    // the renderer, but do not touch local official-mod metadata or caches.
    if (result.sourceChanged) return result;
    let publishedManifest = null;
    try {
      publishedManifest = JSON.parse(await fsp.readFile(result.manifestPath, 'utf8'));
      const publishedRoot = developerService.resolveRoot(source);
      await markPublishedOfficial(publishedRoot, publishedManifest);
      // The developer may publish from a separate SIEGE checkout while the
      // launcher is pointed at another linked instance. Promote that active
      // root too, so the jar just included in the verified manifest is shown
      // as official immediately instead of waiting for the next repair.
      const activeRoot = current.pack?.installDirectory ? developerService.resolveRoot(current.pack.installDirectory) : '';
      if (activeRoot && path.resolve(activeRoot) !== path.resolve(publishedRoot)) {
        await markPublishedOfficial(activeRoot, publishedManifest);
      }
    } catch (error) {
      // The GitHub publication is already verified. Keep that success visible,
      // while retaining a diagnostic if the local metadata sync is unavailable.
      await appendLauncherError('published metadata sync', error);
    }
    if (repo.includes('/')) {
      const branch = cfg.developer?.githubBranch || 'main';
      store.save({ pack: { manifestUrl: `https://raw.githubusercontent.com/${repo}/${branch}/channel/stable.json` } });
    }
    invalidateRuntimeCaches();
    // Use the manifest that just passed remote verification while GitHub's
    // raw edge propagates the new stable.json. This must happen after cache
    // invalidation so the primed value is not immediately discarded.
    if (publishedManifest && repo.includes('/')) primeManifestCache(store.load(), publishedManifest, 'remote');
    return { ...result, state: await safeStatePayload() };
  }));

}

module.exports = { registerDeveloperIpc };
