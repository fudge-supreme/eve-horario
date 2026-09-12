// Vista Materias: galería de tarjetas + hoja para agregar una nueva.
// No importa nada de legacy-app.js (evitaría un ciclo) -- para abrir el
// detalle de una materia al tocar su tarjeta, legacy-app.js registra un
// callback una sola vez con setCourseClickHandler().
import { courseRepo } from '../data/repositories/courseRepo.js';
import { classSessionRepo } from '../data/repositories/classSessionRepo.js';
import { esc, haptic, H, openSheet, closeSheet, toast } from './shared.js';
import { getState, DAYS, DAY_TO_NUM, COURSE_COLORS } from './state.js';

let onCourseClick = null;
export function setCourseClickHandler(fn) { onCourseClick = fn; }

export function renderMaterias() {
  const grid = document.getElementById('materiasGrid');
  const empty = document.getElementById('materiasEmpty');
  if (!grid) return;
  const { allCourses, allTasks } = getState();
  const query = (document.getElementById('materiasSearch')?.value || '').trim().toLowerCase();
  const filtered = query
    ? allCourses.filter((c) => c.name.toLowerCase().includes(query) || (c.code || '').toLowerCase().includes(query))
    : allCourses;

  if (!filtered.length) {
    grid.innerHTML = '';
    if (empty) {
      empty.hidden = false;
      empty.textContent = query ? `Sin resultados para "${query}".` : 'Aún no tienes materias. Agrega la primera con el botón +.';
    }
    return;
  }
  if (empty) empty.hidden = true;

  grid.innerHTML = filtered.map((c) => {
    const pending = allTasks.filter((t) => t.course_id === c.id && !t.done && !t.deleted_at).length;
    return `
    <button class="materia-card" data-course="${c.id}">
      <div class="mc-dot" style="background:${c.color || '#B8D4F1'}"></div>
      ${pending ? `<span class="mc-pending">${pending}</span>` : ''}
      ${c.code ? `<div class="mc-code">${esc(c.code)}</div>` : ''}
      <div class="mc-name">${esc(c.name)}</div>
      <div class="mc-meta">${c.professor ? esc(c.professor) + '<br>' : ''}${c.room ? esc(c.room) : 'En línea'}</div>
    </button>`;
  }).join('');

  grid.querySelectorAll('.materia-card').forEach((card) => {
    card.onclick = () => { haptic(H.tap); onCourseClick?.(card.dataset.course); };
  });
}

export function bindMateriasSearch() {
  document.getElementById('materiasSearch')?.addEventListener('input', () => renderMaterias());
}

export function openAddMateriaSheet(afterCreate) {
  const sheet = document.getElementById('sheet');
  const { activeSchedule } = getState();
  const slots = [];
  let selColor = COURSE_COLORS[0];

  // El formulario se pinta UNA sola vez -- agregar/quitar un horario solo
  // reescribe #amSlotsList, para no perder lo que ya se había escrito en
  // los demás campos (bug real que encontré probando: repintar todo el
  // sheet en cada horario agregado borraba nombre/código/etc.).
  function renderSlotsList() {
    document.getElementById('amSlotsList').innerHTML = slots
      .map((s, i) => `<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;background:var(--surface);padding:7px 10px;border-radius:10px"><span style="flex:1">${s.day} · ${fmtTimeStr(s.start)}–${fmtTimeStr(s.end)}</span><button data-rm="${i}" style="border:none;background:none;color:var(--tag-coral);cursor:pointer">×</button></div>`)
      .join('');
    document.querySelectorAll('#amSlotsList [data-rm]').forEach((btn) => {
      btn.onclick = () => { slots.splice(+btn.dataset.rm, 1); renderSlotsList(); };
    });
  }

  sheet.innerHTML = `
    <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
    <label>Nombre</label>
    <input type="text" id="amName" placeholder="Ej. Tipografía 2">
    <div class="time-row">
      <div><label>Código <span style="font-weight:400;text-transform:none">(opcional)</span></label><input type="text" id="amCode" placeholder="TIP201"></div>
      <div><label>Créditos <span style="font-weight:400;text-transform:none">(opcional)</span></label><input type="text" id="amCredits" inputmode="numeric" placeholder="6"></div>
    </div>
    <label>Profesor <span style="font-weight:400;text-transform:none">(opcional)</span></label>
    <input type="text" id="amProf" placeholder="Nombre del profesor">
    <label>Aula <span style="font-weight:400;text-transform:none">(vacío = en línea)</span></label>
    <input type="text" id="amRoom" placeholder="Ej. S-201">
    <label>Color</label>
    <div class="cd-color-row" id="amColorRow">${COURSE_COLORS.map((c, i) => `<div class="color-opt${i === 0 ? ' sel' : ''}" data-c="${c}" style="background:${c}"></div>`).join('')}</div>

    <label>Horario recurrente <span style="font-weight:400;text-transform:none">(opcional, puedes agregar varias)</span></label>
    <div id="amSlotsList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:8px"></div>
    <div class="time-row">
      <div><label>Día</label><select id="amDay">${DAYS.map((d) => `<option>${d}</option>`).join('')}</select></div>
      <div><label>Inicio</label><input type="time" id="amStart" value="15:00"></div>
      <div><label>Fin</label><input type="time" id="amEnd" value="16:00"></div>
    </div>
    <button class="chip-add" id="amAddSlot" type="button">+ Agregar horario</button>

    <div class="sheet-actions"><button class="btn-primary" id="amSave">Crear materia</button></div>`;

  document.getElementById('sc').onclick = closeSheet;
  document.getElementById('amColorRow').onclick = (e) => {
    const o = e.target.closest('.color-opt');
    if (!o) return;
    sheet.querySelectorAll('#amColorRow .color-opt').forEach((x) => x.classList.remove('sel'));
    o.classList.add('sel'); selColor = o.dataset.c; haptic(H.select);
  };
  document.getElementById('amAddSlot').onclick = () => {
    const day = document.getElementById('amDay').value;
    const start = document.getElementById('amStart').value;
    const end = document.getElementById('amEnd').value;
    if (!start || !end) { toast('Pon la hora de inicio y de fin'); return; }
    if (end <= start) { toast('La hora de fin debe ser después del inicio'); return; }
    slots.push({ day, start, end });
    haptic(H.tap);
    renderSlotsList();
  };
  document.getElementById('amSave').onclick = async () => {
    const name = document.getElementById('amName').value.trim();
    if (!name) { document.getElementById('amName').style.borderColor = 'var(--tag-coral)'; haptic([20, 50, 20]); return; }
    const code = document.getElementById('amCode').value.trim();
    const creditsRaw = document.getElementById('amCredits').value.trim();
    const professor = document.getElementById('amProf').value.trim();
    const room = document.getElementById('amRoom').value.trim();
    const course = await courseRepo.create({
      schedule_id: activeSchedule.id,
      name, code: code || null,
      credits: creditsRaw ? parseInt(creditsRaw, 10) : null,
      professor: professor || null,
      room: room || null,
      color: selColor,
    });
    for (const s of slots) {
      await classSessionRepo.create({
        course_id: course.id,
        day_of_week: DAY_TO_NUM[s.day],
        start_time: s.start,
        end_time: s.end,
      });
    }
    await afterCreate();
    haptic(H.save); closeSheet(); toast('Materia creada');
  };
  openSheet();
}

// Con <input type="time"> ya no hay un rango de horas fijo que definir
// -- se puede escribir cualquiera, incluyendo las que el select viejo
// no dejaba (8/9/10pm y más tarde, bug real reportado en producción).
function fmtTimeStr(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}
