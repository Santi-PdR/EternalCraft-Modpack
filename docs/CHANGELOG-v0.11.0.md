# Eternal Craft Launcher 0.11.0

## Interfaz
- Centro de salud en Inicio con estado de Java, modpack, servidor y mods personales.
- Dos temas nuevos: Dominion Gold y Nusia Signal.
- Fichas de mods en modal con detalles, compatibilidad, galería y enlace al proyecto.
- Mejor metadata visual para mods instalados.

## Modpack y recuperación
- Puntos de restauración manuales.
- Snapshot automático antes de actualizaciones que modifican archivos, configurable en Ajustes.
- Restauración de mods personales, config y options.txt sin reinstalar el pack.
- Se conservan los snapshots más recientes automáticamente.

## Mods
- Ficha completa de proyectos de catálogo externo.
- Metadata de entorno y versión guardada para instalaciones nuevas.
- Toggle para comprobar updates de mods personales al abrir.

## Developer Mode
- Inicio directo de test-1 desde el launcher.
- Resolución correcta de instancias que usan .minecraft/minecraft como subcarpeta.
- Promover todos los mods nuevos/modificados de test-1 a SIEGE.
- Campo opcional para resumen de release.
- Backups individuales antes de promover archivos existentes.

## Interno
- User-Agent unificado a 0.11.0.
- Validaciones ampliadas de HTML/JS/JSON y pruebas del sistema de recuperación.

## Robustez añadida
- Caché del manifest estable: si GitHub no responde, el launcher puede usar la última versión conocida para comprobar/jugar sin confundirlo con un pack inexistente.
- Barra de progreso nativa del sistema durante descargas/Java/Forge.
- Inicio Seguro desde Soporte: desactiva temporalmente solo mods personales y los restaura al cerrar Minecraft, incluso si el inicio falla.
- Recuperación automática de un Inicio Seguro interrumpido al volver a abrir el launcher.
- Reconocimiento de mods `.jar` agregados manualmente mediante hash de catálogo externo; al reconocerlos pueden recibir metadata y updates.
- Protección extra frente a instalar dos veces el mismo proyecto de catálogo externo/proveedor externo.
- proveedor externo Worker ampliado con fichas de proyecto, categorías y metadatos de búsqueda.
- Los snapshots consideran también mods oficiales marcados para eliminación, evitando restaurarlos accidentalmente como mods personales.
