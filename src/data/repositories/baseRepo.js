import { getDB } from '../db.js';
import { supabase } from '../supabase.js';
import { schedulePush } from '../sync.js';

// Fábrica compartida: la UI nunca toca IndexedDB o Supabase directo,
// siempre pasa por un repo (uno por entidad, ver courseRepo.js etc.).
// Todas las escrituras son locales e inmediatas (offline-first); el
// motor de sync (sync.js) se encarga de subirlas después.
export function createRepo(table) {
  async function currentUserId() {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) throw new Error(`No hay sesión activa para escribir en ${table}`);
    return userId;
  }

  return {
    async list() {
      const db = await getDB();
      const all = await db.getAll(table);
      return all.filter((row) => !row.deleted_at).sort((a, b) => a.created_at?.localeCompare(b.created_at ?? '') ?? 0);
    },

    async get(id) {
      const db = await getDB();
      return db.get(table, id);
    },

    async create(data) {
      const db = await getDB();
      const now = new Date().toISOString();
      const row = {
        ...data,
        id: crypto.randomUUID(),
        user_id: await currentUserId(),
        created_at: now,
        updated_at: now,
        deleted_at: null,
        synced_at: null,
      };
      await db.put(table, row);
      schedulePush();
      return row;
    },

    async update(id, patch) {
      const db = await getDB();
      const existing = await db.get(table, id);
      if (!existing) throw new Error(`${table}: no existe la fila ${id}`);
      const row = { ...existing, ...patch, id, updated_at: new Date().toISOString(), synced_at: null };
      await db.put(table, row);
      schedulePush();
      return row;
    },

    async delete(id) {
      const db = await getDB();
      const existing = await db.get(table, id);
      if (!existing) return;
      const row = { ...existing, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), synced_at: null };
      await db.put(table, row);
      schedulePush();
    },
  };
}
