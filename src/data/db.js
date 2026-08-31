import { openDB } from 'idb';

// Espejo local de las tablas de Postgres que ya sincronizan (Fase 2):
// materias, sus sesiones recurrentes, y eventos personales. Notas, tags
// y pendientes siguen en localStorage hasta Fase 4.
//
// Cada fila local tiene además un campo `synced_at` (no existe en
// Postgres) que el motor de sync usa para saber qué le falta subir:
// `synced_at === null` significa "cambio local sin confirmar en el
// servidor todavía".
const DB_NAME = 'mi-horario';
const DB_VERSION = 1;

const STORES = {
  schedules: ['user_id', 'updated_at'],
  courses: ['user_id', 'updated_at', 'schedule_id'],
  class_sessions: ['user_id', 'updated_at', 'course_id'],
  events: ['user_id', 'updated_at', 'schedule_id'],
};

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        for (const [name, indexes] of Object.entries(STORES)) {
          const store = db.createObjectStore(name, { keyPath: 'id' });
          for (const idx of indexes) store.createIndex(idx, idx);
        }
      },
    });
  }
  return dbPromise;
}

export const TABLE_NAMES = Object.keys(STORES);
