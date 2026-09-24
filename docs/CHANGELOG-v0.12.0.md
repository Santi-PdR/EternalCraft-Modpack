# Eternal Craft Launcher 0.13.0

## Professional UI pass

- Nueva jerarquía visual global, con más espacio, tipografía más clara y controles consistentes.
- Navegación lateral agrupada en Juego, Contenido y Sistema.
- Iconografía SVG propia en la barra lateral.
- Barra superior con buscador de acciones rápidas (`Ctrl+K`).
- Atajos `Ctrl+1` a `Ctrl+5` para navegar entre secciones.
- Pantalla de arranque propia para evitar el salto visual al cargar la app.
- Diálogos internos para confirmaciones y entradas: ya no se usan `alert`, `confirm` ni `prompt` del navegador.
- Nuevas animaciones breves de página, respetando Reducir movimiento.
- Mejoras de contraste, foco de teclado, estados hover y accesibilidad.
- Home, Mods, Ajustes y Developer Mode con espaciado y tarjetas más consistentes.
- Biblioteca de mods con altura controlada y scrolling independiente para evitar páginas excesivamente largas.
- Catálogo con tarjetas más limpias y mejor adaptación a ventanas medianas.
- Galería de temas ampliada visualmente.
- Sección Acerca de en Ajustes con versión, plataforma, canal y Java activo.
- Footer simplificado con indicador de estado.

## Comportamiento

- `Ctrl+K` abre acciones rápidas para jugar, reparar, comprobar pack, copiar IP, abrir carpetas o navegar.
- El título de la ventana cambia según la sección actual.
- La app vuelve arriba al cambiar de sección.
- Las operaciones destructivas usan confirmaciones integradas con el tema actual.

## Compatibilidad

- Modpack mínimo actualizado a launcher 0.13.0.
- Mantiene Windows NSIS/portable y Linux AppImage.
- Mantiene el modo desarrollador oculto en builds normales de Windows.
