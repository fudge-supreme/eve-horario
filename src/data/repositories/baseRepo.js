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
    if (!userId) throw new Error(`No hay sesión activa para usar ${table}`);
    return userId;
  }

  // IndexedDB es una sola base por origen: si en este navegador ya
  // inició sesión otra cuenta antes (sin cerrar sesión explícitamente,
  // ej. dos personas probando en la misma compu), sus filas pueden
  // seguir ahí. Filtrar SIEMPRE por user_id evita que se mezclen datos
  // de una cuenta con los de otra -- no basta con confiar en que el
  // logout limpia todo.
  return {
    async list() {
      const db = await getDB();
      const userId = await currentUserId();
      const all = await db.getAll(table);
      return all
        .filter((row) => row.user_id === userId && !row.deleted_at)
        .sort((a, b) => a.created_at?.localeCompare(b.created_at ?? '') ?? 0);
    },

    async get(id) {
      const db = await getDB();
      const userId = await currentUserId();
      const row = await db.get(table, id);
      return row && row.user_id === userId ? row : undefined;
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
      const userId = await currentUserId();
      const existing = await db.get(table, id);
      if (!existing || existing.user_id !== userId) throw new Error(`${table}: no existe la fila ${id}`);
      const row = { ...existing, ...patch, id, updated_at: new Date().toISOString(), synced_at: null };
      await db.put(table, row);
      schedulePush();
      return row;
    },

    async delete(id) {
      const db = await getDB();
      const userId = await currentUserId();
      const existing = await db.get(table, id);
      if (!existing || existing.user_id !== userId) return;
      const row = { ...existing, deleted_at: new Date().toISOString(), updated_at: new Date().toISOString(), synced_at: null };
      await db.put(table, row);
      schedulePush();
    },
  };
}
