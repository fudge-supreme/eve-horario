# Changelog

Registro de qué cambió en cada fase de la migración de "Mi Horario" de PWA
local de un solo dispositivo a app multi-usuario con cuenta y sync, y por qué.

## Fase 0 — Setup (2026-08-23)

**Qué cambió:**
- Se agregó control de versiones (git) al proyecto, que antes se subía a
  GitHub a mano sin historial.
- Se agregó [Vite](https://vitejs.dev) como servidor de desarrollo y
  empaquetador de producción (`npm run dev` / `npm run build`).
- Los archivos estáticos (`manifest.json`, `service-worker.js`, íconos) se
  movieron a `public/` — convención que espera Vite. De paso se corrigió que
  la carpeta de íconos se llamaba `Icons/` (con mayúscula) mientras el código
  la referenciaba como `icons/`: en tu Mac no se nota porque el sistema de
  archivos no distingue mayúsculas, pero en GitHub Pages (que sí distingue)
  esto habría roto los íconos silenciosamente.
- Se agregó `supabase/` (CLI de Supabase, configuración local) como base
  para las fases de backend.
- Se agregaron las carpetas `src/data/`, `src/data/repositories/` y
  `src/themes/` vacías, como andamiaje para el código de las fases
  siguientes.

**Qué NO cambió:** ni una línea de la lógica de `index.html`. El grid
semanal, las notas con etiquetas, la lista de pendientes, el modo oscuro y
todo el polish (haptics, swipe, pull-to-refresh, parallax) funcionan
exactamente igual que antes — verificado corriendo la app bajo Vite y
comparando contra el comportamiento original.

**Datos de usuaria:** sin tocar. Esta fase no lee ni modifica
`localStorage` — eso ocurre hasta la Fase 0.5.

## Fase 0.5 — Limpieza de datos legacy (2026-08-23)

**Qué cambió:** al abrir la app por primera vez tras esta actualización,
se borra en silencio todo lo que había en el `localStorage` del navegador
que no pertenezca al nuevo sistema (horario, notas, etiquetas y pendientes
de la versión anterior). No hay pantalla ni aviso — es limpieza en segundo
plano, una sola vez, controlada por la key `legacy_cleaned_at`.

**Por qué:** la usuaria original confirmó que no necesita conservar esos
datos. No se guardó ningún respaldo — se autorizó explícitamente eliminarlos
sin backup.

**Qué significa esto para ti si ya usabas la app:** tu horario, notas y
pendientes actuales se van a resetear al horario por defecto la próxima vez
que abras la app actualizada. Si prefieres conservar algo de lo que tienes
ahorita, avísame antes de que se despliegue esta versión.

**Qué NO se tocó todavía:** el código que lee/escribe `localStorage`
directamente (`h-ev`, `h-tags`, `h-notes`, `h-todos`) sigue funcionando
igual que antes — por eso la app, después del reseteo, se ve y se comporta
exactamente igual, solo que con el horario por defecto. Ese código se
reemplaza hasta la Fase 2, cuando exista la capa de repositorios que lo
sustituye; borrarlo antes habría roto la app sin nada que lo reemplace.

## Fase 1 — Backend (2026-08-23)

**Qué cambió:** se escribió el esquema completo de Postgres
(`supabase/migrations/001_initial_schema.sql`): 10 tablas (perfiles,
horarios, materias, sesiones de clase, eventos, tareas, etiquetas, notas,
suscripciones push, preferencias de notificación), todas con RLS
habilitada — cada usuaria solo ve y modifica sus propios datos. Un trigger
crea automáticamente el perfil y las preferencias de notificación al
registrarse una cuenta nueva.

También se agregó `supabase/seed.sql` con una usuaria de prueba (horario
completo: 5 materias, tareas, un evento, notas y etiquetas) y una segunda
usuaria mínima, pensada específicamente para probar que RLS aísla los
datos entre cuentas.

**Decisión que tomé sin preguntar:** el spec original no le puso columna
`updated_at` a `profiles` ni a `notification_prefs`, pero sí pide un
trigger genérico que la mantenga al día "en cada UPDATE" — y Fase 3
describe `profiles.theme` como un dato que sincroniza. Le agregué
`updated_at` a esas dos tablas para que el patrón sea consistente en
todas partes; es un cambio de bajo riesgo, reversible con una migración
si prefieres quitarlo.

**Sin cambios en el frontend:** `index.html` sigue exactamente igual, la
PWA sigue funcionando 100% local — esta fase es puramente backend.

**Verificado en vivo** (Docker ya instalado): `supabase start` +
`supabase db reset` corrieron la migración y el seed sin errores. Primer
intento encontró un bug real — las versiones recientes del CLI de
Supabase ya no exponen tablas nuevas de `public` a la API por default (antes
sí lo hacían), así que aunque RLS estaba bien, nadie podía leer nada, ni
siquiera la dueña de sus propios datos. Se agregaron los `GRANT`
explícitos que faltaban. Después del fix, probado contra el stack real
vía la API REST con las dos usuarias del seed:
- cada quien ve exactamente sus propias filas (5 materias / 6 tareas para
  la usuaria 1, 1 materia / 0 tareas para la usuaria 2);
- la usuaria 2 no puede leer el horario de la usuaria 1 por ID directo
  (0 filas, no error — RLS lo oculta en vez de rechazarlo);
- la usuaria 2 no puede borrar una materia de la usuaria 1 (0 filas
  afectadas) — y se confirmó que la materia seguía intacta después;
- el trigger de auto-creación dejó `profiles.theme = 'coursicle-soft'`
  (el default nuevo) y `notification_prefs` con sus valores por default,
  sin que el seed los insertara a mano.

## Fase 2 — Auth + sync (2026-08-31)

**Qué cambió:** el `<script>` de 400 líneas que vivía dentro de
`index.html` se movió a módulos ES6 reales (`src/`). Arriba de eso se
construyó:

- **Auth completa**: `/landing`, `/signup`, `/login` (con modo magic
  link), `/recuperar`, `/nueva-contrasena`, `/ajustes/seguridad` (cambiar
  contraseña pidiendo la actual, cambiar correo, cerrar sesión) — todo
  con hash routing propio (`src/router.js`), sin librería.
- **Capa de datos offline-first**: IndexedDB vía `idb` (`src/data/db.js`)
  espejo de `schedules`/`courses`/`class_sessions`/`events`, con
  repositorios por entidad (`src/data/repositories/`) que exponen
  `.list()/.get()/.create()/.update()/.delete()` — la UI nunca toca
  IndexedDB o Supabase directo.
- **Motor de sync** (`src/data/sync.js`): push con debounce + backoff
  exponencial, pull al abrir/reconectar/cada 5 min, Realtime vía
  websocket, y merge last-write-wins por `updated_at`. Dot de estado en
  el header (`src/data/syncStatus.js`).
- **Decisión de alcance** (confirmada contigo antes de empezar): por
  ahora *solo* materias (`courses`+`class_sessions`) y eventos sueltos
  pasan por repos+sync. Notas, tags y pendientes se quedan en
  `localStorage` tal cual hasta Fase 4, que de todos modos reconstruye
  esa UI desde cero — migrarlos ahora habría sido trabajo desechable.

**Verificado en vivo, no solo escrito** — encontré y arreglé 5 bugs
reales probando de punta a punta contra el stack local:
1. `class_sessions` no tenía `created_at` pero el repo genérico se lo
   mandaba a todas las tablas por igual → se agregó la columna
   (migración 003) en vez de meter un caso especial en el repo.
2. Dos disparadores casi simultáneos del mismo login (el `navigate()`
   del formulario y el listener de `onAuthStateChange`) podían sembrar
   el horario por default dos veces en paralelo → la siembra ahora
   cachea su propia promesa.
3. Al cambiar de cuenta sin recargar la pestaña, la app no volvía a
   cargar los datos de la nueva usuaria (un flag de "ya inicialicé" que
   nunca se reseteaba) → se separó "atar los listeners del DOM" (una
   vez) de "cargar y renderizar datos" (cada vez que cambia la usuaria).
4. Re-autenticarse en Ajustes de Seguridad (para verificar la contraseña
   actual) disparaba el mismo evento que un login real, lo que
   re-renderizaba la pantalla a medio formulario y se comía el mensaje
   de éxito → el listener global ahora sólo reacciona cuando la
   identidad de la usuaria realmente cambia.
5. Los links de magic link / reset de contraseña redirigían al puerto
   3000 (el default de `supabase init`) en vez de a la app real →
   `supabase/config.toml` ahora incluye el puerto de Vite en la lista de
   redirects permitidos.

Con los fixes, probado end-to-end contra Mailpit (el capturador de
correo local) simulando abrir los links de verdad: signup, login,
magic link, reset de contraseña, cambio de contraseña con
re-autenticación, y cerrar sesión — todos correctos. También probé
Realtime cambiando una materia directo en la base de datos (simulando
"otro dispositivo") y confirmé que apareció sola en la pantalla ya
abierta, sin recargar — el escenario "editas materia, abres en laptop,
aparece" que pediste como criterio de esta fase.

**Sin verificar todavía:** el escenario con dos pestañas reales del
mismo navegador no prueba sync de verdad (comparten el mismo
IndexedDB/localStorage por origen) — por eso lo verifiqué simulando el
otro dispositivo directo en la base. Falta probarlo con un dispositivo
físico distinto de verdad.

**Pendiente, no bloqueante:** la imagen de vista previa de la landing
(`/landing-preview.png`) no existe todavía — se deja para Fase 6, que es
donde se pule esa pantalla.

## Fase 3 — Sistema de temas (2026-08-31)

**Cambio de alcance respecto al spec original, decidido en esta sesión:**
Editorial Rosé (el tema original de la app, con su propio claro/oscuro)
se **retiró por completo** — no quedó como cuarto tema legado, como decía
el plan original. Quedan 3 temas + automático:

- **Coursicle Soft** (default) — blanco, acento azul.
- **Liquid Glass** — fondo plateado degradado, superficies translúcidas
  con blur (con fallback a colores sólidos si el navegador no soporta
  `backdrop-filter`).
- **Obsidian AMOLED** — negro puro, acento morado con glow sutil en
  elementos activos.
- **Automático** — seguí `prefers-color-scheme`, alternando Coursicle
  Soft (claro) / Obsidian AMOLED (oscuro).

**Selector:** en vez de la pantalla `/ajustes/apariencia` con 4 tarjetas
de preview del plan original, el tema se cambia desde un menú
desplegable (ícono de 3 barritas en el header, patrón común en muchas
apps) — más simple, y accesible desde cualquier parte de la app sin
navegar a ajustes.

**El reto técnico real de esta fase:** el CSS del grid/tarjetas/chips
que ya existe usa nombres de variable específicos de la versión anterior
(`--terracotta`, `--glass`, `--glass-border`, `--ink2`, `--tag-blue`...
`--tag-terracotta`, `--card-blur`...), pero el spec de los temas nuevos
define un vocabulario mínimo distinto (`--accent`, `--ink-soft`,
`--surface-2`...). Cada uno de los 3 temas nuevos define AMBOS
conjuntos — el propio del spec, y alias de las variables viejas
mapeados a su paleta — así el grid, las tarjetas y las pantallas de auth
de las fases anteriores se ven bien bajo cualquier tema sin tocarles una
línea. Las variables puramente estructurales (tamaños de fila/columna,
curvas de animación) salieron de los archivos de tema porque no varían
por tema — viven en un `:root` compartido.

**Migración:** cualquier cuenta que abra la app sin el flag
`migrated_v2` arranca en Coursicle Soft (no hay Editorial Rosé que
preservar como opción, así que la migración es más simple que lo que
planteaba el spec original — no hace falta detectar un valor legacy
específico). El tema también sincroniza a `profiles.theme`: si lo
cambias en un dispositivo, el siguiente login en otro lo hereda.

**Bug real encontrado y corregido — no de esta fase, pero lo expuso**:
al probar con la usuaria semilla de Fase 1 (`prueba@mihorario.dev`) en el
mismo navegador donde antes había probado con otra cuenta, su horario
mostraba **materias de la otra cuenta**. La causa: los repos (Fase 2)
nunca filtraban las lecturas de IndexedDB por `user_id` — solo las
escrituras lo asignaban bien. Si dos cuentas distintas usan el mismo
navegador sin cerrar sesión explícitamente entre una y otra, sus datos
se mezclaban en pantalla. Se corrigió filtrando `list()`/`get()`/
`update()`/`delete()` por la usuaria autenticada actual en
`src/data/repositories/baseRepo.js` — ahora es imposible ver datos de
otra cuenta sin importar qué haya quedado guardado localmente.

**Verificado en vivo:** los 3 temas + automático aplican correctamente
(incluida la resolución de "automático" según preferencia del sistema
al cargar), sincronizan a `profiles.theme` en el servidor, y la
migración se probó aislada (sin sesión activa, para no confundirla con
el comportamiento correcto de "el remoto manda" una vez autenticado).

## Fase 4 — Layout tri-panel/tab-bar + módulos UX (2026-08-31)

**Qué cambió:** la fase más grande de la migración. La app pasó de una
sola columna (teléfono) a dos layouts reales según el ancho de pantalla,
con CSS puro (media queries + grid, sin librería):

- **Desktop (≥1024px):** tri-panel -- rail de navegación angosto,
  sidebar de Materias, columna central con el horario, panel de Tareas.
  Las tres columnas están visibles a la vez.
- **Mobile (<1024px):** tab bar inferior con 4 tabs (Hoy / Semana /
  Materias / Tareas), un panel visible a la vez.

**Capa de datos ampliada:** tareas, tags y notas se movieron de
`localStorage` a IndexedDB + Supabase (repos `taskRepo`, `tagRepo`,
`noteRepo`, sobre el mismo patrón de `baseRepo.js`) -- la promesa que
quedó pendiente desde Fase 2. Una migración de una sola vez
(`migrated_v4`) convierte cualquier `h-tags`/`h-notes`/`h-todos` que
haya quedado de la ventana Fase 2-3 en filas reales.

**Módulos nuevos:**
- Countdown a la próxima clase en la tarjeta "Hoy" (recalcula cada 30s,
  cambia de color cuando faltan ≤15 min).
- Vista Materias: galería de tarjetas con color, código, profesor,
  aula, y contador de tareas pendientes -- + hoja para agregar una
  materia nueva con horario recurrente (puede llevar varias sesiones).
- Course detail sheet enriquecido: horario recurrente resumido, aula,
  profesor, créditos, tareas pendientes de esa materia, notas
  recientes, selector de color, botón Archivar.
- Tracker de tareas: 4 cubetas (Hoy/Mañana/Esta semana/Después), badge
  del código de materia con su color, filtro por materia.
- Multi-horario: crear, renombrar, archivar y activar horarios --
  materias y sesiones quedan aisladas por horario; las tareas son
  globales a la cuenta (así lo define el schema de Fase 1, no por
  horario).
- Navegación semanal real: flechas ← →, con fechas de verdad (ya no
  "siempre la semana actual") y botón flotante "Hoy" que aparece solo
  cuando la semana visible no es la de hoy.
- Header del horario activo: nombre + suma de créditos + botones
  Evento/Exportar/Compartir.
- Exportar como PNG (`html2canvas`) o `.ics` (RRULE semanal para
  materias recurrentes, evento único para eventos sueltos).

**Arquitectura interna:** para evitar un ciclo de imports entre
`legacy-app.js` (que monta las vistas nuevas) y los módulos nuevos
(`src/app/materias.js`, `tasks.js`, `schedules.js`), el estado y la
carga de datos compartida se movieron a `src/app/state.js`, y los
helpers puros a `src/app/shared.js` -- ninguno de los módulos nuevos
importa de `legacy-app.js`; donde hacía falta que legacy-app.js
reaccionara a algo (ej. tocar una tarjeta de materia), se usa un
patrón de callback registrado una vez, no un import circular.

**2 bugs reales encontrados probando en el navegador:**
1. Los repos de Fase 2 no filtraban lecturas de IndexedDB por
   `user_id` -- al probar con una cuenta semilla en el mismo navegador
   donde antes había otra cuenta de prueba, su horario mostró materias
   ajenas. Corregido en `baseRepo.js` (ver nota de Fase 3 arriba, lo
   detecté ahí pero lo confirmo de nuevo aquí porque esta fase depende
   fuertemente de listas por usuaria).
2. La hoja de "Agregar materia" repintaba el formulario completo cada
   vez que se agregaba un horario recurrente, borrando nombre/código/
   profesor/aula ya escritos. Corregido para que agregar un horario
   solo actualice la lista de horarios, no todo el formulario.

**Verificado en vivo, con una cuenta nueva de principio a fin:**
signup → horario sembrado con 8 materias → abrir detalle de materia →
editar aula/profesor → agregar tarea con materia y fecha (llegó
correctamente a la cubeta "Hoy" con su badge de color) → marcar tarea
hecha → navegar semanas (adelante y con el botón "Hoy" de regreso) →
agregar materia nueva con 2 horarios (con el bug de arriba encontrado y
corregido) → exportar a `.ics` (contenido verificado: RRULE correcto,
horas convertidas bien a UTC) → exportar a PNG (no truena, genera un
canvas válido) → crear y activar un segundo horario (materias
correctamente aisladas entre horarios, tareas correctamente
compartidas) → probado también en viewport mobile completo (las 4
tabs, tab bar, todo funcionando).

**No verificado / pendiente:** compartir (`Compartir`) usa
`navigator.share` con fallback a portapapeles -- no lo probé a fondo
porque este entorno de pruebas no tiene esas APIs disponibles de forma
confiable. El screenshot del PNG exportado no se pudo inspeccionar
visualmente (este entorno de pruebas no permite recuperar archivos
descargados) -- el código corre sin errores y genera un canvas con
contenido, pero vale la pena que lo pruebes tú mismo con un click real
antes de darlo por bueno al 100%.

## Fase 5 — Notificaciones push (2026-08-31)

**Qué se construyó:**
- `npm run vapid` (`scripts/generate-vapid.js`) genera el par de llaves
  VAPID e imprime instrucciones exactas de dónde pegar cada una.
- Flujo de activación: modal "¿Quieres que te avisemos?" (una sola vez
  por cuenta, disparado tras el primer login -- el punto de enganche
  real para Fase 6, que es cuando exista onboarding de verdad) →
  `Notification.requestPermission()` → `PushSubscription` → upsert a
  `push_subscriptions`.
- `public/service-worker.js`: handlers `push` (muestra la notificación
  con el payload de la Edge Function) y `notificationclick` (enfoca una
  pestaña existente o abre una nueva, y le manda la URL de destino).
- `supabase/functions/dispatch-reminders/index.ts`: Deno + `web-push`.
  Revisa clases cuyo próximo horario menos `class_reminder_minutes` cae
  en los próximos 5 minutos, y tareas que vencen "mañana en la noche"
  (8pm del día anterior) o "hoy en la mañana" (8am), respetando
  `quiet_hours` de cada usuaria. Borra suscripciones que el proveedor
  push reporta como muertas (410/404).
- Cron cada 5 min vía `pg_cron` + `pg_net` (migración 006) -- la URL de
  la función y un secreto compartido (`CRON_SECRET`, que la función
  exige en el header `x-cron-secret` porque corre con
  `verify_jwt = false`) viven en Supabase Vault, no hardcodeados en la
  migración.
- `/ajustes/notificaciones`: activar/desactivar en este dispositivo,
  minutos de aviso antes de clase, toggles de recordatorio de tareas,
  horas de silencio.

**2 bugs reales encontrados y corregidos probando:**
1. `navigator.serviceWorker.ready` nunca resuelve si el Service Worker
   no llega a activarse -- en este entorno de pruebas nunca activa
   (limitación conocida del sandbox, arrastrada desde Fase 0), y sin
   límite de tiempo eso colgaba **todo** el flujo del modal de
   activación para siempre, en cualquier navegador donde el SW fallara
   por la razón que sea. Se le puso un timeout de 4s con fallback.
2. La key de localStorage "ya se preguntó por notificaciones" no debía
   marcarse cuando la razón es "sin soporte" -- en iOS, `PushManager`
   solo existe DESPUÉS de instalar la PWA. Con el bug, una usuaria que
   visita en Safari normal primero (sin soporte, se marca "ya
   preguntado") y luego instala la PWA (ya con soporte) nunca vería el
   modal. Corregido para reintentar en cada carga hasta que de verdad
   se le pregunte.

**Verificado en vivo:** la Edge Function corrida directamente contra el
stack local -- rechaza secretos incorrectos (401), corre limpio sin
coincidencias, y encuentra correctamente una clase de prueba armada
para caer justo en la ventana de 5 minutos (`matches:1`). Con una
suscripción falsa insertada a mano, confirmé que el intento de envío
sí se ejecuta y que un error (aunque no haya sido específicamente un
410) se loggea sin tronar la función. El modal de activación, el
manejo de permiso denegado, y la pantalla de preferencias (guardado
verificado en el servidor) se probaron de punta a punta en el
navegador.

**No verificado:** no pude confirmar la recepción real de una
notificación push -- este entorno de pruebas no tiene permisos de
notificación reales del sistema operativo (`Notification.permission`
está en `"denied"` de forma permanente aquí). Toda la plomería alrededor
de eso sí está probada (suscripción, upsert, consulta de la Edge
Function, intento de envío, manejo de errores) -- lo único que falta es
que tú lo pruebes en un dispositivo real con permisos de verdad.

**Gap encontrado, fuera de alcance de esta fase:** el Service Worker
solo precachea los archivos estáticos de `public/` -- no incluye los
bundles con hash que genera `vite build` (`assets/index-XXXX.js` etc.),
así que el "funciona sin internet desde el segundo uso" de la app
instalada no está completo todavía. No lo arreglé aquí porque es un
problema de caché de la app en general, no de notificaciones -- lo
dejo anotado para no perderlo de vista.

## Fase 6 — Onboarding, landing y documentación final (2026-08-31)

Última fase del plan original. Cierra los cabos que quedaban abiertos
desde fases anteriores.

**Qué se construyó:**
- `src/screens/onboarding.js`: flujo de 5 pasos para cuentas nuevas --
  nombre, crear el primer horario, primera materia (opcional, con
  "Después" para saltarla), elegir tema visual (grid con los 3 temas +
  Automático, aplica al tocar y muestra el borde de selección en vivo),
  y activar notificaciones. Al terminar marca `profiles.onboarded_at`.
  Este paso de tema reemplaza directamente al plan original de Fase 6
  (que hablaba de 4 tarjetas de preview): con Editorial Rosé fuera desde
  Fase 3, la grilla de onboarding usa el mismo set de temas que el menú
  de las 3 barritas.
- Guard en `src/main.js`: cualquier sesión sin `onboarded_at` se manda a
  `/onboarding` sin importar a qué ruta protegida intentaba entrar --
  así no hay que repetir el chequeo en cada pantalla nueva que se agregue
  después.
- Se retiró el disparador provisional del modal de notificaciones que
  vivía en `legacy-app.js` desde Fase 5 (el `setTimeout` tras el primer
  `/app`) -- el paso 5 del onboarding es ahora el punto de enganche real.
  De paso, `doEnsureSeedData()` en `src/app/state.js` dejó de sembrar un
  horario de ejemplo con materias inventadas: eso ahora lo decide la
  usuaria en el onboarding, y la función solo queda como red de
  seguridad para el caso raro de llegar a `/app` sin ningún horario.
- 4 plantillas de correo traducidas y con la marca de la app
  (`supabase/email-templates/*.md`: confirmación, magic link, reset de
  contraseña, cambio de correo) -- Supabase manda el default en inglés
  si no se pegan a mano en el Dashboard, así que cada archivo trae
  exactamente qué pegar y dónde.
- `.github/workflows/deploy.yml`: publica `dist/` a GitHub Pages solo con
  cada push a `main`, leyendo las llaves de Supabase/VAPID de los
  secrets del repo.
- Pase de consolidación en `README.md`: configurar un proyecto Supabase
  real de cero (migraciones, redirect URLs, plantillas de correo),
  activar el deploy automático, y la sección de VAPID/iOS de Fase 5
  quedan todas en un solo lugar en vez de repartidas.
- `CHECKLIST-VERIFICACION.md` nuevo: qué se probó en vivo en cada fase,
  en un solo documento (hasta ahora solo vivía repartido en este
  changelog).

**Bug real encontrado y corregido probando el onboarding en vivo:**
`paintHorario()` (paso 2) creaba un horario nuevo con
`scheduleRepo.create({ ..., is_active: true })` sin revisar si la cuenta
ya tenía uno. Si el onboarding se interrumpe después de ese paso --
recargar la pestaña, cerrar el navegador, o en iOS simplemente que
Safari mate la pestaña en segundo plano -- y la sesión vuelve a
`/onboarding`, el paso 2 se repite y crea un **segundo** horario, también
con `is_active: true`. Lo confirmé recreando el escenario a propósito:
terminé quedando con dos filas `is_active = true` para la misma cuenta
en `schedules`. El resto de la app sí respeta el invariante de "un solo
horario activo a la vez" (`src/app/schedules.js` desactiva los demás
antes de activar uno nuevo) -- el onboarding era el único lugar que no
lo seguía. Corregido en `src/screens/onboarding.js` para que el paso 2
primero busque si ya existe un horario (activo, o el primero de la
lista) y lo reuse en vez de crear otro.

**Verificado en vivo, de punta a punta:**
- Onboarding completo con una cuenta nueva (`fase6@ejemplo.dev`):
  nombre → horario → materia opcional (agregada, no solo saltada) →
  tema (Obsidian AMOLED aplicó al instante, con el borde de selección
  moviéndose a la tarjeta correcta y el resto de la tarjeta/botones
  re-pintándose en el tema nuevo) → notificaciones ("Activar
  recordatorios", que en este entorno de pruebas sin permisos reales del
  sistema igual completa el flujo sin trabarse). Terminó en `/app` con
  el horario, la materia y el tema correctos.
- Confirmado en la base de datos: `profiles.display_name`,
  `profiles.theme` y `profiles.onboarded_at` quedaron con los valores
  correctos; exactamente un horario activo con la materia adentro
  (después de corregir el bug de arriba).
- El guard: una cuenta sin `onboarded_at` que intenta ir a `/app`
  directo se manda a `/onboarding`; una cuenta ya onboardeada
  (`fase6@ejemplo.dev` después de terminar, y la semilla
  `prueba@mihorario.dev`) entra directo a `/app` sin rebotar al
  onboarding, incluso con recarga completa de la pestaña (no solo
  navegación dentro de la SPA).
- `public/landing-preview.png` sigue sin existir (pendiente desde Fase
  2) -- en vez de dejarlo mostrando el ícono de imagen rota en una
  pantalla pública, se le agregó un `onerror` que oculta el hueco.
  Verificado visualmente en modo móvil: la landing se ve limpia sin la
  imagen. La foto real queda como el único paso manual pendiente (ver
  README) -- no se pudo generar un archivo `.png` de verdad desde este
  entorno de pruebas.
- `npm run build` limpio después de todos los cambios de esta fase (89
  módulos, sin errores).

**No verificado:** el flujo completo de instalación en iPhone real
(PWA instalada, notificación real recibida) sigue arrastrando la misma
limitación que Fase 5 -- este entorno de pruebas no tiene permisos de
notificación reales del sistema operativo. Tampoco se probó el deploy
real a GitHub Pages ni un proyecto Supabase de producción de verdad
(ambos requieren una cuenta de GitHub/Supabase real, fuera del alcance
de este entorno) -- los pasos en el README están escritos y revisados,
pero no ejecutados contra la infraestructura real.

## Repaso final — cerrando pendientes de Fase 4 (2026-09-01)

Con las 6 fases ya entregadas, aproveché para cerrar los dos pendientes
que Fase 4 había dejado explícitamente sin verificar ("Compartir" y el
PNG exportado) usando una técnica que no tenía disponible en su momento:
interceptar `URL.createObjectURL` antes de disparar la exportación real
desde la UI, para capturar el blob generado y verlo de verdad en vez de
solo confirmar que el código corre sin errores.

**Bug real encontrado y corregido -- exportar a PNG salía cortado:**
`exportGridAsPNG()` le pasaba a `html2canvas` el elemento `#calGrid`
completo, pero ese elemento vive dentro de `.cal-wrap`, que tiene
`overflow-x:auto` (es el contenedor que scrollea horizontalmente para
ver el resto de la semana) -- sin decirle a html2canvas el tamaño real
del contenido, capturaba nada más los ~2 días que cabían en la caja
visible en ese momento, silenciosamente, sin ningún error. Verifiqué
esto capturando el blob real: la imagen mostraba Lunes completo y
Martes cortado a la mitad, nada más.

El primer intento de arreglo (pasarle `width`/`height` = el ancho/alto
real del contenido) generó una imagen peor: los encabezados de columna
usan `position:sticky` para quedarse fijos arriba al hacer scroll, y
html2canvas los renderiza mal cuando el área de captura es más grande
que el viewport real -- todos los días quedaron apilados en la esquina
superior izquierda y el resto del canvas salió en blanco. La solución
que sí funcionó: quitarle el recorte a `.cal-wrap` y el `position:sticky`
a los encabezados un instante (solo mientras se genera la captura),
capturar, y regresar ambos a su estado original en un `finally` --
confirmado que no deja rastro en la UI después de exportar. Con eso, la
imagen exportada muestra las 7 columnas completas (Lunes a Domingo) con
todas las materias, colores y el evento suelto que tenía la cuenta de
prueba.

**"Compartir" -- verificado, con una limitación esperada del entorno:**
este navegador de pruebas no tiene `navigator.share` (no es un
dispositivo móvil real), así que el clic real al botón sí ejerce la
rama de respaldo (`navigator.clipboard.writeText`) -- confirmé que
intenta escribir al portapapeles y, cuando el navegador deniega el
permiso (`NotAllowedError`, esperado en este sandbox sin gesto de
usuario "de verdad" a nivel sistema operativo), cae correctamente en el
mensaje `"No se pudo compartir"` en vez de tronar. El código y su manejo
de errores están correctos; lo único que no se pudo confirmar aquí es
la hoja nativa de compartir de iOS/Android o una escritura real al
portapapeles -- misma categoría de límite que las notificaciones push
de Fase 5 (permisos reales del sistema operativo, no disponibles en
este entorno).

**Verificado en vivo:** `npm run build` limpio después del fix; la
imagen exportada inspeccionada visualmente byte por byte (no solo "se
generó un canvas") confirma las 7 columnas, los colores por materia, y
el evento "Junta de equipo" fuera del horario de clases. Los estilos
inline que el fix toca temporalmente (`overflow` de `.cal-wrap`,
`position` de cada `.col-head`) se confirmaron restaurados a su estado
original después de exportar.
