-- Datos de ejemplo para desarrollo local. Se cargan automáticamente con
-- `supabase db reset` (corre las migraciones y este archivo después).
-- SOLO para local — nunca correr esto contra un proyecto en producción.

-- ============================================================
-- USUARIA DE PRUEBA PRINCIPAL
-- Login: prueba@mihorario.dev / Prueba123!
-- ============================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, recovery_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated',
  'prueba@mihorario.dev',
  crypt('Prueba123!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Estudiante de Prueba"}',
  now(), now(),
  '', '', '', ''
);

-- provider_id/identity_data siguen el formato que espera GoTrue (el
-- servicio de auth de Supabase) para que el login por password funcione
-- igual que si se hubiera registrado desde la app. Si `supabase db reset`
-- truena aquí, es probable que la versión local de GoTrue haya cambiado
-- las columnas de auth.identities — revisa con `\d auth.identities` en
-- Studio y ajusta esta sección.
insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '11111111-1111-1111-1111-111111111111',
  jsonb_build_object('sub', '11111111-1111-1111-1111-111111111111', 'email', 'prueba@mihorario.dev'),
  'email',
  '11111111-1111-1111-1111-111111111111',
  now(), now(), now()
);

-- El trigger on_auth_user_created ya creó profiles + notification_prefs;
-- solo falta marcarla como onboarded para que en Fase 6 no la mande al
-- flujo de onboarding.
update public.profiles set onboarded_at = now()
  where id = '11111111-1111-1111-1111-111111111111';

-- --- Horario activo ---
insert into public.schedules (id, user_id, name, is_active) values
  ('a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Otoño 2026', true);

-- --- Materias (5, colores distintos de la paleta coursicle-soft) ---
insert into public.courses (id, schedule_id, user_id, name, code, professor, room, color, credits) values
  ('c1111111-0000-0000-0000-000000000001', 'a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Tipografía 1', 'TIP101', 'Mtra. Ana López', 'T-205', '#B8D4F1', 6),
  ('c1111111-0000-0000-0000-000000000002', 'a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Diseño Integrador 1', 'DIS210', 'Mtro. Carlos Ruiz', 'S-201', '#A8D8B9', 8),
  ('c1111111-0000-0000-0000-000000000003', 'a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Geometría', 'GEO110', 'Mtra. Diana Pérez', 'S-203', '#F4C6A5', 4),
  ('c1111111-0000-0000-0000-000000000004', 'a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Procesos de Representación Bidimensional 1', 'PRB120', 'Mtro. Luis Vega', 'TI-6', '#F5B5B5', 6),
  ('c1111111-0000-0000-0000-000000000005', 'a1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Recursos Tecnológicos para el Diseño', 'RTD130', 'Mtra. Sofía Ibarra', null, '#D4B8E8', 4);

-- --- Horario recurrente semanal (day_of_week: 0=domingo ... 6=sábado) ---
insert into public.class_sessions (course_id, user_id, day_of_week, start_time, end_time) values
  ('c1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 1, '15:00', '17:00'),
  ('c1111111-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 3, '15:00', '17:00'),
  ('c1111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 1, '17:00', '20:00'),
  ('c1111111-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 3, '17:00', '19:00'),
  ('c1111111-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 5, '14:00', '16:00'),
  ('c1111111-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 2, '14:00', '16:00'),
  ('c1111111-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 4, '18:00', '20:00');

-- --- Etiquetas ---
insert into public.tags (id, user_id, name, color) values
  ('7a000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Tarea pendiente', '#7C93A8'),
  ('7a000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Problema', '#96738F'),
  ('7a000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Clase libre', '#C7A34C');

-- --- Tareas, con fechas relativas a "ahora" para que Hoy/Mañana/Esta
-- semana/Después siempre tengan al menos un elemento sin importar cuándo
-- se corra este seed ---
insert into public.tasks (user_id, course_id, title, task_type, due_at, done) values
  ('11111111-1111-1111-1111-111111111111', 'c1111111-0000-0000-0000-000000000001', 'Entrega de bocetos tipográficos', 'tarea', date_trunc('day', now()) + interval '20 hours', false),
  ('11111111-1111-1111-1111-111111111111', null, 'Leer capítulo 3 de teoría del color', 'lectura', date_trunc('day', now()) + interval '1 day 10 hours', false),
  ('11111111-1111-1111-1111-111111111111', 'c1111111-0000-0000-0000-000000000002', 'Maqueta final Diseño Integrador', 'proyecto', date_trunc('day', now()) + interval '4 days 23 hours 59 minutes', false),
  ('11111111-1111-1111-1111-111111111111', 'c1111111-0000-0000-0000-000000000003', 'Investigar referentes para geometría descriptiva', 'tarea', date_trunc('day', now()) + interval '10 days 12 hours', false),
  ('11111111-1111-1111-1111-111111111111', null, 'Comprar materiales para clase de dibujo', null, null, false),
  ('11111111-1111-1111-1111-111111111111', null, 'Inscripción a materias del semestre', 'trámite', date_trunc('day', now()) - interval '3 days', true);

-- --- Evento personal suelto ---
insert into public.events (user_id, schedule_id, title, location, color, starts_at, ends_at, recurrence, notes) values
  ('11111111-1111-1111-1111-111111111111', 'a1111111-0000-0000-0000-000000000001', 'Junta de equipo — proyecto final', 'Café Zócalo', '#F5E1A8', date_trunc('day', now()) + interval '2 days 17 hours', date_trunc('day', now()) + interval '2 days 18 hours 30 minutes', 'once', 'Llevar laptop y bocetos');

-- --- Nota de sesión ---
-- date_trunc('week', ...) en Postgres ya regresa el lunes de esta semana
-- (Tipografía 1 tiene clase lunes y miércoles).
insert into public.notes (user_id, course_id, session_date, body, tag_id) values
  ('11111111-1111-1111-1111-111111111111', 'c1111111-0000-0000-0000-000000000001', date_trunc('week', now())::date, 'Repasar interletraje antes del examen', '7a000000-0000-0000-0000-000000000001');

-- ============================================================
-- SEGUNDA USUARIA — solo para verificar que RLS aísla datos entre
-- cuentas (una no debe poder leer ni modificar nada de la otra).
-- Login: otra@mihorario.dev / Prueba123!
-- ============================================================

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, recovery_sent_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated',
  'otra@mihorario.dev',
  crypt('Prueba123!', gen_salt('bf')),
  now(), now(), now(),
  '{"provider":"email","providers":["email"]}',
  '{"display_name":"Otra Estudiante"}',
  now(), now(),
  '', '', '', ''
);

insert into auth.identities (
  id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
) values (
  gen_random_uuid(),
  '22222222-2222-2222-2222-222222222222',
  jsonb_build_object('sub', '22222222-2222-2222-2222-222222222222', 'email', 'otra@mihorario.dev'),
  'email',
  '22222222-2222-2222-2222-222222222222',
  now(), now(), now()
);

update public.profiles set onboarded_at = now()
  where id = '22222222-2222-2222-2222-222222222222';

insert into public.schedules (id, user_id, name, is_active) values
  ('a2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Semestre de la otra usuaria', true);

insert into public.courses (schedule_id, user_id, name, code, color) values
  ('a2222222-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Materia de la otra usuaria', 'OTR100', '#F5B5B5');
