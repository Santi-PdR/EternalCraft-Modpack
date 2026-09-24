# Eternal Craft Launcher 0.15.0

Release grande centrada en comportamiento de aplicación de escritorio, confiabilidad y flujo de mantenimiento.

## Aplicación

- Bandeja del sistema con Abrir / Jugar / Actualizaciones / Salir.
- Cerrar a bandeja configurable.
- Inicio con Windows/Linux y opción de iniciar minimizado.
- Notificaciones nativas opcionales.
- Conserva el comportamiento de ventana e integración KDE/Windows.

## Inicio

- Nuevo centro rápido con actualización, biblioteca de mods y calidad de conexión.
- Preflight antes de Jugar para detectar fallos críticos.
- Si el servidor está offline, permite decidir si abrir Minecraft igualmente.
- Estado del disco incluido en el centro de salud.

## Mods

- Favoritos y filtro de favoritos.
- Orden por favoritos.
- Activar o desactivar todos los mods personales de una vez.
- Conserva separación entre mods oficiales y personales.

## Modpack y red

- Reintentos automáticos para descargas temporariamente fallidas.
- Se conserva SHA-256, caché, staging, rollback y manifest offline.
- Mejor información de salud y calidad de conexión.

## Soporte

- Guardar diagnóstico completo como archivo TXT.
- Notificaciones más claras de operaciones terminadas.

## Developer Mode

- Preflight real de GitHub, instancia maestra y test-1.
- Backup manual de todos los mods de SIEGE antes de una operación grande.
- Botón para abrir el repositorio configurado.
- Se conserva preview, promoción test-1 → SIEGE y publicación diferencial.

## Interfaz

- Ember Protocol y Command White.
- Mejor foco, scrollbars, tarjetas, transiciones y jerarquía visual.
- Sidebar y tarjetas del Home más claras sin perder identidad SIEGE.

## Calidad

- `scripts/check-project.js` ahora valida recursivamente todos los JS y los IDs usados por el renderer.
- `minimumLauncher` sube a 0.15.0.
- Windows y Linux se siguen compilando mediante GitHub Actions.
