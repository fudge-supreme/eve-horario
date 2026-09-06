# Checklist de verificación por fase

Qué se probó en vivo (no solo se escribió) en cada fase de la migración,
y qué quedó pendiente de probar contra infraestructura real. El detalle
completo de cada punto, con el bug real que expuso cuando aplica, está
en `CHANGELOG.md` -- esto es el resumen en forma de checklist.

## Fase 0 — Setup
- [x] App corre igual bajo Vite que la versión original de un solo archivo.
- [x] Grid semanal, notas, pendientes, modo oscuro y polish (haptics,
      swipe, pull-to-refresh) sin regresiones.
- [x] `npm audit` en 0 vulnerabilidades tras actualizar Vite.

## Fase 0.5 — Limpieza de datos legacy
- [x] `localStorage` legacy se borra una sola vez, controlado por
      `legacy_cleaned_at`.

## Fase 1 — Backend (Postgres + RLS)
- [x] `supabase db reset` corre migración + seed sin errores.
- [x] Cada usuaria ve exactamente sus propias filas (probado con 2
      cuentas seed vía API REST con sus JWT reales).
- [x] Una cuenta no puede leer ni borrar datos de otra (RLS oculta, no
      solo rechaza).
- [x] Trigger de auto-creación de perfil deja los defaults correctos
      sin que el seed los inserte a mano.
- [ ] No probado contra un proyecto Supabase cloud real, solo local.

## Fase 2 — Auth + sync
- [x] Signup, login, magic link, reset de contraseña, cambio de
      contraseña con re-autenticación, cerrar sesión -- todo end-to-end
      contra Mailpit (correo real capturado y sus links abiertos).
- [x] Realtime: cambio hecho directo en la base aparece solo en la
      pantalla ya abierta, sin recargar.
- [ ] No probado con dos dispositivos físicos distintos de verdad (se
      simuló "otro dispositivo" escribiendo directo en la base, porque
      dos pestañas del mismo navegador comparten IndexedDB/localStorage
      por origen y no prueban sync real).

## Fase 3 — Sistema de temas
- [x] Los 3 temas + Automático aplican correctamente, incluida la
      resolución de "automático" según `prefers-color-scheme` al cargar.
- [x] El tema elegido sincroniza a `profiles.theme` y se hereda al
      iniciar sesión en otro dispositivo.
- [x] Migración de cuentas sin `migrated_v2` probada aislada (sin sesión
      activa).
- [x] Bug de fuga de datos entre cuentas en el mismo navegador
      (encontrado probando esta fase, corregido en `baseRepo.js`).

## Fase 4 — Layout tri-panel/tab-bar + módulos UX
- [x] Cuenta nueva de punta a punta: horario sembrado, editar materia,
      agregar tarea (llega a la cubeta correcta con su color), marcar
      hecha, navegar semanas, agregar materia con 2 horarios
      recurrentes, exportar `.ics` (RRULE verificado a mano), exportar
      PNG (canvas se genera sin errores), crear/activar un segundo
      horario (materias aisladas, tareas compartidas).
- [x] Viewport mobile completo: las 4 tabs y la tab bar funcionando.
- [x] Botón "Compartir": con `navigator.share` ausente en este entorno,
      el clic real ejerce la rama de respaldo (`clipboard.writeText`),
      que falla con `NotAllowedError` (esperado, sin permisos reales de
      SO) y cae correctamente en el toast de error -- código y manejo
      de errores verificados. La hoja nativa de compartir y una
      escritura real al portapapeles quedan pendientes de un
      dispositivo real.
- [x] PNG exportado inspeccionado visualmente de verdad (interceptando
      el blob antes de la descarga) -- expuso un bug real: salía
      cortado a ~2 días de 7 por el `overflow-x:auto` de `.cal-wrap`.
      Corregido y reverificado -- ahora exporta las 7 columnas
      completas. Detalle en `CHANGELOG.md`, sección "Repaso final".

## Fase 5 — Notificaciones push
- [x] Edge Function corrida contra el stack local: rechaza secretos
      incorrectos, encuentra correctamente una clase de prueba armada
      para caer en la ventana de 5 minutos, intenta el envío y loggea
      errores sin tronar.
- [x] Modal de activación, permiso denegado, y pantalla de preferencias
      (guardado verificado en el servidor) probados de punta a punta.
- [x] Timeout de 4s en `serviceWorkerReady()` evita que el flujo se
      cuelgue si el Service Worker no activa.
- [ ] No se pudo confirmar la recepción real de una notificación --
      este entorno no tiene permisos de notificación reales del sistema
      operativo (`Notification.permission` en `"denied"` permanente).
      Falta probar en un dispositivo real.
- [ ] Cache offline de los bundles de `vite build` (con hash) sigue sin
      estar en el Service Worker -- gap conocido, no bloqueante.

## Fase 6 — Onboarding, landing y documentación
- [x] Onboarding de 5 pasos completo con cuenta nueva: nombre → horario
      → materia opcional agregada → tema (aplica al instante, borde de
      selección correcto) → notificaciones → termina en `/app`.
- [x] `profiles.onboarded_at` / `display_name` / `theme` correctos en
      la base al terminar.
- [x] Guard funciona en ambas direcciones: cuenta sin onboarding se
      manda a `/onboarding` aunque pida `/app` directo; cuenta ya
      onboardeada entra directo a `/app` sin rebotar, incluso con
      recarga completa de la pestaña.
- [x] Bug de horario duplicado si el onboarding se interrumpe a medias
      (encontrado recreando el escenario a propósito, corregido en
      `onboarding.js`).
- [x] Fallback de `landing-preview.png` faltante: no muestra ícono
      roto, verificado visualmente en modo móvil.
- [x] `npm run build` limpio.
- [ ] Deploy real a GitHub Pages y proyecto Supabase de producción no
      ejecutados contra infraestructura real (requieren cuentas
      GitHub/Supabase reales, fuera de este entorno) -- los pasos están
      escritos y revisados en el README, no probados de punta a punta.
- [ ] Instalación real en iPhone (PWA + notificación real recibida)
      sigue pendiente de un dispositivo físico.
- [ ] Foto real para `public/landing-preview.png` -- paso manual descrito
      en el README, no se pudo generar un archivo `.png` desde este
      entorno.

## Lo que queda para probar tú, con infraestructura real

Todo lo marcado `[ ]` arriba comparte la misma causa: este entorno de
desarrollo no tiene acceso a un dispositivo iOS físico, permisos de
notificación reales del sistema, ni credenciales de GitHub/Supabase de
producción. La plomería alrededor de cada uno (subida de datos, la
lógica que decide qué mandar, el manejo de errores) sí está probada
contra el stack real -- lo que falta es la última milla que solo se
puede confirmar con las cuentas y dispositivos reales de tu amiga.
