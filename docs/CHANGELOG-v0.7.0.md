# Eternal Craft Launcher 0.7.0

## Interfaz

- rediseño visual completo: superficies claras, tarjetas de color, portada más visible y sidebar oscuro separado del contenido;
- menos aspecto de terminal y mejor jerarquía visual;
- grids responsivos para reducir solapamientos;
- icono nuevo del launcher;
- home, Modpack, Soporte y Ajustes reajustados para ventanas medianas.

## App propia

- identidad Linux estable: `uy.eternalcraft.launcher`;
- icono, `desktopName`, `StartupWMClass` y ejecutable propios;
- `install-app.sh` compila una AppImage, la instala en `~/.local/opt`, crea acceso en el menú y deja de depender de `npm start` para abrir el launcher;
- una build instalada aparece como **Eternal Craft Launcher**, no como Electron.

## Mods

- nueva pestaña Mods;
- lista separada entre mods oficiales y mods agregados por el jugador;
- agregar archivos `.jar` al único pack de Eternal Craft;
- activar/desactivar mods personales;
- eliminar mods personales;
- los mods oficiales están bloqueados y siguen bajo control del manifest;
- no se agregaron múltiples instancias ni selector de versiones.

## Actualizaciones

- el sistema diferencial SHA-256 sigue intacto;
- soporte para feed `file://` para probar una AppImage local usando la instancia SIEGE como fuente;
- el instalador local puede generar un feed del modpack desde `~/.sklauncher/instances/siege/` antes de compilar la AppImage.
