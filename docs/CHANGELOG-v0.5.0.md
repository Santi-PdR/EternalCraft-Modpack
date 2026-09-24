# Eternal Craft Launcher 0.5.0

## Interfaz
- Pantalla **Jugar** rediseñada tomando como referencia patrones de launchers modernos: una acción principal clara, estado del servidor y del pack visibles sin llenar la pantalla de datos.
- Sidebar simplificada y tarjeta de jugador más compacta.
- Novedades del modpack directamente en Inicio mediante `releaseNotes` del manifest.
- Vista de Modpack centrada en estado, descarga necesaria y archivos pendientes.
- Configuración reorganizada en Cuenta/Juego, Comportamiento e Interfaz.
- Sin música ni sonidos del launcher.
- Interferencia visual desactivada por defecto; scanlines opcionales.

## Actualizaciones
- Descarga diferencial por SHA-256: solo archivos faltantes o modificados.
- Caché local por hash para reutilizar descargas al reparar.
- Actualizaciones transaccionales: descarga y verifica primero; aplica después.
- Rollback automático si la aplicación del update o la verificación final falla.
- Progreso más detallado: bytes descargados, velocidad y tiempo estimado.
- El manifest puede incluir notas y highlights de versión.
- `minimumLauncher` evita instalar un pack incompatible con una versión vieja del launcher.

## Sesiones y soporte
- Guarda última sesión, duración y código de salida.
- Si Minecraft termina con error, el launcher muestra un acceso directo a Soporte.
- Opción para ocultar el launcher mientras Minecraft corre y traerlo al frente al cerrar.

## Desarrollo del pack
- `build-pack.js --notes archivo.md` permite incluir notas de versión al construir desde la instancia SIEGE.
- El pack generado requiere Launcher 0.5.0 o superior.
