-- Mismo caso que class_sessions (003) y tags (005): notes tampoco
-- tenía created_at, pero el repo genérico (baseRepo.js) se lo manda a
-- las 8 tablas que sincroniza por igual. A esta se le había pasado por
-- alto -- el push de una nota nueva fallaba en silencio (reintentaba
-- con backoff sin avisar en la UI, la escritura local sí se veía bien)
-- hasta que se probó de verdad el botón rápido de "agregar nota".
alter table public.notes
  add column created_at timestamptz not null default now();
