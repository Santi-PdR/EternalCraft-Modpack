# Plan de refactorización del Eternal Craft Launcher

Este plan conserva la interfaz actual y organiza la mejora en entregas pequeñas, verificables y reversibles.

## Estado auditado

- `src/main/main.js` concentra 853 líneas y todos los handlers IPC. Es el principal punto de acoplamiento.
- `src/renderer/renderer.js` concentra 955 líneas y mezcla estado, navegación, operaciones, catálogo y renderizado.
- La interfaz tiene varias superficies con controles densos; las reglas nuevas de ancho mínimo y salto de controles evitan solapamientos sin cambiar el diseño base.
- El flujo de publicación ya contempla archivos de cero bytes. La validación ahora exige el hash SHA-256 de contenido vacío cuando `empty: true`.
- El inicio solicita varias veces el manifiesto y el perfil del sistema. Una caché corta con deduplicación evita lecturas y descargas repetidas.

## Fase 1 — Estabilidad y regresiones (aplicada)

1. Compartir solicitudes en vuelo de manifiesto y perfil del sistema.
2. Invalidar esas cachés después de cambiar el canal, publicar, actualizar o reparar.
3. Mantener una operación de comprobación del modpack como operación exclusiva de la interfaz para impedir dobles clics y overlays que se pisan.
4. Validar manifiestos con archivos vacíos sin permitir URLs o hashes inconsistentes.
5. Ejecutar `npm run check`, `node --check`, `git diff --check` y pruebas unitarias pequeñas de manifiesto.

## Fase 2 — Separación de responsabilidades

1. Extraer `ipc/` por dominio: `pack`, `mods`, `developer`, `account`, `settings`, `support` y `window`.
2. Mantener un registro único de handlers que compruebe nombres duplicados al arrancar.
3. Extraer del renderer un store pequeño y módulos de página, manteniendo una sola instancia de API y una sola capa de toast/diálogo.
4. Añadir tipos de payload documentados para IPC y normalización centralizada de errores.

## Fase 3 — Operaciones y rendimiento

1. Convertir las operaciones largas en tareas cancelables con `AbortController` y un identificador visible.
2. Evitar escaneos duplicados de mods y almacenamiento mediante caché por directorio y evento de invalidación.
3. Limitar concurrencia de descargas y liberar listeners/timers al destruir la ventana.
4. Medir tiempo de arranque, comprobación, búsqueda de mods y reparación con marcas de rendimiento locales.

## Fase 4 — UI/UX de calidad

1. Mantener el diseño, colores y componentes existentes.
2. Verificar cada página en 1040 px, 1180 px, 1366 px y 1920 px de ancho, además de escalado HiDPI.
3. Corregir desbordes con `min-width: 0`, truncado accesible, filas que envuelven botones y alturas máximas en catálogos.
4. Añadir estados vacíos, de carga, error y éxito consistentes; ningún botón debe desaparecer sin feedback.
5. Auditar foco de teclado, `aria` en botones y contraste por tema.

## Criterios de aceptación

- Ninguna operación mutante puede ejecutarse dos veces a la vez.
- Publicar, previsualizar, comprobar, identificar e instalar muestran progreso o un resultado explícito.
- El launcher inicia sin solicitudes duplicadas innecesarias y sin errores no controlados.
- El contenido del repositorio no incluye secretos, `node_modules`, `dist`, cachés ni credenciales.
- Cada entrega pasa los checks locales y una build empaquetada antes de publicarse.
