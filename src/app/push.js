// Flujo de activación de notificaciones push: pide permiso, obtiene la
// PushSubscription del navegador, y la sube a push_subscriptions.
import { supabase } from '../data/supabase.js';
import { haptic, H, openSheet, closeSheet, toast } from './shared.js';

// navigator.serviceWorker.ready nunca resuelve si el Service Worker no
// llega a activarse (pasa en algunos navegadores/entornos restringidos,
// lo until probando esta misma fase) -- sin un tope, eso colgaría para
// siempre cualquier cosa que dependa de esto, incluido el modal de
// activación completo.
function serviceWorkerReady(timeoutMs = 4000) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('service worker no respondió a tiempo')), timeoutMs)),
  ]);
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function pushPermission() {
  return pushSupported() ? Notification.permission : 'unsupported';
}

export async function isSubscribed() {
  if (!pushSupported()) return false;
  try {
    const reg = await serviceWorkerReady();
    const sub = await reg.pushManager.getSubscription();
    return !!sub;
  } catch (err) {
    console.error('[push] no se pudo consultar el service worker', err);
    return false;
  }
}

// Devuelve { ok: true } o { ok: false, reason: 'unsupported'|'denied'|'error' }.
export async function activatePush() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return { ok: false, reason: 'denied' };

  try {
    const publicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    const reg = await serviceWorkerReady();
    let subscription = await reg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return { ok: false, reason: 'error' };

    const json = subscription.toJSON();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        device_label: navigator.userAgent.slice(0, 120),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );
    if (error) throw error;
    return { ok: true };
  } catch (err) {
    console.error('[push] no se pudo activar', err);
    return { ok: false, reason: 'error' };
  }
}

export async function deactivatePush() {
  if (!pushSupported()) return;
  try {
    const reg = await serviceWorkerReady();
    const subscription = await reg.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint);
  } catch (err) {
    console.error('[push] no se pudo desactivar', err);
  }
}

// Modal de "¿quieres recordatorios?", una sola vez por cuenta (hasta
// que exista onboarding real en Fase 6, este es el disparador: la
// primera vez que /app carga después de iniciar sesión). iOS solo deja
// pedir el permiso si la PWA ya está instalada -- si no, ni lo
// intentamos, para no gastar el único permiso que Safari deja pedir.
//
// La key de "ya se preguntó" va por user_id, no plana -- si no, en un
// navegador compartido por varias cuentas, que UNA la descarte haría
// que ninguna otra la vuelva a ver jamás (el mismo tipo de bug de
// mezclar datos entre cuentas que ya encontré en Fase 3-4).
export async function maybeShowPushPrompt() {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return;
  const promptedKey = `push_prompted_${userId}`;

  if (localStorage.getItem(promptedKey) === 'true') return;
  // Si no hay soporte (ej. Safari de iOS antes de instalar la PWA), NO
  // se marca como "ya preguntado" -- en iOS, PushManager/Notification
  // recién aparecen después de agregarla a pantalla de inicio, así que
  // hay que poder volver a intentar en la próxima carga.
  if (!pushSupported()) return;
  if (await isSubscribed()) { localStorage.setItem(promptedKey, 'true'); return; }

  const sheet = document.getElementById('sheet');
  sheet.innerHTML = `
    <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
    <label>Recordatorios</label>
    <p style="font-family:'Fraunces',serif;font-style:italic;font-size:20px;font-weight:500;margin-bottom:10px">¿Quieres que te avisemos?</p>
    <p style="font-size:13px;color:var(--ink2);line-height:1.5;margin-bottom:16px">
      Mi Horario te puede mandar una notificación antes de que empiece tu próxima clase, y para recordarte tus tareas la noche anterior y la mañana en que vencen. Puedes cambiar esto cuando quieras desde Ajustes.
    </p>
    <div class="sheet-actions">
      <button class="btn-danger" id="pushLater">Ahora no</button>
      <button class="btn-primary" id="pushActivate">Activar recordatorios</button>
    </div>`;
  document.getElementById('sc').onclick = () => { localStorage.setItem(promptedKey, 'true'); closeSheet(); };
  document.getElementById('pushLater').onclick = () => { localStorage.setItem(promptedKey, 'true'); haptic(H.tap); closeSheet(); };
  document.getElementById('pushActivate').onclick = async () => {
    haptic(H.tap);
    const result = await activatePush();
    localStorage.setItem(promptedKey, 'true');
    closeSheet();
    if (result.ok) toast('Recordatorios activados');
    else if (result.reason === 'denied') toast('Permiso denegado -- puedes activarlo luego desde Ajustes');
    else toast('No se pudo activar en este dispositivo');
  };
  openSheet();
}
