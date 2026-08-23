# Mi Horario — pocket schedule PWA

## Estado del proyecto

Este repo está en migración hacia una versión multi-usuario con cuenta,
sync entre dispositivos y notificaciones (ver `CHANGELOG.md` para el detalle
fase por fase). Mientras la migración avanza, la app **sigue funcionando
100% local** como hasta ahora — nada de lo que ya usa tu amiga deja de
funcionar a mitad de camino.

## Desarrollo local

Requiere [Node.js](https://nodejs.org) 18 o más nuevo.

```bash
npm install       # una sola vez
npm run dev       # levanta el servidor de desarrollo con recarga en vivo
npm run build     # genera la versión de producción en dist/
npm run preview   # sirve dist/ localmente para probar el build antes de publicar
```

### Supabase local (para las fases de backend/sync)

```bash
supabase start    # levanta Postgres + Auth + Studio en tu máquina (requiere Docker)
supabase stop      # los apaga
```

Copia `.env.example` a `.env` y llena `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` con lo que imprima `supabase start` en la terminal.

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (puede ser público o privado con Pages habilitado).
2. Corre `npm run build` — esto genera la carpeta `dist/` con todo listo para publicar
   (ya no se sube `index.html` y compañía sueltos, sino el contenido de `dist/`).
3. Sube el contenido de `dist/` a la rama que uses para Pages (por ejemplo `gh-pages`,
   o configura un GitHub Action — se documenta a detalle al cerrar la migración).
4. Ve a **Settings → Pages** del repositorio y selecciona esa rama como origen.
5. Guarda. GitHub te da un link tipo `https://tuusuario.github.io/nombre-repo/`.
6. Espera 1-2 minutos a que se publique, y prueba el link en tu navegador.

## Instalar en iPhone

1. Manda el link a tu amiga.
2. Ella lo abre en **Safari** (no funciona desde Chrome en iOS).
3. Toca el ícono de compartir (cuadrito con flecha hacia arriba).
4. Toca **"Agregar a pantalla de inicio"**.
5. Listo — el ícono queda en su pantalla de inicio y abre a pantalla completa, sin barra del navegador.

## Editar el horario

Todos los datos del horario viven en un solo bloque al inicio del `<script>` en `index.html`,
dentro del objeto `schedule`. Cada materia es un objeto con hora de inicio/fin (en formato 24h),
nombre, y `room` (aula) o `online: true` si es en línea.

## Notas y etiquetas

Al tocar cualquier clase en el calendario se abre una ficha donde se puede escribir una nota
y marcarla con una etiqueta de color:

- 🔵 Azul — tarea pendiente
- 🟣 Morado — problema con la materia
- 🟡 Dorado — clase libre / no segura si habrá clase

Las notas se guardan automáticamente en el almacenamiento local del navegador de su teléfono
(`localStorage`), por lo que **solo viven en ese dispositivo** — no se sincronizan a otro
teléfono ni a la nube. Si en algún momento borra los datos de navegación de Safari para ese
sitio, las notas se pierden. No es necesario tener internet para leerlas o escribirlas.
