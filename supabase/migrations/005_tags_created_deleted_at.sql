-- Mismo caso que class_sessions en la migración 003: tags no tenía
-- created_at ni deleted_at, pero el repo genérico (baseRepo.js) asume
-- ese patrón uniforme en las 7 tablas que sincroniza. Se agregan las
-- columnas en vez de meter un caso especial en el repo.
alter table public.tags
  add column created_at timestamptz not null default now(),
  add column deleted_at timestamptz;

-- Habilita Realtime para las 3 tablas que Fase 4 agrega al motor de
-- sync (tareas, tags, notas).
alter publication supabase_realtime add table
  public.tasks,
  public.tags,
  public.notes;
