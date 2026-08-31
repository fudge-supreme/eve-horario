// Edge Function programada (cron cada 5 min, ver migración 006) que
// manda los recordatorios push: clases que empiezan pronto, y tareas
// que vencen "mañana en la noche" u "hoy en la mañana".
//
// La dispara pg_cron, no una usuaria con sesión -- por eso corre con
// verify_jwt = false (ver supabase/config.toml) y en cambio exige un
// secreto compartido en el header x-cron-secret, para que no cualquiera
// en internet pueda dispararla a mano y mandar notificaciones falsas.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:soporte@mihorario.app';
const CRON_SECRET = Deno.env.get('CRON_SECRET');

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const WINDOW_MS = 5 * 60 * 1000; // debe coincidir con la frecuencia del cron

function nextOccurrence(dayOfWeek: number, startTime: string, from: Date): Date {
  const [h, m] = startTime.split(':').map(Number);
  const result = new Date(from);
  result.setHours(h, m, 0, 0);
  let diffDays = (dayOfWeek - result.getDay() + 7) % 7;
  if (diffDays === 0 && result.getTime() < from.getTime()) diffDays = 7;
  result.setDate(result.getDate() + diffDays);
  return result;
}

function parseHM(t: string | null): number | null {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// true si `when` cae dentro de las horas de silencio de la usuaria.
function inQuietHours(prefs: NotifPrefs | undefined, when: Date): boolean {
  const startMin = parseHM(prefs?.quiet_hours_start ?? null);
  const endMin = parseHM(prefs?.quiet_hours_end ?? null);
  if (startMin === null || endMin === null) return false;
  const minutes = when.getHours() * 60 + when.getMinutes();
  if (startMin <= endMin) return minutes >= startMin && minutes < endMin;
  return minutes >= startMin || minutes < endMin; // cruza medianoche
}

interface NotifPrefs {
  user_id: string;
  class_reminder_minutes: number;
  task_reminder_evening_before: boolean;
  task_reminder_morning_of: boolean;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

interface Match {
  user_id: string;
  title: string;
  body: string;
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('unauthorized', { status: 401 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date();
  const windowEnd = new Date(now.getTime() + WINDOW_MS);

  const { data: prefsRows } = await supabase.from('notification_prefs').select('*');
  const prefsByUser = new Map<string, NotifPrefs>((prefsRows ?? []).map((p: NotifPrefs) => [p.user_id, p]));

  const matches: Match[] = [];

  // --- Clases que empiezan pronto ---
  const { data: sessions } = await supabase
    .from('class_sessions')
    .select('user_id, day_of_week, start_time, courses(name)')
    .is('deleted_at', null);

  for (const s of sessions ?? []) {
    const prefs = prefsByUser.get(s.user_id);
    const reminderMin = prefs?.class_reminder_minutes ?? 15;
    const next = nextOccurrence(s.day_of_week, s.start_time, now);
    const reminderAt = new Date(next.getTime() - reminderMin * 60000);
    if (reminderAt >= now && reminderAt < windowEnd && !inQuietHours(prefs, reminderAt)) {
      const courseName = (s.courses as { name: string } | null)?.name ?? 'Tu clase';
      matches.push({ user_id: s.user_id, title: 'Clase pronto', body: `${courseName} empieza en ${reminderMin} min` });
    }
  }

  // --- Tareas: noche antes (20:00) o mañana del día (8:00) ---
  const { data: tasks } = await supabase
    .from('tasks')
    .select('user_id, title, due_at')
    .is('deleted_at', null)
    .eq('done', false)
    .not('due_at', 'is', null);

  for (const t of tasks ?? []) {
    const prefs = prefsByUser.get(t.user_id);
    const due = new Date(t.due_at as string);

    if (prefs?.task_reminder_evening_before !== false) {
      const eveningBefore = new Date(due);
      eveningBefore.setDate(eveningBefore.getDate() - 1);
      eveningBefore.setHours(20, 0, 0, 0);
      if (eveningBefore >= now && eveningBefore < windowEnd && !inQuietHours(prefs, eveningBefore)) {
        matches.push({ user_id: t.user_id, title: 'Tarea para mañana', body: t.title as string });
      }
    }
    if (prefs?.task_reminder_morning_of !== false) {
      const morningOf = new Date(due);
      morningOf.setHours(8, 0, 0, 0);
      if (morningOf >= now && morningOf < windowEnd && !inQuietHours(prefs, morningOf)) {
        matches.push({ user_id: t.user_id, title: 'Tarea para hoy', body: t.title as string });
      }
    }
  }

  // --- Enviar ---
  let sent = 0;
  let removed = 0;
  if (matches.length) {
    const userIds = [...new Set(matches.map((m) => m.user_id))];
    const { data: subs } = await supabase.from('push_subscriptions').select('*').in('user_id', userIds);

    for (const match of matches) {
      const userSubs = (subs ?? []).filter((s) => s.user_id === match.user_id);
      for (const sub of userSubs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify({ title: match.title, body: match.body, url: '/#/app' })
          );
          sent++;
        } catch (err) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
            removed++;
          } else {
            console.error('[dispatch-reminders] envío falló', sub.id, err);
          }
        }
      }
    }
  }

  return new Response(JSON.stringify({ matches: matches.length, sent, removed }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
