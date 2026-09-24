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

Para un feed genérico basado en GitHub Releases se puede usar:

```text
https://github.com/USUARIO/REPO/releases/latest/download/
```

Las builds de Electron Builder generan la metadata necesaria para AppImage/NSIS cuando corresponde.

## Mods personales

Los archivos que el jugador agrega desde la pestaña Mods no forman parte del manifest oficial. Por eso una actualización o reparación normal del modpack no los elimina ni los sobrescribe. Los mods oficiales se identifican por las rutas `mods/*.jar` presentes en el manifest y quedan bloqueados en la interfaz.

Si un mod personal provoca problemas, puede desactivarse renombrándolo internamente a `.jar.disabled` desde el propio launcher o quitarse desde la pestaña Mods.

## AppImage e identidad Linux

La versión instalada se compila como AppImage con `desktopName`/WM_CLASS `uy.eternalcraft.launcher`. `install-app.sh` registra el icono y el acceso de escritorio para que KDE la trate como **Eternal Craft Launcher**, no como una ventana genérica de Electron.

Cuando se configure el repositorio final del launcher, `electron-updater` podrá actualizar la AppImage por separado del modpack. Las AppImage generadas por electron-builder admiten actualización diferencial del propio binario.
