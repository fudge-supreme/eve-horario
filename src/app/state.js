// Estado y carga de datos compartida entre el grid (legacy-app.js) y
// los módulos de UI nuevos (materias.js, tasks.js, schedules.js). Vive
// aparte para que ninguno de esos módulos tenga que importar de
// legacy-app.js -- así se evita una dependencia circular (legacy-app.js
// sí importa de ellos, para montar sus vistas).
import { scheduleRepo } from '../data/repositories/scheduleRepo.js';
import { courseRepo } from '../data/repositories/courseRepo.js';
import { classSessionRepo } from '../data/repositories/classSessionRepo.js';
import { eventRepo } from '../data/repositories/eventRepo.js';
import { taskRepo } from '../data/repositories/taskRepo.js';
import { tagRepo } from '../data/repositories/tagRepo.js';
import { noteRepo } from '../data/repositories/noteRepo.js';

export const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DS = { Lunes: 'Lun', Martes: 'Mar', Miércoles: 'Mié', Jueves: 'Jue', Viernes: 'Vie', Sábado: 'Sáb', Domingo: 'Dom' };
const JSD = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const today = JSD[new Date().getDay()] || '';
export const DAY_TO_NUM = { Domingo: 0, Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5, Sábado: 6 };
export const NUM_TO_DAY = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const COURSE_COLORS = ['#B8D4F1', '#A8D8B9', '#F4C6A5', '#F5B5B5', '#D4B8E8', '#F5E1A8', '#C5E1D4'];
export const TAG_COLOR_PALETTE = ['#7C93A8', '#96738F', '#C7A34C', '#7BA87C', '#C4726C', '#E8C4B8', '#B87355'];

function parseTimeHour(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h + (m || 0) / 60;
}

/* ======== SEMANA VISIBLE ======== */
export let weekOffset = 0;
export function setWeekOffset(n) { weekOffset = n; }
export function mondayOfWeek(offsetWeeks) {
  const jsToday = new Date().getDay();
  const mondayBasedToday = jsToday === 0 ? 6 : jsToday - 1;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - mondayBasedToday + offsetWeeks * 7);
  return d;
}
export function dateForDayInVisibleWeek(dayName, hour = 0) {
  const dayIdx = DAYS.indexOf(dayName);
  const d = mondayOfWeek(weekOffset);
  d.setDate(d.getDate() + dayIdx);
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return d;
}
export function isCurrentWeek() { return weekOffset === 0; }
export function weekLabelText() {
  const monday = mondayOfWeek(weekOffset);
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  const fmt = (d) => `${DS[DAYS[(d.getDay() + 6) % 7]]} ${d.getDate()}/${d.getMonth() + 1}`;
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

/* ======== DATOS ======== */
let ev = {};
let activeSchedule = null;
let allSchedules = [];
let allCourses = [];
let allTasks = [];
let allTags = [];
let allNotes = [];

export function getState() {
  return { ev, activeSchedule, allSchedules, allCourses, allTasks, allTags, allNotes, weekOffset };
}

// El onboarding (Fase 6) ya crea el primer horario de cada cuenta nueva
// como paso explícito -- esto es solo una red de seguridad para el caso
// raro de llegar aquí sin ninguno (ej. se saltó el onboarding por algún
// bug, o es una cuenta vieja de antes de que existiera). Ya no siembra
// materias de ejemplo: eso ahora lo decide la usuaria en el onboarding.
//
// Se cachea la promesa para que, sin importar cuántas veces se llame
// refreshEv() casi al mismo tiempo, la creación de respaldo corra una
// sola vez.
let ensureSeedPromise = null;
export function resetSeedCache() { ensureSeedPromise = null; }
function ensureSeedData() {
  if (!ensureSeedPromise) ensureSeedPromise = doEnsureSeedData();
  return ensureSeedPromise;
}
async function doEnsureSeedData() {
  const schedules = await scheduleRepo.list();
  const existing = schedules.find((s) => s.is_active) || schedules[0];
  if (existing) return existing;
  return scheduleRepo.create({ name: 'Mi horario', is_active: true });
}

export async function refreshEv() {
  activeSchedule = await ensureSeedData();
  allSchedules = await scheduleRepo.list();
  allCourses = await courseRepo.listBySchedule(activeSchedule.id);
  const courseById = new Map(allCourses.map((c) => [c.id, c]));
  const sessions = await classSessionRepo.listByCourses(allCourses.map((c) => c.id));
  const events = await eventRepo.listBySchedule(activeSchedule.id);
  allTasks = await taskRepo.list();
  allTags = await tagRepo.list();
  allNotes = await noteRepo.list();

  const next = {};
  for (const s of sessions) {
    const course = courseById.get(s.course_id);
    if (!course) continue;
    const day = NUM_TO_DAY[s.day_of_week];
    next[s.id] = {
      name: course.name, day,
      start: parseTimeHour(s.start_time), end: parseTimeHour(s.end_time),
      room: course.room || '', online: !course.room, fixed: true, color: course.color,
      _courseId: course.id, _sessionId: s.id,
      date: dateForDayInVisibleWeek(day, 0).toISOString().slice(0, 10),
    };
  }
  for (const e of events) {
    const s = new Date(e.starts_at);
    const en = new Date(e.ends_at);
    const day = NUM_TO_DAY[s.getDay()];
    next[e.id] = {
      name: e.title, day,
      start: s.getHours() + s.getMinutes() / 60, end: en.getHours() + en.getMinutes() / 60,
      room: e.location || '', online: !e.location, fixed: false, color: e.color,
      _eventId: e.id, _eventNotes: e.notes || '',
      date: s.toISOString().slice(0, 10),
    };
  }
  ev = next;
  return getState();
}

// Migra a las tablas reales lo que haya quedado en localStorage de la
// ventana Fase 2-3 (donde tags/notas/pendientes todavía vivían ahí). Un
// usuario nuevo de verdad nunca tiene estas keys -- Fase 0.5 ya las
// borró -- así que esto solo importa para cuentas que ya usaron la app
// durante ese periodo.
export async function migrateLocalStorageEntitiesIfNeeded() {
  if (localStorage.getItem('migrated_v4') === 'true') return;
  try {
    const oldTags = JSON.parse(localStorage.getItem('h-tags') || 'null');
    const oldNotes = JSON.parse(localStorage.getItem('h-notes') || 'null');
    const oldTodos = JSON.parse(localStorage.getItem('h-todos') || 'null');

    const tagIdMap = {};
    if (Array.isArray(oldTags)) {
      for (const t of oldTags) {
        const created = await tagRepo.create({ name: t.label, color: TAG_COLOR_PALETTE[0] });
        tagIdMap[t.id] = created.id;
      }
    }
    if (Array.isArray(oldTodos)) {
      for (const t of oldTodos) {
        await taskRepo.create({ title: t.text, done: !!t.done, task_type: null, course_id: null, due_at: null, notes: null });
      }
    }
    if (oldNotes && typeof oldNotes === 'object') {
      for (const [oldEvId, nd] of Object.entries(oldNotes)) {
        if (!nd || (!nd.text && !nd.tag)) continue;
        const evEntry = ev[oldEvId];
        const newTagId = nd.tag ? tagIdMap[nd.tag] : null;
        if (evEntry?.fixed && evEntry._courseId) {
          await noteRepo.create({
            course_id: evEntry._courseId,
            session_date: new Date().toISOString().slice(0, 10),
            body: nd.text || null,
            tag_id: newTagId || null,
          });
        } else if (evEntry?._eventId) {
          await eventRepo.update(evEntry._eventId, { notes: nd.text || null });
        }
      }
    }
    localStorage.removeItem('h-tags');
    localStorage.removeItem('h-notes');
    localStorage.removeItem('h-todos');
  } catch (err) {
    console.error('[migración v4] no se pudo migrar todo, se deja para revisar a mano', err);
  } finally {
    localStorage.setItem('migrated_v4', 'true');
  }
}
