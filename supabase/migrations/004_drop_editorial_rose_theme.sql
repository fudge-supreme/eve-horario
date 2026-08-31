-- Editorial Rosé se retiró por completo en Fase 3 (decisión del usuario,
-- reemplaza lo que decía el spec original de mantenerlo como legado).
-- Ningún perfil real llegó a tener ese valor -- la app nunca lo ofreció
-- como opción -- así que no hace falta migrar filas, solo angostar el
-- check constraint a los temas que de verdad existen.
alter table public.profiles drop constraint profiles_theme_check;

alter table public.profiles add constraint profiles_theme_check
  check (theme in ('coursicle-soft', 'liquid-glass', 'obsidian-amoled', 'auto'));
