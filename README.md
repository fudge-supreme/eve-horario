# Mi Horario — pocket schedule PWA

## Publicar en GitHub Pages

1. Crea un repositorio nuevo en GitHub (puede ser público o privado con Pages habilitado).
2. Sube estos archivos manteniendo la estructura de carpetas tal cual:
   ```
   index.html
   manifest.json
   service-worker.js
   icons/icon-192.png
   icons/icon-512.png
   icons/apple-touch-icon.png
   ```
3. Ve a **Settings → Pages** del repositorio.
4. En "Source", selecciona la rama (`main`) y la carpeta raíz (`/`).
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
