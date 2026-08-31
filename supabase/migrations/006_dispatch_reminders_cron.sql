-- Cron cada 5 minutos que llama a la Edge Function dispatch-reminders
-- (Fase 5). La URL y el secreto compartido viven en Vault, no
-- hardcodeados aquí, para no versionar secretos ni la URL de
-- producción en una migración.
--
-- IMPORTANTE al desplegar a producción: actualiza el secreto
-- 'dispatch_reminders_url' a la URL real de tu proyecto, y
-- 'cron_secret' al mismo valor que pusiste con
-- `supabase secrets set CRON_SECRET=...` -- si no, el cron sigue
-- apuntando a 127.0.0.1 y nunca va a disparar nada en producción.
-- Instrucciones exactas en el README.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select vault.create_secret(
  'http://127.0.0.1:54321/functions/v1/dispatch-reminders',
  'dispatch_reminders_url',
  'URL de la Edge Function dispatch-reminders. Cambiar al desplegar a producción.'
);

select vault.create_secret(
  'placeholder-cambia-esto-para-que-coincida-con-CRON_SECRET',
  'cron_secret',
  'Debe coincidir exactamente con el secreto CRON_SECRET de la Edge Function.'
);

select cron.schedule(
  'dispatch-reminders-every-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'dispatch_reminders_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
