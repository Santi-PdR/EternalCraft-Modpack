# Sistema de actualización

## Modpack

Cada archivo distribuido se identifica por SHA-256. El manifest guarda ruta, tamaño, hash y URL del blob.

Cuando el launcher revisa una instalación:

1. reutiliza el índice local si el archivo no cambió;
2. calcula SHA-256 cuando hace falta;
3. detecta faltantes, modificados y archivos retirados;
4. calcula cuánto hay que descargar y comprueba espacio libre;
5. reutiliza la caché local cuando ya existe un blob correcto;
6. descarga el resto a caché/staging;
7. verifica SHA-256 antes de tocar la instalación;
8. guarda rollback de los archivos que va a reemplazar;
9. aplica los cambios;
10. vuelve a comprobar toda la instalación.

Si la verificación final falla, restaura lo anterior.

La caché está limitada y se limpia automáticamente sin eliminar hashes usados por la versión actual.

El inventario oficial (`.launcher/official-files.json`) guarda los archivos que
el pack distribuye hoy y todos los que distribuyó alguna vez. Eso permite
eliminar un mod retirado aunque el jugador haya saltado la versión que lo
retiró, sin tocar nunca los mods que agregó por su cuenta. Los directorios
vacíos que deja un retiro dentro de `mods/` y `iammusicplayerrenewed/` se podan
después de aplicar los cambios.

## Publicación determinista

El publicador compara SIEGE con el canal publicado y solo escribe después de
verificar. Garantías que ahora cubren las pruebas de integración:

- **Idempotencia**: publicar dos veces sin cambios no sube blobs, no crea una
  versión nueva y no toca el canal. Si el estado publicado quedó incompleto
  (blob faltante o dañado), lo repara sin cambiar la versión.
- **Blobs verificados de verdad**: cada asset se comprueba por tamaño y por el
  digest SHA-256 que informa GitHub. Un asset truncado por una subida
  interrumpida se detecta y se vuelve a subir aunque su nombre ya exista.
- **Sin canal a medias**: si no se puede leer el canal o el SHA del archivo
  remoto, la publicación se detiene antes de sobrescribir nada. El manifest
  solo se escribe cuando todos sus blobs ya están confirmados.
- **Retiros acumulativos**: `remove` conserva todo lo retirado por versiones
  anteriores, así que un jugador que salta versiones igual elimina los mods
  que ya no forman parte del pack.
- **Requisito de launcher real**: `minimumLauncher` se acota a la última
  release `launcher-v…` existente. Un build de mantenimiento no puede publicar
  un requisito que ningún launcher puede cumplir.
- **Preview fiel**: la tarjeta de Modo desarrollador muestra la próxima
  versión, el estado (LISTO / SIN CAMBIOS), los archivos añadidos, cambiados y
  eliminados de esta publicación, los ignorados por no ser payload y el
  launcher requerido. Publicar exige revisar el preview y detecta si SIEGE o
  los datos cambiaron en el medio.

## Fuente maestra

La ruta de desarrollo por defecto es:

```text
~/.sklauncher/instances/siege/
```

No se distribuyen mundos, screenshots, logs, crash reports, cachés, `options.txt`, `servers.dat` ni datos de mapas/waypoints personales.

## Fondos SIEGE

`start-from-siege.sh` intenta localizar el mod SIEGE dentro de la instancia maestra y extraer tres fondos del propio mod para usarlos en el launcher. Si no los encuentra, conserva los fondos incluidos como fallback.

## Java 17

Si el equipo no tiene Java 17, el launcher puede descargar un runtime Eclipse Temurin dentro de sus propios datos de usuario. No necesita permisos de administrador ni modifica el Java del sistema.

## Launcher

El launcher usa `electron-updater` para su propia actualización. El programa y el modpack son canales separados: actualizar el launcher no obliga a descargar el modpack otra vez.

El launcher tiene un canal de release dedicado (`launcher-latest`), separado de
las releases `pack-v…` del modpack. El workflow copia a ese canal solo los
metadatos y binarios del launcher, y marca como “latest” la release
`launcher-v…`. Las publicaciones del modpack se crean con `--latest=false` para
que nunca reemplacen las actualizaciones del launcher.

El feed configurado es:

```text
https://github.com/USUARIO/REPO/releases/download/launcher-latest/
```

Las builds de Electron Builder generan `latest-linux.yml` y `latest.yml` para
AppImage/NSIS. El workflow valida la versión del tag, ejecuta las pruebas y
actualiza el canal estable. Las instalaciones antiguas migran automáticamente
desde `/releases/latest/download/` al nuevo feed dedicado.

## Mods personales

Los archivos que el jugador agrega desde la pestaña Mods no forman parte del manifest oficial. Por eso una actualización o reparación normal del modpack no los elimina ni los sobrescribe. Los mods oficiales se identifican por las rutas `mods/*.jar` presentes en el manifest y quedan bloqueados en la interfaz.

Si un mod personal provoca problemas, puede desactivarse renombrándolo internamente a `.jar.disabled` desde el propio launcher o quitarse desde la pestaña Mods.

## AppImage e identidad Linux

La versión instalada se compila como AppImage con `desktopName`/WM_CLASS `uy.eternalcraft.launcher`. `install-app.sh` registra el icono y el acceso de escritorio para que KDE la trate como **Eternal Craft Launcher**, no como una ventana genérica de Electron.

Cuando se configure el repositorio final del launcher, `electron-updater` podrá actualizar la AppImage por separado del modpack. Las AppImage generadas por electron-builder admiten actualización diferencial del propio binario.
