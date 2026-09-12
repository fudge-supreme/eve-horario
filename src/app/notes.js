// Sección de notas recientes (abajo del panel Semana) + hoja rápida
// para agregar una nota sin tener que entrar primero al detalle de una
// materia. Las notas siempre son de una materia + una fecha (así vive
// el schema desde Fase 1) -- este botón rápido solo evita la navegación
// extra, no cambia ese modelo.
import { noteRepo } from '../data/repositories/noteRepo.js';
import { esc, haptic, H, openSheet, closeSheet, toast } from './shared.js';
import { getState } from './state.js';

let onMutated = null;
export function setNotesMutatedHandler(fn) { onMutated = fn; }

function fmtDate(isoDate) {
  const d = new Date(`${isoDate}T00:00:00`);
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

export function renderNotesSection() {
  const container = document.getElementById('notesSection');
  if (!container) return;
  const { allNotes, allCourses } = getState();
  const courseById = new Map(allCourses.map((c) => [c.id, c]));
  const visible = allNotes
    .filter((n) => !n.deleted_at && n.body)
    .sort((a, b) => b.session_date.localeCompare(a.session_date))
    .slice(0, 8);

  if (!visible.length) {
    container.innerHTML = `
      <div class="sec-head"><span class="sec-title">Notas</span></div>
      <p class="tasks-empty" style="padding:0 20px 20px">Sin notas todavía.</p>`;
    return;
  }

  container.innerHTML = `
    <div class="sec-head"><span class="sec-title">Notas</span></div>
    <div style="padding:0 20px 20px;display:flex;flex-direction:column;gap:8px">
      ${visible.map((n) => {
        const course = courseById.get(n.course_id);
        return `
        <div class="task-row" style="align-items:flex-start">
          <div class="task-body">
            ${course ? `<span class="task-course-badge" style="background:${course.color}22;color:${course.color}">${esc(course.code || course.name)}</span>` : ''}
            <p class="task-due" style="margin:2px 0 4px">${fmtDate(n.session_date)}</p>
            <span class="task-title" style="font-weight:400">${esc(n.body)}</span>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

export function openAddNoteSheet(afterCreate) {
  const sheet = document.getElementById('sheet');
  const { allCourses } = getState();
  if (!allCourses.length) { toast('Agrega una materia primero'); return; }
  const today = new Date().toISOString().slice(0, 10);
  sheet.innerHTML = `
    <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
    <label>Materia</label>
    <select id="anCourse">${allCourses.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
    <label>Fecha</label>
    <input type="date" id="anDate" value="${today}">
    <label>Nota</label>
    <textarea id="anBody" placeholder="Escribe algo sobre esta clase…"></textarea>
    <div class="sheet-actions"><button class="btn-primary" id="anSave">Agregar nota</button></div>`;
  document.getElementById('sc').onclick = closeSheet;
  document.getElementById('anSave').onclick = async () => {
    const courseId = document.getElementById('anCourse').value;
    const date = document.getElementById('anDate').value || today;
    const body = document.getElementById('anBody').value.trim();
    if (!body) { document.getElementById('anBody').style.borderColor = 'var(--tag-coral)'; haptic([20, 50, 20]); return; }
    await noteRepo.create({ course_id: courseId, session_date: date, body, tag_id: null });
    await afterCreate();
    haptic(H.save); closeSheet(); toast('Nota agregada');
  };
  openSheet();
}
