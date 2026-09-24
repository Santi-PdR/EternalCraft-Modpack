# Eternal Craft Launcher 0.6.0

## Experiencia de juego

- Java 17 puede ser administrado por el launcher sin permisos de administrador.
- Si Java 17 falta, **JUGAR** puede prepararlo automáticamente y continuar.
- La RAM recomendada se calcula según la memoria del equipo.
- El launcher comprueba el espacio libre antes de una actualización para evitar instalaciones a medias.
- Solo puede ejecutarse una instancia del launcher a la vez.

## Modpack

- Se mantiene el sistema diferencial por SHA-256, staging y rollback.
- La caché local se limpia automáticamente cuando supera el límite, sin borrar los blobs usados por la versión actual.
- La pantalla del pack muestra espacio libre y tamaño de caché.
- `start-from-siege.sh` fue corregido: instala dependencias antes de iniciar el modo de desarrollo y ya no abre el launcher dos veces.
- `dev-pack.js` ahora respeta `--source` y `--version`.

## SIEGE

- El modo de desarrollo intenta extraer automáticamente los fondos reales `frontline_19`, `night_battle` y `canyon_engagement` del mod SIEGE de la instancia maestra.
- Si esos recursos no están disponibles, conserva los fondos incluidos como fallback.
- Interferencia y scanlines quedan apagados por defecto para una interfaz más limpia.
- Jerarquía visual, tamaños de texto, paneles y acciones principales refinados.

## Soporte

- Nuevo análisis rápido de `latest.log` y el crash report más reciente.
- Detecta causas comunes: memoria insuficiente, mods duplicados, dependencias faltantes, Mixins, Java incorrecto, problemas de conexión y crashes nativos.
- El diagnóstico completo ahora incluye launcher, RAM asignada y el resultado del análisis rápido.

## Servidor

- Botón para copiar la IP directamente desde Inicio.
- Controles de estado del servidor más compactos.
