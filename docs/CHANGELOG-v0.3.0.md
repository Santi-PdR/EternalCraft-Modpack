# v0.3.0

- La instancia `~/.sklauncher/instances/siege/` pasa a ser fuente de publicación del pack, no una instancia importada por cada jugador.
- Nuevo generador de manifests SHA-256 y blobs content-addressed.
- Publicador opcional a GitHub Releases con reutilización de archivos sin cambios.
- Actualización automática/diferencial del modpack al iniciar.
- Caché local de hashes para acelerar verificaciones.
- Auto-update del launcher preparado con `electron-updater`.
- Workflow de GitHub Actions para releases de Windows/Linux.
- Primer inicio simplificado: solo pide nick.
- Server favicon real con fallback de Eternal Craft.
- Presets de juego propios; las updates ya no pisan `options.txt`.
- Audio UI completo y tres pistas ambientales originales.
- Reproductor de música, volumen independiente y mute.
- Nueva pantalla principal más compacta y con menos espacio vacío.
- Mejor feedback de actualización, reparación, tamaño de descarga e integridad.
- Mejoras generales de soporte, configuración y navegación.
