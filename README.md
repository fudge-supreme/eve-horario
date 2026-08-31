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

### Notificaciones push (VAPID)

```bash
npm run vapid     # genera un par de llaves VAPID nuevo, con instrucciones
```

El script imprime exactamente qué pegar en `.env` (la llave pública) y qué
correr para subir la privada como secreto de Supabase. Para desarrollo
local, además de `.env` necesitas `supabase/.env` (copia
`supabase/.env.example`) con las mismas llaves más `CRON_SECRET` (una
cadena larga al azar — protege la Edge Function de que cualquiera en
internet la dispare a mano). Ninguno de los dos `.env` se sube al repo.

Después de llenar `supabase/.env`, reinicia el stack para que la Edge
Function los recoja:

```bash
supabase stop && supabase start
```

**Para producción** (proyecto Supabase real, no local):

```bash
supabase secrets set VAPID_PUBLIC_KEY=...
supabase secrets set VAPID_PRIVATE_KEY=...
supabase secrets set VAPID_SUBJECT=mailto:tu-correo@ejemplo.com
supabase secrets set CRON_SECRET=...
supabase functions deploy dispatch-reminders
```

El cron que dispara `dispatch-reminders` cada 5 minutos vive en la
migración `006_dispatch_reminders_cron.sql`, guardado en Supabase Vault
(no hardcodeado). Apunta por default al stack **local**
(`http://127.0.0.1:54321/...`) — al desplegar a producción, actualiza
esos dos valores de Vault a la URL real de tu proyecto y al mismo
`CRON_SECRET` de arriba:

```sql
select vault.update_secret(
  (select id from vault.secrets where name = 'dispatch_reminders_url'),
  'https://TU-PROYECTO.supabase.co/functions/v1/dispatch-reminders'
);
select vault.update_secret(
  (select id from vault.secrets where name = 'cron_secret'),
  'EL-MISMO-CRON_SECRET-QUE-PUSISTE-CON-SUPABASE-SECRETS-SET'
);
```

**Notificaciones en iPhone:** iOS solo permite notificaciones push a
sitios que están **instalados como PWA** (agregados a pantalla de
inicio, ver más abajo) y requiere **iOS 16.4 o más nuevo**. El permiso
no se puede pedir desde una pestaña normal de Safari — la app detecta
esto sola y no muestra el modal de activación hasta que se abre desde
el ícono instalado.

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

## Editar el horario, materias, notas y tareas

Ya no se edita código para esto — todo se hace desde la app: crear cuenta,
agregar materias (con su horario recurrente) desde la vista Materias,
tocar cualquier clase para anotarle una nota o etiqueta, y agregar tareas
desde el panel de Tareas. Todo sincroniza entre dispositivos con la misma
cuenta (ver `CHANGELOG.md` para el detalle de cómo se construyó cada
parte).
