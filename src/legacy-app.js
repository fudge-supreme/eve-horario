// App principal: grid semanal, today card + countdown, course detail
// sheet, evento personal. Las vistas de Materias y Tareas viven en
// src/app/ (módulos aparte). Los datos compartidos viven en
// src/app/state.js (evita un ciclo de imports entre este archivo y
// los módulos de app/, que este archivo sí importa).
import { courseRepo } from './data/repositories/courseRepo.js';
import { classSessionRepo } from './data/repositories/classSessionRepo.js';
import { eventRepo } from './data/repositories/eventRepo.js';
import { tagRepo } from './data/repositories/tagRepo.js';
import { noteRepo } from './data/repositories/noteRepo.js';
import { onSyncStatusChange, getSyncStatus } from './data/syncStatus.js';
import { navigate } from './router.js';
import { mountThemeMenu } from './themes/themeMenu.js';
import { haptic, H, fH, esc, toast, openSheet, closeSheet } from './app/shared.js';
import {
  DAYS, DS, today, COURSE_COLORS, TAG_COLOR_PALETTE,
  getState, refreshEv, resetSeedCache, migrateLocalStorageEntitiesIfNeeded,
  setWeekOffset, isCurrentWeek, weekLabelText, dateForDayInVisibleWeek,
} from './app/state.js';
import { renderMaterias, openAddMateriaSheet, setCourseClickHandler, bindMateriasSearch } from './app/materias.js';
import { renderTasksPanel, openAddTaskSheet, setTasksMutatedHandler } from './app/tasks.js';
import { renderNotesSection, openAddNoteSheet, setNotesMutatedHandler } from './app/notes.js';
import { openScheduleSwitcher, renderScheduleHeader } from './app/schedules.js';
import { exportGridAsPNG, exportScheduleAsICS } from './app/export.js';
import { setActiveTab, bindNav } from './app/nav.js';

let weekOffset = 0;

/* ======== TODAY CARD + COUNTDOWN ======== */
function todayGreetingHTML() {
  const { ev } = getState();
  const h = new Date().getHours();
  let gr = 'Buenos días';
  if (h >= 12 && h < 19) gr = 'Buenas tardes';
  else if (h >= 19) gr = 'Buenas noches';
  const te = Object.values(ev).filter((e) => e.day === today).sort((a, b) => a.start - b.start);
  const n = te.length;
  let d;
  if (!today) { d = 'Disfruta tu día.'; }
  else if (!n) { d = 'Día libre — sin clases hoy.'; }
  else {
    const f = te[0], l = te[n - 1];
    d = `Tienes <b>${n}</b> clase${n > 1 ? 's' : ''}, de <b>${fH(f.start)}</b> a <b>${fH(l.end)}</b>.`;
    const h2 = new Date().getHours() + new Date().getMinutes() / 60;
    const cur = te.find((e) => h2 >= e.start && h2 < e.end);
    if (cur) d += ` Ahora: <b>${esc(cur.name)}</b>.`;
    else {
      const nx = te.find((e) => e.start > h2);
      if (nx) d += ` Siguiente: <b>${esc(nx.name)}</b> a las <b>${fH(nx.start)}</b>.`;
    }
  }
  return `<p class="today-greeting">${gr}</p><p class="today-detail">${d}</p>`;
}

function renderToday() {
  const html = todayGreetingHTML();
  document.querySelectorAll('#todayCard, #todayCardDesktop').forEach((c) => { if (c) c.innerHTML = html; });
}

function computeCountdown() {
  const { ev } = getState();
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const todays = Object.values(ev).filter((e) => e.day === today).sort((a, b) => a.start - b.start);
  const current = todays.find((e) => h >= e.start && h < e.end);
  if (current) {
    const minsLeft = Math.max(0, Math.round((current.end - h) * 60));
    return { text: `En clase · termina en ${minsLeft} min`, critical: false };
  }
  const next = todays.find((e) => e.start > h);
  if (next) {
    const minsUntil = Math.round((next.start - h) * 60);
    const hrs = Math.floor(minsUntil / 60), mins = minsUntil % 60;
    const label = hrs > 0 ? `${hrs}h ${mins}min` : `${mins} min`;
    return { text: `${esc(next.name)} en ${label}`, critical: minsUntil <= 15 };
  }
  return { text: 'Terminaste por hoy', critical: false };
}

let countdownTimer = null;
function renderCountdown() {
  const el = document.getElementById('todayCountdown');
  if (!el) return;
  const c = computeCountdown();
  el.innerHTML = `<p class="countdown-text${c.critical ? ' critical' : ''}">${c.text}</p>`;
}

function renderWeek() {
  const { ev } = getState();
  const all = Object.values(ev);
  const total = all.length;
  const h = new Date().getHours();
  const di = DAYS.indexOf(today);
  const done = isCurrentWeek()
    ? all.filter((e) => {
        const ei = DAYS.indexOf(e.day);
        return ei < di || (ei === di && e.end <= h);
      }).length
    : 0;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const fill = document.getElementById('weekFill');
  const lbl = document.getElementById('weekLbl');
  if (fill) fill.style.width = pct + '%';
  if (lbl) lbl.textContent = done + ' / ' + total + ' esta semana';
}

/* ======== GRID RANGE ======== */
function gridRange() {
  const { ev } = getState();
  const all = Object.values(ev);
  if (!all.length) return { gs: 8, ge: 22 };
  let mn = 24, mx = 0;
  all.forEach((e) => {
    if (e.start < mn) mn = e.start;
    if (e.end > mx) mx = e.end;
  });
  return { gs: Math.max(0, mn - 1), ge: Math.min(24, mx + 1) };
}

/* ======== CALENDAR GRID ======== */
function renderGrid() {
  const { ev, allNotes } = getState();
  const grid = document.getElementById('calGrid');
  if (!grid) return;
  grid.innerHTML = '';
  const { gs, ge } = gridRange();
  const hrs = ge - gs;
  grid.style.gridTemplateColumns = `var(--time-w) repeat(7,var(--day-w))`;
  grid.style.gridTemplateRows = `var(--head-h) repeat(${hrs},var(--row-h))`;
  const occ = {};
  Object.values(ev).forEach((e) => {
    const di = DAYS.indexOf(e.day);
    for (let h = e.start; h < e.end; h++) occ[di + '-' + (h - gs + 2)] = true;
  });
  DAYS.forEach((day, i) => {
    const h = document.createElement('div');
    h.className = 'col-head' + (day === today && isCurrentWeek() ? ' is-today' : '');
    h.dataset.day = day;
    h.style.gridColumn = i + 2;
    h.innerHTML = `<span class="d">${DS[day]}</span>${day}`;
    grid.appendChild(h);
  });
  for (let h = gs; h < ge; h++) {
    const lbl = document.createElement('div');
    lbl.className = 'time-lbl';
    lbl.style.gridRow = h - gs + 2;
    lbl.textContent = fH(h);
    grid.appendChild(lbl);
    const ln = document.createElement('div');
    ln.className = 'g-line';
    ln.style.gridRow = h - gs + 2;
    grid.appendChild(ln);
  }
  Object.entries(ev).forEach(([id, e]) => {
    const di = DAYS.indexOf(e.day);
    if (di < 0) return;
    const sr = e.start - gs + 2, er = e.end - gs + 2;
    if (sr < 2 || er > hrs + 2) return;
    const b = document.createElement('div');
    b.className = 'c-block' + (e.online ? ' is-online' : '') + (e.fixed ? '' : ' is-custom');
    b.dataset.id = id;
    b.style.gridColumn = di + 2;
    b.style.gridRow = sr + '/' + er;
    if (e.color) b.style.setProperty('--terracotta', e.color);
    const loc = e.online ? 'En línea' : e.room || '';
    b.innerHTML =
      `<div><div class="bt">${fH(e.start)}</div><div class="bn">${esc(e.name)}</div></div>` +
      (loc ? `<div class="br">${esc(loc)}</div>` : '') +
      `<span class="tap-hint">›</span>`;
    const hasNote = e.fixed
      ? allNotes.some((n) => n.course_id === e._courseId && n.session_date === e.date)
      : !!e._eventNotes;
    if (hasNote) {
      const dot = document.createElement('div');
      dot.className = 'n-dot';
      dot.style.background = 'var(--terracotta)';
      b.appendChild(dot);
    }
    b.onclick = () => { haptic(H.tap); openEvSheet(id); };
    grid.appendChild(b);
  });
  DAYS.forEach((day, di) => {
    for (let h = gs; h < ge; h++) {
      const row = h - gs + 2;
      if (occ[di + '-' + row]) continue;
      const cell = document.createElement('div');
      cell.className = 'add-cell';
      cell.style.gridColumn = di + 2;
      cell.style.gridRow = row + '/' + (row + 1);
      cell.innerHTML = '<span>+</span>';
      cell.onclick = () => { haptic(H.tap); openNewEvent(day, h); };
      grid.appendChild(cell);
    }
  });
  renderNowLine(gs);
  updateTodayFloatBtn();
}

function renderNowLine(gs) {
  if (gs === undefined) { const r = gridRange(); gs = r.gs; }
  const grid = document.getElementById('calGrid');
  if (!grid) return;
  grid.querySelectorAll('.now-line').forEach((n) => n.remove());
  if (!today || !isCurrentWeek()) return;
  const di = DAYS.indexOf(today);
  if (di < 0) return;
  const now = new Date();
  const hf = now.getHours() + now.getMinutes() / 60;
  const { ge } = gridRange();
  if (hf < gs || hf > ge) return;
  const rh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-h'));
  const hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--head-h'));
  const tw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--time-w'));
  const dw = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--day-w'));
  const line = document.createElement('div');
  line.className = 'now-line';
  line.style.top = hh + (hf - gs) * rh + 'px';
  line.style.left = tw + di * dw + 3 + 'px';
  line.style.width = dw - 6 + 'px';
  grid.appendChild(line);
}

function updateTodayFloatBtn() {
  const btn = document.getElementById('todayFloatBtn');
  if (!btn) return;
  btn.classList.toggle('show', !isCurrentWeek());
}
function renderWeekLabel() {
  const el = document.getElementById('weekLabel');
  if (el) el.textContent = weekLabelText();
}
async function goToWeek(offset) {
  weekOffset = offset;
  setWeekOffset(offset);
  renderWeekLabel();
  await refreshEv();
  renderGrid(); renderWeek();
}

/* ======== SHEETS ======== */
const sheet = document.getElementById('sheet');

/* --- Swipe-down to close sheet --- */
(function () {
  let sy = 0, cy = 0, drag = false, startTs = 0;
  sheet.addEventListener('pointerdown', (e) => {
    // En desktop la hoja se centra como diálogo (ver layout.css) en vez
    // de anclarse abajo -- el arrastre para cerrar deslizando solo
    // tiene sentido en el patrón de celular, y como usa
    // sheet.style.transform directo, en desktop pisaría el
    // translate(-50%,-50%) que la mantiene centrada.
    if (window.innerWidth >= 1024) return;
    // El botón de cerrar (×) vive en los primeros 60px, la misma zona
    // que dispara el arrastre -- sin este guard, tocarlo capturaba el
    // puntero para el gesto de swipe y se comía el click, dejando el
    // botón "muerto" (bug real: no cerraba la hoja al tocarlo).
    if (e.target.closest('button')) return;
    const rect = sheet.getBoundingClientRect();
    if (e.clientY - rect.top > 60) return;
    sy = e.clientY; drag = true; startTs = Date.now();
    sheet.classList.add('dragging');
    sheet.setPointerCapture?.(e.pointerId);
  });
  sheet.addEventListener('pointermove', (e) => {
    if (!drag) return;
    cy = e.clientY - sy;
    if (cy < 0) cy = 0;
    sheet.style.transform = `translateY(${cy}px)`;
  });
  const end = () => {
    if (!drag) return;
    drag = false; sheet.classList.remove('dragging');
    const dt = Date.now() - startTs;
    const velocity = cy / dt;
    if (cy > 140 || velocity > 0.5) { closeSheet(); }
    else { sheet.style.transform = ''; }
    cy = 0;
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
})();

function tagChipsHTML(activeTagId) {
  const { allTags } = getState();
  return (
    allTags.map((t) => `<div class="chip${activeTagId === t.id ? ' active' : ''}" data-c="cust" data-tid="${t.id}"><i style="background:${t.color}"></i>${esc(t.name)}</div>`).join('') +
    `<button class="chip-add" id="mTagBtn">+ Crear</button>`
  );
}

export function openEvSheet(id) {
  const { ev } = getState();
  const e = ev[id];
  if (!e) return;
  if (e.fixed) openCourseDetailSheet(e);
  else openEventDetailSheet(id, e);
}

function courseSessionsSummary(courseId) {
  const { ev } = getState();
  return Object.values(ev)
    .filter((x) => x.fixed && x._courseId === courseId)
    .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start - b.start)
    .map((x) => `${x.day} · ${fH(x.start)}–${fH(x.end)}`)
    .join(', ');
}

export function openCourseDetailSheet(e) {
  const { allCourses, allNotes, allTasks } = getState();
  const course = allCourses.find((c) => c.id === e._courseId);
  if (!course) return;
  const noteForToday = allNotes.find((n) => n.course_id === course.id && n.session_date === e.date);
  const pendingTasks = allTasks.filter((t) => t.course_id === course.id && !t.done && !t.deleted_at);
  const courseNotes = allNotes.filter((n) => n.course_id === course.id && !n.deleted_at).sort((a, b) => b.session_date.localeCompare(a.session_date));

  sheet.innerHTML = `
    <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-right:30px">
      <div>
        <label>Materia</label>
        <p style="font-family:'Fraunces',serif;font-style:italic;font-size:20px;font-weight:500">${esc(course.name)}</p>
        ${course.code ? `<p style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--terracotta)">${esc(course.code)}</p>` : ''}
      </div>
    </div>
    <div class="cd-info-row"><span class="cd-icon">📅</span> ${esc(courseSessionsSummary(course.id)) || 'Sin horario recurrente'}</div>
    <div class="cd-info-row"><span class="cd-icon">📍</span> ${course.room ? esc(course.room) : 'En línea'}</div>
    <div class="cd-info-row"><span class="cd-icon">👤</span> ${course.professor ? esc(course.professor) : 'Profesor sin registrar'}</div>
    <div class="cd-info-row"><span class="cd-icon">🎓</span> ${course.credits != null ? course.credits + ' créditos' : 'Créditos sin registrar'}</div>

    <label>Aula (edición rápida)</label>
    <input type="text" id="evRoom" value="${esc(course.room || '')}" placeholder="Vacío = en línea">
    <label>Profesor</label>
    <input type="text" id="evProf" value="${esc(course.professor || '')}">

    <div class="cd-color-row" id="colorRow">
      ${COURSE_COLORS.map((c) => `<div class="color-opt${course.color === c ? ' sel' : ''}" data-c="${c}" style="background:${c}"></div>`).join('')}
    </div>

    ${pendingTasks.length ? `<p class="cd-section-title">Tareas pendientes</p>` + pendingTasks.map((t) => `<div class="task-row"><div class="task-body"><p class="task-title">${esc(t.title)}</p>${t.due_at ? `<p class="task-due">Vence ${new Date(t.due_at).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</p>` : ''}</div></div>`).join('') : ''}

    ${courseNotes.length ? `<p class="cd-section-title">Notas</p>` + courseNotes.slice(0, 5).map((n) => `<div class="task-row"><div class="task-body"><p class="task-title">${esc(n.body || '')}</p><p class="task-due">${n.session_date}</p></div></div>`).join('') : ''}

    <label>Etiqueta para hoy</label>
    <div class="chip-row" id="chipRow">${tagChipsHTML(noteForToday?.tag_id)}</div>
    <label>Nota de hoy</label>
    <textarea id="noteArea" placeholder="Escribe algo sobre esta clase…">${esc(noteForToday?.body || '')}</textarea>

    <div class="sheet-actions">
      <button class="btn-danger" id="archiveCourse">Archivar</button>
      <button class="btn-primary" id="saveNote">Guardar</button>
    </div>`;

  document.getElementById('sc').onclick = closeSheet;
  document.getElementById('colorRow').onclick = async (ev2) => {
    const opt = ev2.target.closest('.color-opt');
    if (!opt) return;
    document.querySelectorAll('#colorRow .color-opt').forEach((o) => o.classList.remove('sel'));
    opt.classList.add('sel');
    await courseRepo.update(course.id, { color: opt.dataset.c });
    haptic(H.select);
  };
  sheet.querySelectorAll('.chip[data-tid]').forEach((ch) => {
    ch.onclick = () => {
      const w = ch.classList.contains('active');
      sheet.querySelectorAll('.chip[data-tid]').forEach((c) => c.classList.remove('active'));
      if (!w) ch.classList.add('active');
      haptic(H.select);
    };
  });
  document.getElementById('mTagBtn').onclick = () => { haptic(H.tap); closeSheet(); setTimeout(openTagMgr, 320); };
  document.getElementById('saveNote').onclick = async () => {
    const newRoom = document.getElementById('evRoom').value.trim();
    const newProf = document.getElementById('evProf').value.trim();
    const patch = {};
    if (newRoom !== (course.room || '')) patch.room = newRoom || null;
    if (newProf !== (course.professor || '')) patch.professor = newProf || null;
    if (Object.keys(patch).length) await courseRepo.update(course.id, patch);

    const ac = sheet.querySelector('.chip.active');
    const text = document.getElementById('noteArea').value.trim();
    const tid = ac ? ac.dataset.tid : null;
    if (noteForToday) {
      if (!text && !tid) await noteRepo.delete(noteForToday.id);
      else await noteRepo.update(noteForToday.id, { body: text || null, tag_id: tid || null });
    } else if (text || tid) {
      await noteRepo.create({ course_id: course.id, session_date: e.date, body: text || null, tag_id: tid || null });
    }
    await refreshAndRerender();
    haptic(H.save); closeSheet(); toast();
  };
  document.getElementById('archiveCourse').onclick = async () => {
    const { ev: ev2 } = getState();
    const sessions = Object.values(ev2).filter((x) => x.fixed && x._courseId === course.id);
    for (const s of sessions) await classSessionRepo.delete(s._sessionId);
    await courseRepo.delete(course.id);
    await refreshAndRerender();
    haptic(H.del); closeSheet(); toast('Materia archivada');
  };
  openSheet();
}

function openEventDetailSheet(id, e) {
  const noteText = e._eventNotes || '';
  sheet.innerHTML = `
    <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
    <label>Horario</label>
    <p style="font-size:14px;font-weight:500;margin-bottom:2px">${e.day} · ${fH(e.start)} – ${fH(e.end)}</p>
    <label>Evento</label>
    <p style="font-family:'Fraunces',serif;font-style:italic;font-size:20px;font-weight:500;padding-right:30px">${esc(e.name)}</p>
    ${e.room || e.online ? `<p style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--terracotta);margin-top:4px">${e.online ? 'En línea' : esc(e.room)}</p>` : ''}
    <label>Notas</label>
    <textarea id="noteArea" placeholder="Escribe algo…">${esc(noteText)}</textarea>
    <div class="sheet-actions">
      <button class="btn-danger" id="delEv">Eliminar</button>
      <button class="btn-primary" id="saveNote">Guardar</button>
    </div>`;
  document.getElementById('sc').onclick = closeSheet;
  document.getElementById('saveNote').onclick = async () => {
    const text = document.getElementById('noteArea').value.trim();
    await eventRepo.update(e._eventId, { notes: text || null });
    await refreshAndRerender();
    haptic(H.save); closeSheet(); toast();
  };
  document.getElementById('delEv').onclick = async () => {
    await eventRepo.delete(e._eventId);
    await refreshAndRerender();
    haptic(H.del); closeSheet(); toast('Eliminado');
  };
  openSheet();
}

function openNewEvent(preDay, preStart) {
  const startVal = `${String(preStart ?? 15).padStart(2, '0')}:00`;
  const endVal = `${String(Math.min(23, (preStart ?? 15) + 1)).padStart(2, '0')}:00`;
  sheet.innerHTML = `
    <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
    <label>Nombre</label>
    <input type="text" id="neName" placeholder="Ej. Clase de yoga, Seminario…">
    <div class="time-row"><div><label>Día</label><select id="neDay">${DAYS.map((d) => `<option${d === preDay ? ' selected' : ''}>${d}</option>`).join('')}</select></div></div>
    <div class="time-row">
      <div><label>Inicio</label><input type="time" id="neStart" value="${startVal}"></div>
      <div><label>Fin</label><input type="time" id="neEnd" value="${endVal}"></div>
    </div>
    <label>Lugar <span style="font-weight:400;text-transform:none;letter-spacing:0">(opcional)</span></label>
    <input type="text" id="neRoom" placeholder="Ej. S-201 o En línea">
    <div class="sheet-actions"><button class="btn-primary" id="neSave">Crear evento</button></div>`;
  document.getElementById('sc').onclick = closeSheet;
  document.getElementById('neSave').onclick = async () => {
    const name = document.getElementById('neName').value.trim();
    if (!name) { document.getElementById('neName').style.borderColor = 'var(--tag-coral)'; haptic([20, 50, 20]); return; }
    const day = document.getElementById('neDay').value;
    const startStr = document.getElementById('neStart').value;
    const endStr = document.getElementById('neEnd').value;
    if (!startStr || !endStr || endStr <= startStr) { toast('La hora de fin debe ser después del inicio'); haptic([20, 50, 20]); return; }
    const [startH, startM] = startStr.split(':').map(Number);
    const [endH, endM] = endStr.split(':').map(Number);
    const start = startH + startM / 60;
    const end = endH + endM / 60;
    const room = document.getElementById('neRoom').value.trim();
    const online = room.toLowerCase() === 'en línea' || room.toLowerCase() === 'en linea';
    const { activeSchedule } = getState();
    const startsAt = dateForDayInVisibleWeek(day, start);
    const endsAt = dateForDayInVisibleWeek(day, end);
    await eventRepo.create({
      schedule_id: activeSchedule.id,
      title: name,
      location: online ? null : room || null,
      color: '#B8D4F1',
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      recurrence: null,
      notes: null,
    });
    await refreshAndRerender();
    haptic(H.save); closeSheet(); toast('Evento creado');
  };
  openSheet();
}

function openTagMgr() {
  const { allTags } = getState();
  sheet.innerHTML = `
    <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
    <label>Tus etiquetas</label>
    <div id="tagList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
      ${allTags.map((t) => `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;background:var(--surface);transition:var(--theme-t)"><i style="width:10px;height:10px;border-radius:50%;background:${t.color};flex:0 0 auto"></i><span style="flex:1;font-size:13px;font-weight:600">${esc(t.name)}</span><button data-del="${t.id}" style="border:none;background:none;color:var(--tag-coral);font-size:13px;cursor:pointer;padding:4px 8px">×</button></div>`).join('')}
    </div>
    <label>Nueva etiqueta</label>
    <input type="text" id="ntName" placeholder="Nombre de la etiqueta" style="margin-bottom:8px">
    <label>Color</label>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px" id="colorPick">
      ${TAG_COLOR_PALETTE.map((c) => `<div class="color-opt" data-c="${c}" style="background:${c}"></div>`).join('')}
    </div>
    <div class="sheet-actions"><button class="btn-primary" id="ntSave">Agregar etiqueta</button></div>`;
  document.getElementById('sc').onclick = closeSheet;
  let selC = TAG_COLOR_PALETTE[0];
  document.querySelector(`.color-opt[data-c="${selC}"]`).classList.add('sel');
  document.getElementById('colorPick').onclick = (e) => {
    const o = e.target.closest('.color-opt');
    if (!o) return;
    document.querySelectorAll('#colorPick .color-opt').forEach((x) => x.classList.remove('sel'));
    o.classList.add('sel');
    selC = o.dataset.c;
    haptic(H.select);
  };
  document.getElementById('ntSave').onclick = async () => {
    const name = document.getElementById('ntName').value.trim();
    if (!name) { document.getElementById('ntName').style.borderColor = 'var(--tag-coral)'; haptic([20, 50, 20]); return; }
    await tagRepo.create({ name, color: selC });
    await refreshEv();
    haptic(H.save); closeSheet(); toast('Etiqueta creada');
  };
  document.getElementById('tagList').onclick = async (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    await tagRepo.delete(btn.dataset.del);
    await refreshAndRerender();
    haptic(H.del); closeSheet(); toast('Etiqueta eliminada');
  };
  openSheet();
}

/* ======== SYNC STATUS DOT ======== */
function renderSyncDot() {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  dot.dataset.status = getSyncStatus();
  onSyncStatusChange((status) => { dot.dataset.status = status; });
}

/* ======== Redibuja todo lo que depende de datos compartidos ======== */
async function refreshAndRerender() {
  await refreshEv();
  renderGrid(); renderToday(); renderWeek(); renderCurrentPanels();
}
function renderCurrentPanels() {
  renderMaterias();
  renderTasksPanel();
  renderScheduleHeader();
  renderTodayExtras();
  renderNotesSection();
}
function renderTodayExtras() {
  const { ev, allTasks } = getState();
  const tasksEl = document.getElementById('todayTasks');
  const classesEl = document.getElementById('todayClasses');
  if (tasksEl) {
    const now = new Date();
    const endOfDay = new Date(now); endOfDay.setHours(23, 59, 59, 999);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todays = allTasks.filter((t) => !t.done && !t.deleted_at && t.due_at && new Date(t.due_at) <= endOfDay && new Date(t.due_at) >= startOfDay);
    tasksEl.innerHTML = todays.length
      ? todays.map((t) => `<div class="task-row"><div class="task-body"><p class="task-title">${esc(t.title)}</p></div></div>`).join('')
      : `<p class="tasks-empty">Sin tareas para hoy ✨</p>`;
  }
  if (classesEl) {
    const todays = Object.values(ev).filter((e) => e.day === today).sort((a, b) => a.start - b.start);
    classesEl.innerHTML = todays.length
      ? todays.map((e) => `<div class="task-row"><div class="task-body"><p class="task-title">${esc(e.name)}</p><p class="task-due">${fH(e.start)} – ${fH(e.end)}${e.room ? ' · ' + esc(e.room) : ''}</p></div></div>`).join('')
      : `<p class="tasks-empty">Día libre — sin clases hoy.</p>`;
  }
}

/* ======== PARALLAX, PULL TO REFRESH, EXPORT, COMPARTIR ======== */
function bindParallax() {
  const heroTitle = document.querySelector('.panel-hoy .hero-left h1');
  const scroller = document.getElementById('panelHoy');
  if (!heroTitle || !scroller) return;
  let ticking = false;
  scroller.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = Math.max(0, scroller.scrollTop);
      heroTitle.style.setProperty('--parallax', y * 0.25 + 'px');
      heroTitle.style.opacity = Math.max(0.3, 1 - y / 180);
      ticking = false;
    });
  }, { passive: true });
}

function bindPullToRefresh() {
  const ptr = document.getElementById('ptr');
  let sy = 0, pulling = false, dist = 0;
  const THRESH = 70;
  window.addEventListener('touchstart', (e) => {
    if (document.querySelector('.sheet.open')) return;
    const visible = document.querySelector('.app-panel[style*="display: block"], .app-panel[style*="display: flex"]');
    if (visible && visible.scrollTop > 0) return;
    sy = e.touches[0].clientY; pulling = true; dist = 0;
  }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    dist = e.touches[0].clientY - sy;
    if (dist <= 0) { ptr.style.opacity = 0; return; }
    const p = Math.min(dist / THRESH, 1);
    ptr.style.opacity = p;
    ptr.style.transform = `translateX(-50%) translateY(${Math.min(dist * 0.5, 50)}px) rotate(${dist * 2}deg)`;
  }, { passive: true });
  window.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    if (dist > THRESH) {
      haptic(15);
      ptr.classList.add('spinning');
      ptr.style.opacity = 1;
      setTimeout(async () => {
        await refreshAndRerender();
        renderCountdown();
        ptr.classList.remove('spinning');
        ptr.style.transform = ''; ptr.style.opacity = 0;
        toast('Actualizado');
      }, 500);
    } else {
      ptr.style.transform = ''; ptr.style.opacity = 0;
    }
    dist = 0;
  });
}

function bindExport() {
  document.getElementById('exportBtn')?.addEventListener('click', async () => {
    haptic(H.tap);
    const choice = await chooseExportFormat();
    const { allCourses, ev, activeSchedule } = getState();
    if (choice === 'png') await exportGridAsPNG();
    else if (choice === 'ics') exportScheduleAsICS(allCourses, Object.values(ev), activeSchedule);
  });
}
function chooseExportFormat() {
  return new Promise((resolve) => {
    sheet.innerHTML = `
      <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
      <label>Exportar horario</label>
      <div class="sheet-actions" style="flex-direction:column">
        <button class="btn-primary" id="expPng">Como imagen (PNG)</button>
        <button class="btn-primary" id="expIcs">Como calendario (.ics)</button>
      </div>`;
    document.getElementById('sc').onclick = () => { closeSheet(); resolve(null); };
    document.getElementById('expPng').onclick = () => { closeSheet(); resolve('png'); };
    document.getElementById('expIcs').onclick = () => { closeSheet(); resolve('ics'); };
    openSheet();
  });
}

function bindShare() {
  document.getElementById('shareBtn')?.addEventListener('click', async () => {
    haptic(H.tap);
    const { activeSchedule, allCourses } = getState();
    const text = `Mi horario "${activeSchedule?.name || ''}" -- ${allCourses.length} materias. Hecho con Mi Horario.`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Mi Horario', text }); } catch {}
    } else {
      try { await navigator.clipboard.writeText(text); toast('Copiado al portapapeles'); } catch { toast('No se pudo compartir'); }
    }
  });
}

/* ======== INIT ========
   bindLegacyAppOnce() ata los listeners del DOM -- una sola vez en la
   vida de la página. loadAndRenderApp() carga datos y renderiza -- se
   repite cada vez que main.js entra a /app (puede ser otra cuenta sin
   que la pestaña se haya recargado). */
let domBound = false;
export function bindLegacyAppOnce() {
  if (domBound) return;
  domBound = true;
  document.getElementById('settingsBtn').onclick = () => navigate('/ajustes/seguridad');
  mountThemeMenu(document.getElementById('themeMenuMount'));
  bindNav();
  bindParallax();
  bindPullToRefresh();
  bindExport();
  bindShare();
  bindMateriasSearch();
  setCourseClickHandler(openCourseDetailById);
  setTasksMutatedHandler(refreshAndRerender);
  setNotesMutatedHandler(refreshAndRerender);
  document.getElementById('weekPrev').onclick = () => { haptic(H.tap); goToWeek(weekOffset - 1); };
  document.getElementById('weekNext').onclick = () => { haptic(H.tap); goToWeek(weekOffset + 1); };
  document.getElementById('todayFloatBtn').onclick = () => { haptic(H.tap); goToWeek(0); };
  document.getElementById('addEventBtn').onclick = () => { haptic(H.tap); openNewEvent(today || 'Lunes', new Date().getHours()); };
  document.getElementById('addMateriaBtn').onclick = () => { haptic(H.tap); openAddMateriaSheet(refreshAndRerender); };
  document.getElementById('addTaskBtn').onclick = () => { haptic(H.tap); openAddTaskSheet(refreshAndRerender); };
  document.getElementById('quickAddTask').onclick = () => { haptic(H.tap); openAddTaskSheet(refreshAndRerender); };
  document.getElementById('quickAddMateria').onclick = () => { haptic(H.tap); openAddMateriaSheet(refreshAndRerender); };
  document.getElementById('quickAddNota').onclick = () => { haptic(H.tap); openAddNoteSheet(refreshAndRerender); };
  document.getElementById('switchScheduleBtn').onclick = () => {
    haptic(H.tap);
    openScheduleSwitcher(async () => { weekOffset = 0; setWeekOffset(0); resetSeedCache(); await refreshAndRerender(); renderWeekLabel(); });
  };
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
  window.addEventListener('sync:data-changed', refreshAndRerender);
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = setInterval(renderCountdown, 30000);
}

export async function loadAndRenderApp() {
  resetSeedCache();
  weekOffset = 0;
  setWeekOffset(0);
  await refreshEv();
  await migrateLocalStorageEntitiesIfNeeded();
  await refreshEv(); // por si la migración creó tags/notas/tareas nuevas
  renderToday(); renderWeek(); renderGrid(); renderCountdown();
  renderWeekLabel();
  renderSyncDot();
  renderCurrentPanels();
  setActiveTab('hoy');

  if (today) {
    const el = document.querySelector(`.col-head[data-day="${today}"]`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ inline: 'start', block: 'nearest' }));
  }
}

export function openCourseDetailById(courseId) {
  const { ev } = getState();
  const entry = Object.values(ev).find((x) => x.fixed && x._courseId === courseId);
  openCourseDetailSheet(entry || { fixed: true, _courseId: courseId, date: new Date().toISOString().slice(0, 10) });
}

export { refreshAndRerender as afterExternalMutation };
