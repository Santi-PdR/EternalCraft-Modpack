# CurseForge para jugadores de Windows

CurseForge exige una API key oficial. No conviene incluirla dentro del EXE porque cualquiera podría extraerla.

Para que los jugadores puedan buscar e instalar desde CurseForge, en la build pública se configura **la URL del proxy**, no la API key. La key solo se guarda como secreto del proxy o en tu build privada de Fedora.

La carpeta `extras/curseforge-worker/` contiene un proxy mínimo para Cloudflare Workers. El plan gratuito es suficiente para un launcher pequeño.

1. Crear un Worker.
2. Guardar la API key como secreto `CF_API_KEY`.
3. Desplegar `worker.js`.
4. En **Domains and routes**, activar el subdominio `workers.dev` para ese Worker. Si figura como *Disabled*, cualquier consulta devuelve HTTP 404 aunque el código esté desplegado.
5. Comprobar que `https://<tu-worker>.workers.dev/` devuelva un JSON de servicio y que `/search?q=jei&gameVersion=1.20.1&loader=forge` responda con `results`.
6. Copiar la URL raíz del Worker (sin `/search`, `/file` ni `/project`) en **Ajustes > Modo desarrollador > CurseForge Proxy**.
7. Guardar y publicar la siguiente build del launcher.

El launcher usa el proxy únicamente para buscar y resolver la descarga compatible con Forge 1.20.1. La API key nunca llega a los jugadores.
