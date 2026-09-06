// Flujo de activación de notificaciones push: pide permiso, obtiene la
// PushSubscription del navegador, y la sube a push_subscriptions. El
// modal de "¿quieres recordatorios?" vive como paso 5 del onboarding
// (src/screens/onboarding.js); para cuentas ya onboarded que nunca lo
// vieron, el camino es activar manual desde /ajustes/notificaciones.
import { supabase } from '../data/supabase.js';

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
