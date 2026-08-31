-- Habilita Realtime (cambios en vivo vía websocket) para las tablas que
-- ya sincroniza el motor de sync desde Fase 2: materias, sus sesiones
-- recurrentes, y eventos personales. RLS sigue aplicando también a los
-- mensajes de Realtime, así que cada usuaria solo recibe sus propios
-- cambios.
alter publication supabase_realtime add table
  public.schedules,
  public.courses,
  public.class_sessions,
  public.events;
