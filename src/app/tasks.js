// Panel/tab de Tareas: 4 cubetas (Hoy/Mañana/Esta semana/Después) +
// hoja para agregar una tarea nueva, con filtro opcional por materia.
import { taskRepo } from '../data/repositories/taskRepo.js';
import { esc, haptic, H, openSheet, closeSheet, toast } from './shared.js';
import { getState } from './state.js';

let courseFilter = '';
let onMutated = null;
export function setTasksMutatedHandler(fn) { onMutated = fn; }

function bucketFor(dueAtISO) {
  if (!dueAtISO) return 'despues';
  const due = new Date(dueAtISO);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfDayAfterTomorrow = new Date(startOfTomorrow); startOfDayAfterTomorrow.setDate(startOfDayAfterTomorrow.getDate() + 1);
  const daysUntilSunday = (7 - now.getDay()) % 7;
  const endOfWeek = new Date(startOfToday); endOfWeek.setDate(endOfWeek.getDate() + daysUntilSunday); endOfWeek.setHours(23, 59, 59, 999);

  if (due < startOfTomorrow) return 'hoy'; // incluye vencidas, para que no se pierdan de vista
  if (due < startOfDayAfterTomorrow) return 'manana';
  if (due <= endOfWeek) return 'semana';
  return 'despues';
}

const BUCKETS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'manana', label: 'Mañana' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'despues', label: 'Después' },
];

function fmtDue(dueAtISO) {
  if (!dueAtISO) return '';
  const d = new Date(dueAtISO);
  return 'Vence ' + d.toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

function taskRowHTML(t, course) {
  return `
    <div class="task-row${t.done ? ' done' : ''}" data-id="${t.id}">
      <button class="task-check${t.done ? ' done' : ''}" data-check="${t.id}" aria-label="Marcar hecha"></button>
      <div class="task-body">
        ${course ? `<span class="task-course-badge" style="background:${course.color}22;color:${course.color}">${esc(course.code || course.name)}</span><br>` : ''}
        <span class="task-title">${esc(t.title)}</span>
        ${t.due_at ? `<p class="task-due">${fmtDue(t.due_at)}</p>` : ''}
      </div>
      <button data-del="${t.id}" style="border:none;background:none;color:var(--ink2);font-size:15px;cursor:pointer;padding:4px">×</button>
    </div>`;
}

export function renderTasksPanel() {
  const container = document.getElementById('tasksBuckets');
  if (!container) return;
  const { allTasks, allCourses } = getState();
  const courseById = new Map(allCourses.map((c) => [c.id, c]));
  const visible = allTasks.filter((t) => !t.deleted_at && (!courseFilter || t.course_id === courseFilter));

  const filterHTML = allCourses.length
    ? `<div style="padding:0 20px 6px"><select id="taskCourseFilter" style="width:100%;padding:8px 10px;border-radius:10px;border:1px solid var(--glass-border);background:var(--surface);font-size:12.5px;color:var(--ink)">
        <option value="">Todas las materias</option>
        ${allCourses.map((c) => `<option value="${c.id}"${courseFilter === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}
      </select></div>`
    : '';

  const groups = BUCKETS.map(({ key, label }) => {
    const items = visible.filter((t) => bucketFor(t.due_at) === key).sort((a, b) => (a.due_at || '').localeCompare(b.due_at || ''));
    if (!items.length) return '';
    return `<p class="tasks-bucket-title">${label}</p>` + items.map((t) => taskRowHTML(t, courseById.get(t.course_id))).join('');
  }).join('');

  container.innerHTML = filterHTML + (groups || `<p class="tasks-empty" style="padding:0 20px">Sin tareas${courseFilter ? ' para esta materia' : ''} — buen trabajo ✨</p>`);

  document.getElementById('taskCourseFilter')?.addEventListener('change', (e) => { courseFilter = e.target.value; renderTasksPanel(); });
  container.querySelectorAll('[data-check]').forEach((btn) => {
    btn.onclick = async () => {
      const t = allTasks.find((x) => x.id === btn.dataset.check);
      if (!t) return;
      await taskRepo.update(t.id, { done: !t.done });
      haptic(H.check);
      await onMutated?.();
    };
  });
  container.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async () => {
      await taskRepo.delete(btn.dataset.del);
      haptic(H.del);
      await onMutated?.();
      toast('Tarea eliminada');
    };
  });
}

export function openAddTaskSheet(afterCreate) {
  const sheet = document.getElementById('sheet');
  const { allCourses } = getState();
  sheet.innerHTML = `
    <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
    <label>Título</label>
    <input type="text" id="atTitle" placeholder="Ej. Entregar boceto final">
    <label>Materia <span style="font-weight:400;text-transform:none">(opcional)</span></label>
    <select id="atCourse"><option value="">Sin materia</option>${allCourses.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
    <label>Fecha de vencimiento <span style="font-weight:400;text-transform:none">(opcional)</span></label>
    <input type="date" id="atDate">
    <div class="time-row"><div><label>Hora <span style="font-weight:400;text-transform:none">(opcional)</span></label><input type="time" id="atTime" value="23:59"></div></div>
    <div class="sheet-actions"><button class="btn-primary" id="atSave">Agregar tarea</button></div>`;
  document.getElementById('sc').onclick = closeSheet;
  document.getElementById('atSave').onclick = async () => {
    const title = document.getElementById('atTitle').value.trim();
    if (!title) { document.getElementById('atTitle').style.borderColor = 'var(--tag-coral)'; haptic([20, 50, 20]); return; }
    const courseId = document.getElementById('atCourse').value || null;
    const dateVal = document.getElementById('atDate').value;
    const timeVal = document.getElementById('atTime').value || '23:59';
    const dueAt = dateVal ? new Date(`${dateVal}T${timeVal}:00`).toISOString() : null;
    await taskRepo.create({ title, course_id: courseId, due_at: dueAt, task_type: null, notes: null, done: false });
    await afterCreate();
    haptic(H.save); closeSheet(); toast('Tarea agregada');
  };
  openSheet();
}
