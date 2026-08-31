-- class_sessions se quedó sin created_at en el schema original (el spec
-- no la pedía ahí), pero el repo genérico de Fase 2 (baseRepo.js) manda
-- created_at en cada create() igual que para el resto de las tablas
-- sincronizadas -- más simple mantener el patrón uniforme que hacer que
-- un repo sepa cuál tabla es la rara.
alter table public.class_sessions
  add column created_at timestamptz not null default now();
