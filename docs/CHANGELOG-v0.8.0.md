# Eternal Craft Launcher 0.8.0

## Interfaz
- Nuevo emblema eléctrico de Eternal Craft inspirado en la identidad visual del Discord de SIEGE.
- Cinco temas: Aurora, Tactical, Crimson, Frost y Obsidian.
- Trece fondos SIEGE seleccionables.
- Información del pack ampliada: versión, nombre, mods oficiales/personales, tamaño y generación.
- Selector de RAM renovado con presets y controles +/-.

## Mods
- Catálogo Modrinth integrado para Forge 1.20.1.
- Instalación directa y dependencias requeridas de Modrinth.
- Selector de proveedor Modrinth / CurseForge.
- CurseForge queda condicionado a credenciales/integración, sin incluir secretos en builds de jugadores.
- Mods personales sobreviven actualizaciones del pack.

## Rendimiento
- Preferencia de GPU dedicada activada por defecto.
- Detección de GPU en Linux y Windows.
- Java 17 administrado.

## Modo desarrollador
- Acceso por contraseña local (scrypt + salt).
- Solo Linux puede inicializar el modo desarrollador; Windows de jugadores lo oculta.
- Selección de instancia maestra SIEGE.
- Publicación del modpack a GitHub con un botón.
- Creación automática del repo público del pack si todavía no existe.
- Versionado automático desde 1.0.0.
- Nombres automáticos de dos palabras basados en mods/configs añadidos, cambiados o removidos.
- No publica una versión vacía si no hay cambios.

## Distribución
- Identidad de aplicación propia: `uy.eternalcraft.launcher` / `EternalCraftLauncher`.
- Windows NSIS + portable mediante GitHub Actions.
- Linux AppImage para mantenimiento.
- Fondos SIEGE descargados desde GitHub en CI para que la build de Windows venga completa.
