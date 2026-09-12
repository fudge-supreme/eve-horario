# Mi Horario — pocket schedule PWA

## Estado del proyecto

App multi-usuario completa: cuenta con correo/contraseña o magic link,
sync entre dispositivos (offline-first, con IndexedDB de respaldo),
notificaciones push reales, y 3 temas visuales (más "Automático", que
sigue el modo claro/oscuro del sistema). Ver `CHANGELOG.md` para el
detalle de cómo se construyó cada fase, y `CHECKLIST-VERIFICACION.md`
para la lista de qué se probó en vivo en cada una.

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

La primera vez, aplica las migraciones y los datos de prueba:

```bash
supabase db reset   # crea las tablas (supabase/migrations) y siembra
                     # una cuenta de prueba (supabase/seed.sql)
```

Cuenta de prueba sembrada por `seed.sql`: `prueba@mihorario.dev` /
`Prueba123!` — ya tiene `onboarded_at` puesto, así que entra
directo a `/app` en vez de pasar por el onboarding.

### Poner Mi Horario en producción (proyecto Supabase real)

1. Crea el proyecto en [supabase.com](https://supabase.com/dashboard).
2. Enlázalo y sube el esquema: `supabase link --project-ref TU-REF` y
   luego `supabase db push` (aplica `supabase/migrations/*.sql`; **no**
   corras `seed.sql` en producción, es solo para desarrollo local).
3. **Authentication → URL Configuration**: pon el dominio real en
   *Site URL* y agrégalo a *Redirect URLs* (equivalente a `site_url` /
   `additional_redirect_urls` en `supabase/config.toml`, que solo aplica
   al stack local).
4. **Authentication → Email Templates**: pega el asunto y el HTML de
   cada plantilla en `supabase/email-templates/*.md` (confirmación,
   magic link, reset de contraseña, cambio de correo) — Supabase manda
   el default en inglés si no se reemplazan.
5. Copia `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` del proyecto
   (Settings → API) a tu `.env` local y a los *secrets* del repo de
   GitHub si vas a usar el deploy automático (ver abajo).
6. Sigue la sección de VAPID de abajo para las notificaciones push.

**Límite de correo del servicio compartido de Supabase:** un proyecto
nuevo manda confirmaciones/magic links/resets con el mailer compartido
de Supabase por default, que tiene un límite bajo a propósito (un
puñado por hora, para evitar spam) -- confirmarlo tú mismo un par de
veces de seguido ya lo satura, y el error que da
(`over_email_send_rate_limit`) la app lo muestra genérico como "revisa
tu conexión". No es un bug, se resetea solo en un rato. Si vas a probar
signup varias veces seguidas (o esperas que varias personas se
registren el mismo día), configura un proveedor SMTP propio
(Authentication → Emails → SMTP Settings -- Resend, SendGrid y Postmark
tienen plan gratis) para que ese límite deje de aplicar.

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

El repo ya trae `.github/workflows/deploy.yml`: cada push a `main`
construye la app y la publica sola. Para activarlo:

1. Sube el repo a GitHub (público o privado, da igual para Pages).
2. **Settings → Secrets and variables → Actions** y agrega
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y
   `VITE_VAPID_PUBLIC_KEY` con los valores de tu proyecto Supabase en
   producción (los mismos que pusiste en tu `.env` local).
3. **Settings → Pages** → en *Source* elige **GitHub Actions** (no
   "Deploy from a branch").
4. Haz push a `main` (o corre el workflow a mano desde la pestaña
   **Actions** → *Publicar en GitHub Pages* → *Run workflow*).
5. Espera 1-2 minutos. GitHub Pages te da un link tipo
   `https://tuusuario.github.io/nombre-repo/` — el `base: './'` de
   `vite.config.js` hace que funcione en cualquier subruta sin tocar
   nada.
6. Con el sitio publicado, vuelve al paso 3 de "Poner Mi Horario en
   producción" de arriba y agrega ese link real a *Redirect URLs* en
   Supabase — si no, los correos de confirmación/magic link/reset
   redirigen a `localhost` y no funcionan fuera de tu máquina.

## Foto de la landing (`/landing-preview.png`)

La pantalla `/landing` (lo primero que ve alguien sin cuenta) espera una
imagen en `public/landing-preview.png` — una tarjeta angosta (se muestra
a 260px de ancho, con esquinas redondeadas ya puestas por CSS, así que
cualquier captura vertical de teléfono se ve bien). Si el archivo no
existe, la app lo detecta sola y oculta el hueco en vez de mostrar un
ícono roto — no truena nada — pero **conviene poner la foto real antes
de compartir el link**: abre la app en modo móvil, entra con una cuenta
con datos (o usa `prueba@mihorario.dev` / `Prueba123!`), ve a la pestaña
Hoy o Semana, toma una captura, y guárdala como
`public/landing-preview.png`.

## Instalar en iPhone

1. Manda el link a tu amiga.
2. Ella lo abre en **Safari** (no funciona desde Chrome en iOS).
3. Toca el ícono de compartir (cuadrito con flecha hacia arriba).
4. Toca **"Agregar a pantalla de inicio"**.
5. Listo — el ícono queda en su pantalla de inicio y abre a pantalla completa, sin barra del navegador.

## Usar la app

Todo se hace desde la app, sin tocar código. Una cuenta nueva pasa por un
onboarding de 5 pasos (nombre, primer horario, primera materia opcional,
tema visual, notificaciones) antes de llegar a la vista principal. De ahí
en adelante: agregar materias (con su horario recurrente) desde la vista
Materias, tocar cualquier clase para anotarle una nota o etiqueta, agregar
tareas desde el panel de Tareas, y cambiar de tema desde el menú de las 3
barritas en la esquina superior. Todo sincroniza entre dispositivos con la
misma cuenta (ver `CHANGELOG.md` para el detalle de cómo se construyó cada
parte).
