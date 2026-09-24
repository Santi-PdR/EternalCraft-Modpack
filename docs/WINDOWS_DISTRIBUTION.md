# Distribuir Eternal Craft Launcher en Windows

Los jugadores no necesitan Node.js, npm, GitHub CLI ni SKLauncher.

La build de Windows contiene la aplicación completa y usa una carpeta administrada propia para Eternal Craft.

## GitHub Actions

El workflow `Build / Release Eternal Craft Launcher` genera:

- `Eternal-Craft-Launcher-0.15.0-win-x64.exe` (portable, según electron-builder);
- instalador NSIS `.exe`;
- metadatos de actualización de electron-builder.

Podés ejecutar el workflow manualmente o crear `launcher-v0.15.0` para publicar una Release.

## Qué recibe un jugador

1. Ejecuta el `.exe`.
2. Escribe su nick.
3. El launcher obtiene `channel/stable.json` desde GitHub.
4. Instala Java 17 si hace falta.
5. Descarga el pack 1.0.0.
6. En versiones futuras solo descarga diferencias.
7. Inicia Minecraft con Forge 47.4.10.

El modo desarrollador no se inicializa en la build de Windows.
