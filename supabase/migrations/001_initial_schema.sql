-- Esquema inicial de "Mi Horario" multi-usuario.
-- Convención: day_of_week usa el mismo índice que JS Date.getDay() y
-- Postgres EXTRACT(DOW FROM ...): 0 = domingo ... 6 = sábado.
-- Todas las tablas de datos de usuaria tienen RLS: cada quien solo ve
-- y modifica sus propias filas (auth.uid() = user_id, o = id en profiles).

create extension if not exists pgcrypto;

-- ============================================================
-- FUNCIONES DE SOPORTE
-- ============================================================

-- Mantiene updated_at al día en cada UPDATE, sin depender de que el
-- cliente lo mande bien (así el motor de sync puede confiar en esta
-- columna para last-write-wins).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- PROFILES
-- ============================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  theme text not null default 'coursicle-soft'
    check (theme in ('coursicle-soft','liquid-glass','obsidian-amoled','editorial-rose','auto')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles: solo la propia" on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create trigger set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ============================================================
-- SCHEDULES
-- ============================================================

create table public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_schedules_user_id on public.schedules(user_id);
create index idx_schedules_updated_at on public.schedules(updated_at);

alter table public.schedules enable row level security;

create policy "schedules: solo las propias" on public.schedules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger set_updated_at before update on public.schedules
  for each row execute function public.set_updated_at();

-- ============================================================
-- COURSES (materias)
-- ============================================================

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.schedules(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  code text,
  professor text,
  room text,
  color text not null default '#B8D4F1' check (color ~* '^#[0-9a-f]{6}$'),
  credits integer check (credits is null or credits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_courses_user_id on public.courses(user_id);
create index idx_courses_schedule_id on public.courses(schedule_id);
create index idx_courses_updated_at on public.courses(updated_at);

alter table public.courses enable row level security;

create policy "courses: solo las propias" on public.courses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger set_updated_at before update on public.courses
  for each row execute function public.set_updated_at();

-- ============================================================
-- CLASS_SESSIONS (horario recurrente semanal de cada materia)
-- ============================================================

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null check (end_time > start_time),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_class_sessions_user_id on public.class_sessions(user_id);
create index idx_class_sessions_course_id on public.class_sessions(course_id);
create index idx_class_sessions_updated_at on public.class_sessions(updated_at);

alter table public.class_sessions enable row level security;

create policy "class_sessions: solo las propias" on public.class_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger set_updated_at before update on public.class_sessions
  for each row execute function public.set_updated_at();

-- ============================================================
-- EVENTS (eventos personales sueltos, no ligados a una materia)
-- ============================================================

create table public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  schedule_id uuid references public.schedules(id) on delete set null,
  title text not null,
  location text,
  color text not null default '#B8D4F1' check (color ~* '^#[0-9a-f]{6}$'),
  starts_at timestamptz not null,
  ends_at timestamptz not null check (ends_at > starts_at),
  recurrence text check (recurrence in ('once','weekly')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_events_user_id on public.events(user_id);
create index idx_events_schedule_id on public.events(schedule_id);
create index idx_events_updated_at on public.events(updated_at);

alter table public.events enable row level security;

create policy "events: solo los propios" on public.events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

-- ============================================================
-- TASKS (tareas / pendientes)
-- ============================================================

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid references public.courses(id) on delete set null,
  title text not null,
  task_type text,
  due_at timestamptz,
  notes text,
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_tasks_user_id on public.tasks(user_id);
create index idx_tasks_course_id on public.tasks(course_id);
create index idx_tasks_updated_at on public.tasks(updated_at);

alter table public.tasks enable row level security;

create policy "tasks: solo las propias" on public.tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger set_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();

-- ============================================================
-- TAGS (etiquetas de color para notas)
-- ============================================================

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#7C93A8' check (color ~* '^#[0-9a-f]{6}$'),
  updated_at timestamptz not null default now()
);

create index idx_tags_user_id on public.tags(user_id);

alter table public.tags enable row level security;

create policy "tags: solo las propias" on public.tags
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger set_updated_at before update on public.tags
  for each row execute function public.set_updated_at();

-- ============================================================
-- NOTES (notas por sesión de clase)
-- ============================================================

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  session_date date not null,
  body text,
  tag_id uuid references public.tags(id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_notes_user_id on public.notes(user_id);
create index idx_notes_course_id on public.notes(course_id);
create index idx_notes_updated_at on public.notes(updated_at);

alter table public.notes enable row level security;

create policy "notes: solo las propias" on public.notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger set_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

-- ============================================================
-- PUSH_SUBSCRIPTIONS
-- ============================================================

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  device_label text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index idx_push_subscriptions_user_id on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions: solo las propias" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- NOTIFICATION_PREFS
-- ============================================================

create table public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  class_reminder_minutes integer not null default 15 check (class_reminder_minutes >= 0),
  task_reminder_evening_before boolean not null default true,
  task_reminder_morning_of boolean not null default true,
  quiet_hours_start time,
  quiet_hours_end time,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;

create policy "notification_prefs: solo las propias" on public.notification_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger set_updated_at before update on public.notification_prefs
  for each row execute function public.set_updated_at();

-- ============================================================
-- AUTO-CREACIÓN DE PROFILE + NOTIFICATION_PREFS AL REGISTRARSE
-- ============================================================

-- display_name llega opcionalmente en options.data.display_name del
-- supabase.auth.signUp() del frontend (Fase 2).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');

  insert into public.notification_prefs (user_id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- PRIVILEGIOS DE API
-- ============================================================
-- RLS por sí sola no basta: Postgres también exige el GRANT de tabla de
-- base para que un rol pueda tocarla, y las versiones recientes de
-- Supabase ya NO exponen tablas nuevas del schema public a la API por
-- default (antes sí). Sin esto, ni siquiera la dueña de una fila puede
-- leerla, aunque su política de RLS esté perfecta.
-- `anon` no recibe nada a propósito: todo aquí requiere sesión iniciada.
-- `service_role` la usa la Edge Function de recordatorios (Fase 5) para
-- leer entre usuarias saltándose RLS.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;
