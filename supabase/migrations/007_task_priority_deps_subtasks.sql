-- Prioridad y dependencias simples entre tareas, más subtareas
-- ordenables. Pedido explícito: 3 niveles de prioridad (alta/media/
-- baja), no poder marcar una tarea hecha si depende de otra sin
-- terminar, y subtareas con orden propio arrastrable.

alter table public.tasks
  add column priority text check (priority in ('high', 'medium', 'low')),
  -- uuid[] en vez de una tabla de unión: el pedido fue "simples pero
  -- útiles" -- alcanza para bloquear el done y no hace falta una tabla
  -- aparte solo para pares (tarea, de la que depende).
  add column depends_on uuid[] not null default '{}';

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index idx_subtasks_user_id on public.subtasks(user_id);
create index idx_subtasks_task_id on public.subtasks(task_id);
create index idx_subtasks_updated_at on public.subtasks(updated_at);

alter table public.subtasks enable row level security;

create policy "subtasks: solo las propias" on public.subtasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create trigger set_updated_at before update on public.subtasks
  for each row execute function public.set_updated_at();

-- Mismo problema de Fase 1: RLS no basta, Postgres también exige el
-- GRANT de tabla base. alter default privileges de la migración 001
-- debería cubrir tablas nuevas creadas por el mismo rol, pero se deja
-- explícito aquí también -- es barato y evita repetir ese bug.
grant select, insert, update, delete on public.subtasks to authenticated;
grant all on public.subtasks to service_role;

alter publication supabase_realtime add table public.subtasks;
