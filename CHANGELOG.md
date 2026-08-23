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

**Pendiente — no verificado en vivo:** esta máquina todavía no tiene
Docker instalado, así que no se pudo correr `supabase db reset` para
confirmar que la migración corre limpia, que el seed carga, ni que RLS
aísla de verdad a las dos usuarias de prueba. El SQL está escrito y
revisado a mano con cuidado, pero **"escrito" no es lo mismo que
"verificado"** — en cuanto Docker esté listo se corre y se confirma antes
de dar esta fase por cerrada de verdad.
