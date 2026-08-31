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
