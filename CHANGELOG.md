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
