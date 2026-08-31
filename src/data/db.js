import { openDB } from 'idb';

// Espejo local de las tablas de Postgres que sincronizan: materias, sus
// sesiones recurrentes, eventos personales (Fase 2), y tareas/tags/notas
// (Fase 4 -- antes vivían en localStorage).
//
// Cada fila local tiene además un campo `synced_at` (no existe en
// Postgres) que el motor de sync usa para saber qué le falta subir:
// `synced_at === null` significa "cambio local sin confirmar en el
// servidor todavía".
const DB_NAME = 'mi-horario';
const DB_VERSION = 2;

const STORES = {
  schedules: ['user_id', 'updated_at'],
  courses: ['user_id', 'updated_at', 'schedule_id'],
  class_sessions: ['user_id', 'updated_at', 'course_id'],
  events: ['user_id', 'updated_at', 'schedule_id'],
  tasks: ['user_id', 'updated_at', 'course_id'],
  tags: ['user_id', 'updated_at'],
  notes: ['user_id', 'updated_at', 'course_id'],
};

let dbPromise = null;

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // contains() en vez de comparar versiones: así da igual si
        // alguien llega desde v1 o crea la base desde cero directo en v2.
        for (const [name, indexes] of Object.entries(STORES)) {
          if (db.objectStoreNames.contains(name)) continue;
          const store = db.createObjectStore(name, { keyPath: 'id' });
          for (const idx of indexes) store.createIndex(idx, idx);
        }
      },
    });
  }
  return dbPromise;
}

export const TABLE_NAMES = Object.keys(STORES);
