// Estado global de sync, observable. La UI (el dot del header) se
// suscribe en vez de tener que preguntar activamente.
let status = navigator.onLine ? 'synced' : 'offline';
const listeners = new Set();

export function getSyncStatus() {
  return status;
}

export function setSyncStatus(next) {
  if (next === status) return;
  status = next;
  listeners.forEach((fn) => fn(status));
}

export function onSyncStatusChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

window.addEventListener('online', () => setSyncStatus('syncing'));
window.addEventListener('offline', () => setSyncStatus('offline'));
