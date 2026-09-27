# Eternal Craft Launcher 0.80.0

- La publicación del modpack calcula el payload una sola vez por intento. La versión automática se aplica al manifest ya construido, evitando repetir hashes, copias y el progreso de todos los archivos.
- Si SIEGE cambia después de la previsualización, el launcher conserva la huella de seguridad, presenta el resumen actualizado y exige revisarlo antes de volver a publicar.
- Un preview deja de ser válido al cambiar el repositorio, la carpeta maestra, la versión o las notas; también se comprueban esos datos después del diálogo de confirmación.
- La respuesta del rechazo seguro no actualiza el inventario oficial de mods ni las cachés como si se hubiera publicado, y el JSON interno del preview no ensucia el log visible.
- La versión visible, el requisito del manifest de ejemplo y los User-Agent ahora proceden de la versión actual del launcher.

## Verificación

- `npm run check`
- `npm test`
- `git diff --check`

No se publicó una release ni se instaló esta versión localmente.
