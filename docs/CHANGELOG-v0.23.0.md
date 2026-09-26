# Eternal Craft Launcher 0.23.0

## Interfaz y UX
- Búsqueda global dentro de Ajustes.
- `Ctrl + K` ahora también encuentra mods instalados y permite lanzar una búsqueda directa en catálogo externo.
- Perfil de juego en Inicio con configuración recomendada en un toque.
- Compatibilidad cliente/servidor visible en el catálogo.
- Cola de instalación de mods.
- Opción para recordar la última sección abierta.

## Fiabilidad
- Renderizado endurecido en catálogo y buscador para no interpretar nombres o mensajes remotos como HTML.
- `config.json` usa escritura transaccional con backup temporal.
- Recuperación automática si una escritura queda interrumpida.
- Las configuraciones JSON corruptas se apartan y conservan para soporte.
- Log local de errores internos del launcher.
- Salud del sistema avisa cuando la RAM asignada supera el máximo sugerido.

## Modpack
- Medidor de margen de almacenamiento antes de actualizar.
- El Centro de Actualizaciones señala falta de espacio antes de descargar.

## Soporte
- Nuevo paquete de soporte JSON con datos sanitizados, diagnóstico, conectividad, almacenamiento, auditoría y listado de mods.
- No incluye contraseñas, API keys, tokens de GitHub ni mundos.

## Versión
- Launcher: 0.23.0
- `minimumLauncher`: 0.23.0
