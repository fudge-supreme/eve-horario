// Panel/tab de Tareas: 4 cubetas (Hoy/Mañana/Esta semana/Después) +
// hoja para agregar una tarea nueva, con filtro opcional por materia.
// Tocar una tarea (fuera del check/borrar) abre su detalle: prioridad,
// dependencias (no se puede marcar hecha si depende de otra sin
// terminar), y subtareas con orden propio arrastrable.
import { taskRepo } from '../data/repositories/taskRepo.js';
import { subtaskRepo } from '../data/repositories/subtaskRepo.js';
import { esc, haptic, H, openSheet, closeSheet, toast } from './shared.js';
import { getState } from './state.js';

let courseFilter = '';
let onMutated = null;
export function setTasksMutatedHandler(fn) { onMutated = fn; }

const PRIORITY = {
  high: { label: 'Alta', color: '#E5484D' },
  medium: { label: 'Media', color: '#F5A524' },
  low: { label: 'Baja', color: '#F5D90A' },
};

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

// Una tarea no se puede marcar hecha si depende de otra que sigue
// pendiente -- pedido explícito ("no permitan cerrar tareas sin antes
// terminar las otras de las que dependen"). Solo bloquea al MARCAR
// hecha, no al desmarcar.
function blockingTasks(task, allTasks) {
  if (!task.depends_on?.length) return [];
  const byId = new Map(allTasks.map((t) => [t.id, t]));
  return task.depends_on
    .map((id) => byId.get(id))
    .filter((t) => t && !t.deleted_at && !t.done);
}

async function trySetDone(task, done, allTasks) {
  if (done) {
    const blockers = blockingTasks(task, allTasks);
    if (blockers.length) {
      haptic([20, 50, 20]);
      toast(`Antes termina: ${blockers.map((b) => b.title).join(', ')}`);
      return false;
    }
  }
  await taskRepo.update(task.id, { done });
  return true;
}

function taskRowHTML(t, course, subtasks) {
  const p = t.priority ? PRIORITY[t.priority] : null;
  const subDone = subtasks.filter((s) => s.done).length;
  return `
    <div class="task-row${t.done ? ' done' : ''}" data-id="${t.id}">
      <button class="task-check${t.done ? ' done' : ''}" data-check="${t.id}" aria-label="Marcar hecha"></button>
      <div class="task-body">
        ${p ? `<span class="task-priority-dot" style="background:${p.color}" title="Prioridad ${p.label}"></span>` : ''}
        ${course ? `<span class="task-course-badge" style="background:${course.color}22;color:${course.color}">${esc(course.code || course.name)}</span>` : ''}
        <br>
        <span class="task-title">${esc(t.title)}</span>
        ${t.due_at ? `<p class="task-due">${fmtDue(t.due_at)}</p>` : ''}
        ${subtasks.length ? `<p class="task-due">${subDone}/${subtasks.length} subtareas</p>` : ''}
      </div>
      <button data-del="${t.id}" style="border:none;background:none;color:var(--ink2);font-size:15px;cursor:pointer;padding:4px">×</button>
    </div>`;
}

export function renderTasksPanel() {
  const container = document.getElementById('tasksBuckets');
  if (!container) return;
  const { allTasks, allCourses, allSubtasks } = getState();
  const courseById = new Map(allCourses.map((c) => [c.id, c]));
  const subtasksByTask = new Map();
  for (const s of allSubtasks) {
    if (s.deleted_at) continue;
    if (!subtasksByTask.has(s.task_id)) subtasksByTask.set(s.task_id, []);
    subtasksByTask.get(s.task_id).push(s);
  }
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
    return `<p class="tasks-bucket-title">${label}</p>` + items.map((t) => taskRowHTML(t, courseById.get(t.course_id), subtasksByTask.get(t.id) || [])).join('');
  }).join('');

  container.innerHTML = filterHTML + (groups || `<p class="tasks-empty" style="padding:0 20px">Sin tareas${courseFilter ? ' para esta materia' : ''} — buen trabajo ✨</p>`);

  document.getElementById('taskCourseFilter')?.addEventListener('change', (e) => { courseFilter = e.target.value; renderTasksPanel(); });
  container.querySelectorAll('[data-check]').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      const t = allTasks.find((x) => x.id === btn.dataset.check);
      if (!t) return;
      const ok = await trySetDone(t, !t.done, allTasks);
      if (!ok) return;
      haptic(H.check);
      await onMutated?.();
    };
  });
  container.querySelectorAll('[data-del]').forEach((btn) => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      await taskRepo.delete(btn.dataset.del);
      haptic(H.del);
      await onMutated?.();
      toast('Tarea eliminada');
    };
  });
  container.querySelectorAll('.task-row').forEach((row) => {
    row.onclick = () => openTaskDetailSheet(row.dataset.id);
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
    await taskRepo.create({ title, course_id: courseId, due_at: dueAt, task_type: null, notes: null, done: false, priority: null, depends_on: [] });
    await afterCreate();
    haptic(H.save); closeSheet(); toast('Tarea agregada');
  };
  openSheet();
}

/* ======== DETALLE DE TAREA (prioridad, dependencias, subtareas) ======== */

function subtaskRowHTML(s, index) {
  return `
    <div class="subtask-row${s.done ? ' done' : ''}" data-sid="${s.id}" draggable="false">
      <span class="subtask-drag" data-drag="${s.id}" aria-label="Arrastrar para reordenar">⠿</span>
      <span class="subtask-num">${index + 1}</span>
      <button class="task-check${s.done ? ' done' : ''}" data-scheck="${s.id}" aria-label="Marcar hecha" style="width:16px;height:16px"></button>
      <span class="subtask-title">${esc(s.title)}</span>
      <button data-sdel="${s.id}" class="subtask-del" aria-label="Borrar subtarea">×</button>
    </div>`;
}

// Los listeners de arrastre viven en `document` (ver bindSubtaskDrag)
// para no perder el gesto si el puntero se sale del ícono ⠿ chiquito.
// Solo debe haber un juego activo a la vez -- si se abre el detalle de
// otra tarea (o la misma otra vez) sin que el anterior se haya
// limpiado, esto quita los viejos antes de poner los nuevos.
let cleanupDrag = null;

export function openTaskDetailSheet(taskId) {
  cleanupDrag?.();
  const sheet = document.getElementById('sheet');
  const { allTasks, allCourses, allSubtasks } = getState();
  const task = allTasks.find((t) => t.id === taskId);
  if (!task) return;

  let subtasks = allSubtasks.filter((s) => s.task_id === taskId && !s.deleted_at).sort((a, b) => a.position - b.position);
  // Candidatas a dependencia: cualquier otra tarea viva que no dependa
  // ya de esta (evita el ciclo directo más obvio -- A necesita a B y B
  // necesita a A quedarían bloqueadas entre sí para siempre).
  const depCandidates = allTasks.filter((t) => t.id !== taskId && !t.deleted_at && !(t.depends_on || []).includes(taskId));

  function paint() {
    sheet.innerHTML = `
      <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
      <label>Título</label>
      <input type="text" id="tdTitle" value="${esc(task.title)}">
      <label>Materia <span style="font-weight:400;text-transform:none">(opcional)</span></label>
      <select id="tdCourse"><option value="">Sin materia</option>${allCourses.map((c) => `<option value="${c.id}"${task.course_id === c.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
      <div class="time-row">
        <div><label>Fecha <span style="font-weight:400;text-transform:none">(opcional)</span></label><input type="date" id="tdDate" value="${task.due_at ? task.due_at.slice(0, 10) : ''}"></div>
        <div><label>Hora</label><input type="time" id="tdTime" value="${task.due_at ? new Date(task.due_at).toTimeString().slice(0, 5) : '23:59'}"></div>
      </div>

      <label>Prioridad</label>
      <div class="priority-row" id="tdPriorityRow">
        ${Object.entries(PRIORITY).map(([key, p]) => `<button type="button" class="priority-chip${task.priority === key ? ' sel' : ''}" data-p="${key}" style="--p-color:${p.color}">${p.label}</button>`).join('')}
        <button type="button" class="priority-chip${!task.priority ? ' sel' : ''}" data-p="">Ninguna</button>
      </div>

      ${depCandidates.length ? `
        <label>Depende de <span style="font-weight:400;text-transform:none">(no se puede marcar hecha hasta que estas también lo estén)</span></label>
        <div class="dep-list" id="tdDepList">
          ${depCandidates.map((t) => `<label class="dep-row"><input type="checkbox" data-dep="${t.id}"${(task.depends_on || []).includes(t.id) ? ' checked' : ''}> <span${t.done ? ' style="text-decoration:line-through;color:var(--ink2)"' : ''}>${esc(t.title)}</span></label>`).join('')}
        </div>` : ''}

      <label>Subtareas</label>
      <div id="tdSubtaskList"></div>
      <div class="time-row" style="margin-top:6px">
        <input type="text" id="tdNewSubtask" placeholder="Agregar subtarea…" style="flex:1">
        <button type="button" class="chip-add" id="tdAddSubtask">+ Agregar</button>
      </div>

      <div class="sheet-actions">
        <button class="btn-danger" id="tdDelete">Eliminar tarea</button>
        <button class="btn-primary" id="tdSave">Guardar</button>
      </div>`;

    document.getElementById('sc').onclick = closeSheet;
    renderSubtaskList();

    document.getElementById('tdPriorityRow').onclick = async (e) => {
      const chip = e.target.closest('.priority-chip');
      if (!chip) return;
      sheet.querySelectorAll('.priority-chip').forEach((c) => c.classList.remove('sel'));
      chip.classList.add('sel');
      const val = chip.dataset.p || null;
      task.priority = val;
      await taskRepo.update(task.id, { priority: val });
      haptic(H.select);
    };

    document.getElementById('tdDepList')?.addEventListener('change', async (e) => {
      const cb = e.target.closest('[data-dep]');
      if (!cb) return;
      const set = new Set(task.depends_on || []);
      if (cb.checked) set.add(cb.dataset.dep); else set.delete(cb.dataset.dep);
      task.depends_on = [...set];
      await taskRepo.update(task.id, { depends_on: task.depends_on });
      haptic(H.select);
    });

    document.getElementById('tdAddSubtask').onclick = async () => {
      const input = document.getElementById('tdNewSubtask');
      const title = input.value.trim();
      if (!title) return;
      const created = await subtaskRepo.create({ task_id: taskId, title, done: false, position: subtasks.length });
      subtasks.push(created);
      input.value = '';
      haptic(H.tap);
      renderSubtaskList();
      await onMutated?.();
    };
    document.getElementById('tdNewSubtask').onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); document.getElementById('tdAddSubtask').click(); }
    };

    document.getElementById('tdSave').onclick = async () => {
      const title = document.getElementById('tdTitle').value.trim();
      if (!title) { document.getElementById('tdTitle').style.borderColor = 'var(--tag-coral)'; haptic([20, 50, 20]); return; }
      const courseId = document.getElementById('tdCourse').value || null;
      const dateVal = document.getElementById('tdDate').value;
      const timeVal = document.getElementById('tdTime').value || '23:59';
      const dueAt = dateVal ? new Date(`${dateVal}T${timeVal}:00`).toISOString() : null;
      await taskRepo.update(task.id, { title, course_id: courseId, due_at: dueAt });
      await onMutated?.();
      haptic(H.save); closeSheet(); toast('Tarea actualizada');
    };
    document.getElementById('tdDelete').onclick = async () => {
      await taskRepo.delete(task.id);
      await onMutated?.();
      haptic(H.del); closeSheet(); toast('Tarea eliminada');
    };
  }

  // Arrastrar para reordenar (mouse y dedo, sin librería): al soltar,
  // recalcula `position` de todas las subtareas según su orden visual
  // final y lo guarda. pointermove/pointerup se escuchan en `document`
  // -- no solo en la manija -- para que arrastrar rápido y salirse del
  // ícono ⠿ (que es chico) no corte el gesto a medias. Se enganchan
  // una sola vez (no en cada render de la lista) para no acumular
  // listeners huérfanos cada vez que se agrega/borra/marca algo.
  let dragId = null;
  function onDragMove(e) {
    if (!dragId) return;
    const list = document.getElementById('tdSubtaskList');
    const overRow = document.elementFromPoint(e.clientX, e.clientY)?.closest('.subtask-row');
    if (!list || !overRow || overRow.dataset.sid === dragId) return;
    const draggingRow = list.querySelector(`.subtask-row[data-sid="${dragId}"]`);
    if (!draggingRow) return;
    const all = [...list.querySelectorAll('.subtask-row')];
    const overIdx = all.indexOf(overRow);
    const dragIdx = all.indexOf(draggingRow);
    if (overIdx < dragIdx) list.insertBefore(draggingRow, overRow);
    else list.insertBefore(draggingRow, overRow.nextSibling);
  }
  async function onDragUp() {
    if (!dragId) return;
    const list = document.getElementById('tdSubtaskList');
    const draggingRow = list?.querySelector(`.subtask-row[data-sid="${dragId}"]`);
    draggingRow?.classList.remove('dragging');
    dragId = null;
    if (!list) return;
    // El nuevo orden visual manda -- se recalculan las posiciones de
    // todas para que queden consecutivas (0..n-1).
    const newOrder = [...list.querySelectorAll('.subtask-row')].map((r) => r.dataset.sid);
    subtasks.sort((a, b) => newOrder.indexOf(a.id) - newOrder.indexOf(b.id));
    await Promise.all(subtasks.map((s, i) => {
      s.position = i;
      return subtaskRepo.update(s.id, { position: i });
    }));
    renderSubtaskList();
    await onMutated?.();
  }
  document.addEventListener('pointermove', onDragMove);
  document.addEventListener('pointerup', onDragUp);
  document.addEventListener('pointercancel', onDragUp);
  cleanupDrag = () => {
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragUp);
    document.removeEventListener('pointercancel', onDragUp);
    dragId = null;
  };

  function renderSubtaskList() {
    const list = document.getElementById('tdSubtaskList');
    if (!list) return;
    list.innerHTML = subtasks.map((s, i) => subtaskRowHTML(s, i)).join('');
    list.querySelectorAll('[data-scheck]').forEach((btn) => {
      btn.onclick = async () => {
        const s = subtasks.find((x) => x.id === btn.dataset.scheck);
        s.done = !s.done;
        await subtaskRepo.update(s.id, { done: s.done });
        haptic(H.check);
        renderSubtaskList();
        await onMutated?.();
      };
    });
    list.querySelectorAll('[data-sdel]').forEach((btn) => {
      btn.onclick = async () => {
        await subtaskRepo.delete(btn.dataset.sdel);
        subtasks = subtasks.filter((x) => x.id !== btn.dataset.sdel);
        haptic(H.del);
        renderSubtaskList();
        await onMutated?.();
      };
    });
    list.querySelectorAll('[data-drag]').forEach((handle) => {
      handle.onpointerdown = (e) => {
        e.preventDefault();
        dragId = handle.dataset.drag;
        handle.closest('.subtask-row')?.classList.add('dragging');
      };
    });
  }

  paint();
  openSheet();
}
