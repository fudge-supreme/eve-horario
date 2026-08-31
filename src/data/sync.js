import { getDB, TABLE_NAMES } from './db.js';
import { supabase } from './supabase.js';
import { setSyncStatus } from './syncStatus.js';

// Motor de sync bidireccional, offline-first, last-write-wins por
// updated_at. La UI nunca llama esto directo — los repos disparan
// schedulePush() solos tras cada mutación.
//
// Nota sobre LWW: el trigger set_updated_at de Postgres pisa el
// updated_at que mande el cliente en cada UPDATE con la hora del
// servidor al momento del push (no la hora original de la edición). En
// la práctica esto da "gana el último PUSH exitoso", no "gana la última
// edición real" -- si dos dispositivos editan la misma fila estando uno
// offline, el que reconecta y sube después gana, sin importar cuál
// edición fue más vieja en el reloj de cada aparato. Para el uso normal
// de esta app (una persona, pocos dispositivos, ediciones poco
// frecuentes de la misma fila) es una simplificación razonable.
const LAST_PULL_KEY = 'sync_last_pull_at';
const PENDING_KEY = 'pending_writes';
const INITIAL_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 5 * 60 * 1000;
const PERIODIC_PULL_MS = 5 * 60 * 1000;
const PUSH_DEBOUNCE_MS = 300;

let pushDebounceTimer = null;
let pushRetryTimer = null;
let pushBackoffMs = INITIAL_BACKOFF_MS;
let realtimeChannels = [];
let periodicPullTimer = null;

function markPending() {
  localStorage.setItem(PENDING_KEY, '1');
}
function clearPending() {
  localStorage.removeItem(PENDING_KEY);
}
function hasPending() {
  return localStorage.getItem(PENDING_KEY) === '1';
}

// Agrupa mutaciones seguidas (ej. cada tecla de un input) en un solo
// push, y evita agendar dos veces si ya hay uno en camino.
export function schedulePush() {
  markPending();
  if (pushDebounceTimer || pushRetryTimer) return;
  pushDebounceTimer = setTimeout(() => {
    pushDebounceTimer = null;
    push();
  }, PUSH_DEBOUNCE_MS);
}

export async function push() {
  if (!navigator.onLine) {
    setSyncStatus('offline');
    return;
  }
  setSyncStatus('syncing');
  try {
    const db = await getDB();
    for (const table of TABLE_NAMES) {
      const all = await db.getAll(table);
      const dirty = all.filter((row) => row.synced_at === null);
      if (!dirty.length) continue;
      // synced_at es un campo solo-local: Postgres no lo conoce.
      const rows = dirty.map(({ synced_at, ...rest }) => rest);
      const { error } = await supabase.from(table).upsert(rows);
      if (error) throw error;
      const confirmedAt = new Date().toISOString();
      const tx = db.transaction(table, 'readwrite');
      await Promise.all(dirty.map((row) => tx.store.put({ ...row, synced_at: confirmedAt })));
      await tx.done;
    }
    pushBackoffMs = INITIAL_BACKOFF_MS;
    clearPending();
    setSyncStatus('synced');
  } catch (err) {
    console.error('[sync] push falló, reintentando con backoff', err);
    setSyncStatus('error');
    pushRetryTimer = setTimeout(() => {
      pushRetryTimer = null;
      push();
    }, pushBackoffMs);
    pushBackoffMs = Math.min(pushBackoffMs * 2, MAX_BACKOFF_MS);
  }
}

async function mergeRow(store, remote) {
  const local = await store.get(remote.id);
  if (!local || local.synced_at !== null) {
    await store.put({ ...remote, synced_at: remote.updated_at });
    return;
  }
  // local.synced_at === null: hay una edición local sin subir todavía.
  if (new Date(remote.updated_at) > new Date(local.updated_at)) {
    await store.put({ ...remote, synced_at: remote.updated_at });
  }
  // si no, el local es más nuevo: se deja igual, push() ya la va a subir.
}

export async function pull() {
  if (!navigator.onLine) {
    setSyncStatus('offline');
    return;
  }
  setSyncStatus('syncing');
  try {
    const lastPullAt = localStorage.getItem(LAST_PULL_KEY) || '1970-01-01T00:00:00.000Z';
    const pullStartedAt = new Date().toISOString();
    const db = await getDB();
    for (const table of TABLE_NAMES) {
      const { data, error } = await supabase.from(table).select('*').gt('updated_at', lastPullAt);
      if (error) throw error;
      if (!data.length) continue;
      const tx = db.transaction(table, 'readwrite');
      for (const remote of data) await mergeRow(tx.store, remote);
      await tx.done;
      window.dispatchEvent(new CustomEvent('sync:data-changed', { detail: { table } }));
    }
    localStorage.setItem(LAST_PULL_KEY, pullStartedAt);
    if (hasPending()) {
      push();
    } else {
      setSyncStatus('synced');
    }
  } catch (err) {
    console.error('[sync] pull falló', err);
    setSyncStatus('error');
  }
}

export async function clearLocalData() {
  stopSync();
  const db = await getDB();
  await Promise.all(TABLE_NAMES.map((table) => db.clear(table)));
  localStorage.removeItem(LAST_PULL_KEY);
  localStorage.removeItem(PENDING_KEY);
}

function subscribeRealtime(userId) {
  for (const table of TABLE_NAMES) {
    const channel = supabase
      .channel(`realtime:${table}:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `user_id=eq.${userId}` },
        async (payload) => {
          if (payload.eventType === 'DELETE') return; // usamos soft-delete; no debería llegar un DELETE real
          const db = await getDB();
          const tx = db.transaction(table, 'readwrite');
          await mergeRow(tx.store, payload.new);
          await tx.done;
          window.dispatchEvent(new CustomEvent('sync:data-changed', { detail: { table } }));
        }
      )
      .subscribe();
    realtimeChannels.push(channel);
  }
}

function unsubscribeRealtime() {
  realtimeChannels.forEach((channel) => supabase.removeChannel(channel));
  realtimeChannels = [];
}

function handleReconnect() {
  pull();
}

// Se llama una vez al iniciar sesión (o al arrancar con sesión ya
// activa), DESPUÉS de esperar un primer pull() manual -- así la app
// nunca decide "no hay nada, hay que sembrar datos por defecto" antes
// de saber si el servidor ya tenía algo. Deja Realtime + el pull
// periódico de respaldo corriendo de ahí en adelante.
export function startSync(userId) {
  subscribeRealtime(userId);
  window.addEventListener('online', handleReconnect);
  periodicPullTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) pull();
  }, PERIODIC_PULL_MS);
}

export function stopSync() {
  unsubscribeRealtime();
  window.removeEventListener('online', handleReconnect);
  if (periodicPullTimer) clearInterval(periodicPullTimer);
  if (pushRetryTimer) clearTimeout(pushRetryTimer);
  if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
  periodicPullTimer = null;
  pushRetryTimer = null;
  pushDebounceTimer = null;
}
