// La app original (grid, today card, notas, tags, pendientes, polish
// iOS) tal cual estaba, movida de index.html a un módulo real. Notas,
// tags y pendientes SIGUEN en localStorage (se migran en Fase 4) --
// solo las "materias" (clases fijas -> courses+class_sessions) y los
// eventos sueltos (-> events) ahora pasan por los repos + IndexedDB +
// sync, en vez de guardarse planos en localStorage.
import { scheduleRepo } from './data/repositories/scheduleRepo.js';
import { courseRepo } from './data/repositories/courseRepo.js';
import { classSessionRepo } from './data/repositories/classSessionRepo.js';
import { eventRepo } from './data/repositories/eventRepo.js';
import { onSyncStatusChange, getSyncStatus } from './data/syncStatus.js';
import { navigate } from './router.js';
import { mountThemeMenu } from './themes/themeMenu.js';

/* ======== DATA ======== */
// Horario por default para cuentas nuevas sin materias todavía (hasta
// que exista onboarding real en Fase 6).
const DEF_SCHED = {
  Lunes: [
    { s: 15, e: 17, n: 'Educación para el dibujo 1', r: 'T-205' },
    { s: 17, e: 20, n: 'Diseño integrador 1', r: 'S-201' },
  ],
  Martes: [
    { s: 15, e: 17, n: 'Tipografía 1', ol: 1 },
    { s: 17, e: 20, n: 'Introducción a la Teoría de Diseño y Estética', ol: 1 },
  ],
  Miércoles: [
    { s: 14, e: 16, n: 'Procesos de Representación Bidimensional 1', r: 'TI-6' },
    { s: 17, e: 19, n: 'Diseño integrador 1', r: 'S-201' },
  ],
  Jueves: [
    { s: 16, e: 18, n: 'Análisis de textos y redacción', ol: 1 },
    { s: 18, e: 20, n: 'Recursos Tecnológicos para el Diseño', ol: 1 },
  ],
  Viernes: [
    { s: 14, e: 16, n: 'Geometría', r: 'S-203' },
    { s: 17, e: 19, n: 'Educación para el dibujo 1', r: 'T-205' },
  ],
  Sábado: [],
  Domingo: [],
};
const DEF_TAGS = [
  { id: 't1', label: 'Tarea pendiente', color: 'blue' },
  { id: 't2', label: 'Problema', color: 'purple' },
  { id: 't3', label: 'Clase libre', color: 'gold' },
];
const TAG_COLORS = {
  blue: { h: '#7C93A8', l: 'Azul' },
  purple: { h: '#96738F', l: 'Morado' },
  gold: { h: '#C7A34C', l: 'Dorado' },
  green: { h: '#7BA87C', l: 'Verde' },
  coral: { h: '#C4726C', l: 'Coral' },
  rose: { h: '#E8C4B8', l: 'Rosé' },
  terracotta: { h: '#B87355', l: 'Terracota' },
};
const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DS = { Lunes: 'Lun', Martes: 'Mar', Miércoles: 'Mié', Jueves: 'Jue', Viernes: 'Vie', Sábado: 'Sáb', Domingo: 'Dom' };
const JSD = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const today = JSD[new Date().getDay()] || '';

// day_of_week de Postgres: 0=domingo...6=sábado (igual que Date.getDay()).
const DAY_TO_NUM = { Domingo: 0, Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5, Sábado: 6 };
const NUM_TO_DAY = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const COURSE_COLORS = ['#B8D4F1', '#A8D8B9', '#F4C6A5', '#F5B5B5', '#D4B8E8', '#F5E1A8', '#C5E1D4'];

/* ======== HAPTICS ======== */
const haptic = (p = 8) => { try { navigator.vibrate?.(p); } catch {} };
const H = { tap: 6, select: 8, save: [10, 40, 10], toggle: 10, check: 12, del: [15, 30, 15], open: 6, close: 5 };

/* ======== STORAGE (solo notas/tags/pendientes -- ver nota arriba) ======== */
const G = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const P = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
let tags = G('h-tags') || [...DEF_TAGS];
let notes = G('h-notes') || {};
let todos = G('h-todos') || [];
function save() {
  P('h-tags', tags);
  P('h-notes', notes);
  P('h-todos', todos);
}

/* ======== MATERIAS / EVENTOS: repos + IndexedDB + sync ======== */
// `ev` sigue siendo el objeto plano {id: {name,day,start,end,room,online,fixed}}
// que ya esperaba todo el código de render de abajo -- así ese código no
// se toca. Se recalcula desde los repos con refreshEv().
let ev = {};
let activeSchedule = null;

function parseTimeHour(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h + (m || 0) / 60;
}

function dateForDayHour(dayName, hour) {
  const dayIdx = DAYS.indexOf(dayName); // 0=Lunes...6=Domingo
  const jsToday = new Date().getDay(); // 0=Domingo...6=Sábado
  const mondayBasedToday = jsToday === 0 ? 6 : jsToday - 1;
  const d = new Date();
  d.setDate(d.getDate() + (dayIdx - mondayBasedToday));
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return d;
}

// Primera vez que esta cuenta abre la app: siembra el horario de
// ejemplo como courses+class_sessions reales. Si ya tiene un horario
// (propio o bajado por sync de otro dispositivo), no hace nada -- por
// eso hay que esperar el primer pull() antes de llamar esto (lo
// garantiza main.js).
//
// refreshEv() puede dispararse más de una vez casi al mismo tiempo (ej.
// el navigate('/app') explícito del login y el listener de
// onAuthStateChange, ambos reaccionando al mismo inicio de sesión) --
// se cachea la promesa para que, sin importar cuántas veces se llame,
// la siembra de verdad corra una sola vez.
let ensureSeedPromise = null;
function ensureSeedData() {
  if (!ensureSeedPromise) ensureSeedPromise = doEnsureSeedData();
  return ensureSeedPromise;
}

async function doEnsureSeedData() {
  const schedules = await scheduleRepo.list();
  const existing = schedules.find((s) => s.is_active) || schedules[0];
  if (existing) return existing;

  const schedule = await scheduleRepo.create({ name: 'Mi horario', is_active: true });
  const courseByName = new Map();
  let colorIdx = 0;
  for (const day of DAYS) {
    for (const c of DEF_SCHED[day] || []) {
      let course = courseByName.get(c.n);
      if (!course) {
        course = await courseRepo.create({
          schedule_id: schedule.id,
          name: c.n,
          room: c.ol ? null : c.r || null,
          color: COURSE_COLORS[colorIdx++ % COURSE_COLORS.length],
        });
        courseByName.set(c.n, course);
      }
      await classSessionRepo.create({
        course_id: course.id,
        day_of_week: DAY_TO_NUM[day],
        start_time: `${String(c.s).padStart(2, '0')}:00`,
        end_time: `${String(c.e).padStart(2, '0')}:00`,
      });
    }
  }
  return schedule;
}

async function refreshEv() {
  activeSchedule = await ensureSeedData();
  const courses = await courseRepo.listBySchedule(activeSchedule.id);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const sessions = await classSessionRepo.listByCourses(courses.map((c) => c.id));
  const events = await eventRepo.listBySchedule(activeSchedule.id);

  const next = {};
  for (const s of sessions) {
    const course = courseById.get(s.course_id);
    if (!course) continue;
    next[s.id] = {
      name: course.name,
      day: NUM_TO_DAY[s.day_of_week],
      start: parseTimeHour(s.start_time),
      end: parseTimeHour(s.end_time),
      room: course.room || '',
      online: !course.room,
      fixed: true,
      _courseId: course.id,
    };
  }
  for (const e of events) {
    const s = new Date(e.starts_at);
    const en = new Date(e.ends_at);
    next[e.id] = {
      name: e.title,
      day: NUM_TO_DAY[s.getDay()],
      start: s.getHours() + s.getMinutes() / 60,
      end: en.getHours() + en.getMinutes() / 60,
      room: e.location || '',
      online: !e.location,
      fixed: false,
      _eventId: e.id,
    };
  }
  ev = next;
}

/* ======== HELPERS ======== */
function fH(h) {
  const hh = h % 12 === 0 ? 12 : h % 12;
  return hh + (h >= 12 ? ' pm' : ' am');
}
function toast(m) {
  const t = document.getElementById('toast');
  t.textContent = m || 'Guardado';
  t.classList.add('show');
  clearTimeout(toast._);
  toast._ = setTimeout(() => t.classList.remove('show'), 1600);
}
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

/* ======== GRID RANGE ======== */
function gridRange() {
  const all = Object.values(ev);
  if (!all.length) return { gs: 8, ge: 22 };
  let mn = 24, mx = 0;
  all.forEach((e) => {
    if (e.start < mn) mn = e.start;
    if (e.end > mx) mx = e.end;
  });
  return { gs: Math.max(0, mn - 1), ge: Math.min(24, mx + 1) };
}

/* ======== TODAY CARD ======== */
function renderToday() {
  const c = document.getElementById('todayCard');
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
    const cur = te.find((e) => h >= e.start && h < e.end);
    if (cur) d += ` Ahora: <b>${esc(cur.name)}</b>.`;
    else {
      const nx = te.find((e) => e.start > h);
      if (nx) d += ` Siguiente: <b>${esc(nx.name)}</b> a las <b>${fH(nx.start)}</b>.`;
    }
  }
  c.innerHTML = `<p class="today-greeting">${gr}</p><p class="today-detail">${d}</p>`;
}

function renderWeek() {
  const all = Object.values(ev);
  const total = all.length;
  const h = new Date().getHours();
  const di = DAYS.indexOf(today);
  const done = all.filter((e) => {
    const ei = DAYS.indexOf(e.day);
    return ei < di || (ei === di && e.end <= h);
  }).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  document.getElementById('weekFill').style.width = pct + '%';
  document.getElementById('weekLbl').textContent = done + ' / ' + total + ' esta semana';
}

/* ======== CALENDAR GRID ======== */
function renderGrid() {
  const grid = document.getElementById('calGrid');
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
    h.className = 'col-head' + (day === today ? ' is-today' : '');
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
    const loc = e.online ? 'En línea' : e.room || '';
    b.innerHTML =
      `<div><div class="bt">${fH(e.start)}</div><div class="bn">${esc(e.name)}</div></div>` +
      (loc ? `<div class="br">${esc(loc)}</div>` : '') +
      `<span class="tap-hint">›</span>`;
    const nd = notes[id];
    if (nd && (nd.text || nd.tag)) {
      const dot = document.createElement('div');
      dot.className = 'n-dot';
      const tg = tags.find((t) => t.id === nd.tag);
      dot.style.background = tg ? TAG_COLORS[tg.color]?.h : 'var(--ink2)';
      dot.style.color = tg ? TAG_COLORS[tg.color]?.h : 'var(--ink2)';
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
}

function renderNowLine(gs) {
  if (gs === undefined) { const r = gridRange(); gs = r.gs; }
  const grid = document.getElementById('calGrid');
  grid.querySelectorAll('.now-line').forEach((n) => n.remove());
  if (!today) return;
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

/* ======== SHEETS ======== */
const backdrop = document.getElementById('backdrop');
const sheet = document.getElementById('sheet');
function openSheet() { backdrop.classList.add('open'); sheet.classList.add('open'); haptic(H.open); }
function closeSheet() { backdrop.classList.remove('open'); sheet.classList.remove('open'); sheet.style.transform = ''; haptic(H.close); }
backdrop.onclick = closeSheet;

/* --- Swipe-down to close sheet --- */
(function () {
  let sy = 0, cy = 0, drag = false, startTs = 0;
  sheet.addEventListener('pointerdown', (e) => {
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

function openEvSheet(id) {
  const e = ev[id];
  if (!e) return;
  const nd = notes[id] || {};
  sheet.innerHTML = `
    <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
    <label>Horario</label>
    <p style="font-size:14px;font-weight:500;margin-bottom:2px">${e.day} · ${fH(e.start)} – ${fH(e.end)}</p>
    <label>Clase / evento</label>
    <p style="font-family:'Fraunces',serif;font-style:italic;font-size:20px;font-weight:500;padding-right:30px">${esc(e.name)}</p>
    ${
      e.fixed
        ? `<label>Aula</label><input type="text" id="evRoom" value="${esc(e.room || '')}" placeholder="Vacío = en línea">`
        : e.room || e.online
        ? `<p style="font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--terracotta);margin-top:4px">${e.online ? 'En línea' : esc(e.room)}</p>`
        : ''
    }
    <label>Etiqueta</label>
    <div class="chip-row" id="chipRow">
      ${tags.map((t) => `<div class="chip${nd.tag === t.id ? ' active' : ''}" data-c="${t.color}" data-tid="${t.id}"><i style="background:${TAG_COLORS[t.color]?.h || 'var(--ink2)'}"></i>${esc(t.label)}</div>`).join('')}
      <button class="chip-add" id="mTagBtn">+ Crear</button>
    </div>
    <label>Notas</label>
    <textarea id="noteArea" placeholder="Escribe algo sobre esta clase…">${esc(nd.text || '')}</textarea>
    <div class="sheet-actions">
      ${e.fixed ? '' : '<button class="btn-danger" id="delEv">Eliminar</button>'}
      <button class="btn-primary" id="saveNote">Guardar</button>
    </div>`;
  document.getElementById('sc').onclick = closeSheet;
  document.getElementById('saveNote').onclick = async () => {
    const ac = sheet.querySelector('.chip.active');
    const text = document.getElementById('noteArea').value.trim();
    const tid = ac ? ac.dataset.tid : null;
    if (!text && !tid) delete notes[id];
    else notes[id] = { text, tag: tid };
    save();
    if (e.fixed) {
      const newRoom = document.getElementById('evRoom').value.trim();
      if (newRoom !== (e.room || '')) {
        await courseRepo.update(e._courseId, { room: newRoom || null });
        await refreshEv();
      }
    }
    renderGrid();
    haptic(H.save);
    closeSheet();
    toast();
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
  const del = document.getElementById('delEv');
  if (del) {
    del.onclick = async () => {
      await eventRepo.delete(e._eventId);
      delete notes[id];
      save();
      await refreshEv();
      renderGrid(); renderToday(); renderWeek();
      haptic(H.del); closeSheet(); toast('Eliminado');
    };
  }
  openSheet();
}

function openNewEvent(preDay, preStart) {
  const { gs, ge } = gridRange();
  const hours = [];
  for (let h = Math.max(0, gs - 2); h < Math.min(24, ge + 2); h++) hours.push(h);
  sheet.innerHTML = `
    <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
    <label>Nombre</label>
    <input type="text" id="neName" placeholder="Ej. Clase de yoga, Seminario…">
    <div class="time-row"><div><label>Día</label><select id="neDay">${DAYS.map((d) => `<option${d === preDay ? ' selected' : ''}>${d}</option>`).join('')}</select></div></div>
    <div class="time-row">
      <div><label>Inicio</label><select id="neStart">${hours.map((h) => `<option value="${h}"${h === preStart ? ' selected' : ''}>${fH(h)}</option>`).join('')}</select></div>
      <div><label>Fin</label><select id="neEnd">${hours.map((h) => `<option value="${h}"${h === preStart + 1 ? ' selected' : ''}>${fH(h)}</option>`).join('')}</select></div>
    </div>
    <label>Lugar <span style="font-weight:400;text-transform:none;letter-spacing:0">(opcional)</span></label>
    <input type="text" id="neRoom" placeholder="Ej. S-201 o En línea">
    <div class="sheet-actions"><button class="btn-primary" id="neSave">Crear evento</button></div>`;
  document.getElementById('sc').onclick = closeSheet;
  document.getElementById('neSave').onclick = async () => {
    const name = document.getElementById('neName').value.trim();
    if (!name) { document.getElementById('neName').style.borderColor = 'var(--tag-coral)'; haptic([20, 50, 20]); return; }
    const day = document.getElementById('neDay').value;
    const start = +document.getElementById('neStart').value;
    const end = +document.getElementById('neEnd').value;
    if (end <= start) { toast('La hora de fin debe ser después del inicio'); haptic([20, 50, 20]); return; }
    const room = document.getElementById('neRoom').value.trim();
    const online = room.toLowerCase() === 'en línea' || room.toLowerCase() === 'en linea';
    const startsAt = dateForDayHour(day, start);
    const endsAt = dateForDayHour(day, end);
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
    await refreshEv();
    renderGrid(); renderToday(); renderWeek();
    haptic(H.save); closeSheet(); toast('Evento creado');
  };
  openSheet();
}

function openTagMgr() {
  const ck = Object.keys(TAG_COLORS);
  sheet.innerHTML = `
    <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
    <label>Tus etiquetas</label>
    <div id="tagList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
      ${tags.map((t) => `<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:12px;background:var(--surface);transition:var(--theme-t)"><i style="width:10px;height:10px;border-radius:50%;background:${TAG_COLORS[t.color]?.h};flex:0 0 auto"></i><span style="flex:1;font-size:13px;font-weight:600">${esc(t.label)}</span><button data-del="${t.id}" style="border:none;background:none;color:var(--tag-coral);font-size:13px;cursor:pointer;padding:4px 8px">×</button></div>`).join('')}
    </div>
    <label>Nueva etiqueta</label>
    <input type="text" id="ntName" placeholder="Nombre de la etiqueta" style="margin-bottom:8px">
    <label>Color</label>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px" id="colorPick">
      ${ck.map((c) => `<div class="color-opt" data-c="${c}" style="background:${TAG_COLORS[c].h}"></div>`).join('')}
    </div>
    <div class="sheet-actions"><button class="btn-primary" id="ntSave">Agregar etiqueta</button></div>`;
  document.getElementById('sc').onclick = closeSheet;
  let selC = ck[0];
  document.querySelector(`.color-opt[data-c="${selC}"]`).classList.add('sel');
  document.getElementById('colorPick').onclick = (e) => {
    const o = e.target.closest('.color-opt');
    if (!o) return;
    document.querySelectorAll('.color-opt').forEach((x) => x.classList.remove('sel'));
    o.classList.add('sel');
    selC = o.dataset.c;
    haptic(H.select);
  };
  document.getElementById('ntSave').onclick = () => {
    const label = document.getElementById('ntName').value.trim();
    if (!label) { document.getElementById('ntName').style.borderColor = 'var(--tag-coral)'; haptic([20, 50, 20]); return; }
    tags.push({ id: 't' + Date.now(), label, color: selC });
    save(); haptic(H.save); closeSheet(); toast('Etiqueta creada');
  };
  document.getElementById('tagList').onclick = (e) => {
    const btn = e.target.closest('[data-del]');
    if (!btn) return;
    const tid = btn.dataset.del;
    tags = tags.filter((t) => t.id !== tid);
    Object.keys(notes).forEach((k) => { if (notes[k].tag === tid) delete notes[k].tag; });
    save(); haptic(H.del); closeSheet(); renderGrid(); toast('Etiqueta eliminada');
  };
  openSheet();
}

/* ======== TODO with swipe (localStorage, sin cambios) ======== */
const todoInputRow = document.getElementById('todoInputRow');
const todoInput = document.getElementById('todoInput');
document.getElementById('showTodoInput').onclick = () => {
  const isOpen = todoInputRow.classList.contains('open');
  todoInputRow.classList.toggle('open');
  haptic(H.tap);
  if (!isOpen) setTimeout(() => todoInput.focus(), 200);
};
function addTodo() {
  const t = todoInput.value.trim();
  if (!t) return;
  todos.unshift({ text: t, done: false });
  save(); renderTodos(); todoInput.value = ''; haptic(H.save);
}
document.getElementById('todoAdd').onclick = addTodo;
todoInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addTodo(); });

function renderTodos() {
  const list = document.getElementById('todoList');
  const empty = document.getElementById('todoEmpty');
  list.innerHTML = '';
  if (!todos.length) { empty.style.display = ''; return; }
  empty.style.display = 'none';
  todos.forEach((td, i) => {
    const shell = document.createElement('div');
    shell.className = 'todo-shell';
    shell.innerHTML = `
      <div class="todo-actions-l">✓ Hecho</div>
      <div class="todo-actions-r">Eliminar</div>
      <div class="todo-item${td.done ? ' done' : ''}" data-i="${i}">
        <div class="todo-check${td.done ? ' done' : ''}"></div>
        <span class="todo-text">${esc(td.text)}</span>
      </div>`;
    const item = shell.querySelector('.todo-item');
    item.querySelector('.todo-check').onclick = (e) => { e.stopPropagation(); todos[i].done = !todos[i].done; save(); renderTodos(); haptic(H.check); };
    attachTodoSwipe(shell, item, i);
    list.appendChild(shell);
  });
}

function attachTodoSwipe(shell, item, idx) {
  let sx = 0, sy = 0, dx = 0, dy = 0, drag = false, locked = null;
  const SWIPE_THRESH = 88;
  item.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.todo-check')) return;
    sx = e.clientX; sy = e.clientY; dx = 0; dy = 0; drag = true; locked = null;
    item.classList.add('dragging');
  });
  item.addEventListener('pointermove', (e) => {
    if (!drag) return;
    dx = e.clientX - sx; dy = e.clientY - sy;
    if (locked === null) {
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    }
    if (locked === 'x') {
      e.preventDefault?.();
      item.style.transform = `translateX(${dx}px)`;
    }
  }, { passive: false });
  const end = () => {
    if (!drag) return;
    drag = false; item.classList.remove('dragging');
    if (locked === 'x') {
      if (dx > SWIPE_THRESH) {
        item.style.transform = `translateX(100%)`; haptic(H.check);
        setTimeout(() => { todos[idx].done = !todos[idx].done; save(); renderTodos(); }, 180);
      } else if (dx < -SWIPE_THRESH) {
        item.style.transform = `translateX(-100%)`; haptic(H.del);
        setTimeout(() => { todos.splice(idx, 1); save(); renderTodos(); }, 180);
      } else {
        item.style.transform = '';
      }
    } else {
      item.style.transform = '';
    }
    dx = 0; dy = 0; locked = null;
  };
  item.addEventListener('pointerup', end);
  item.addEventListener('pointercancel', end);
  item.addEventListener('pointerleave', end);
}

/* ======== SYNC STATUS DOT + ENGRANE DE AJUSTES ======== */
function renderSyncDot() {
  const dot = document.getElementById('syncDot');
  if (!dot) return;
  dot.dataset.status = getSyncStatus();
  onSyncStatusChange((status) => { dot.dataset.status = status; });
}

/* ======== FAB ======== */
document.getElementById('fab').onclick = () => { haptic(H.tap); openNewEvent(today || 'Lunes', new Date().getHours()); };

/* ======== PARALLAX HEADER ======== */
const heroTitle = document.querySelector('.hero-left h1');
let ticking = false;
window.addEventListener('scroll', () => {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    const y = Math.max(0, window.scrollY);
    heroTitle.style.setProperty('--parallax', y * 0.25 + 'px');
    heroTitle.style.opacity = Math.max(0.3, 1 - y / 180);
    ticking = false;
  });
}, { passive: true });

/* ======== PULL-TO-REFRESH ======== */
(function () {
  const ptr = document.getElementById('ptr');
  let sy = 0, pulling = false, dist = 0;
  const THRESH = 70;
  window.addEventListener('touchstart', (e) => {
    if (window.scrollY > 0) return;
    if (document.querySelector('.sheet.open')) return;
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
        await refreshEv();
        renderToday(); renderWeek(); renderGrid(); renderTodos();
        ptr.classList.remove('spinning');
        ptr.style.transform = ''; ptr.style.opacity = 0;
        toast('Actualizado');
      }, 500);
    } else {
      ptr.style.transform = ''; ptr.style.opacity = 0;
    }
    dist = 0;
  });
})();

/* ======== INIT ========
   Separado en dos: bindLegacyAppOnce() ata los listeners del DOM -- eso
   sí debe pasar una sola vez en la vida de la página, repetirlo
   duplicaría handlers. loadAndRenderApp() carga datos y renderiza --
   eso SÍ debe repetirse cada vez que main.js entra a /app, porque puede
   ser una usuaria distinta a la de la última vez sin que la pestaña se
   haya recargado (cerrar sesión + entrar con otra cuenta). */
let domBound = false;
export function bindLegacyAppOnce() {
  if (domBound) return;
  domBound = true;
  document.getElementById('settingsBtn').onclick = () => navigate('/ajustes/seguridad');
  mountThemeMenu(document.getElementById('themeMenuMount'));
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
  window.addEventListener('sync:data-changed', async () => {
    await refreshEv();
    renderGrid(); renderToday(); renderWeek();
  });
}

export async function loadAndRenderApp() {
  // ensureSeedPromise es una caché para evitar sembrar dos veces en
  // paralelo DENTRO de una misma sesión de usuaria -- si esta llamada es
  // para una cuenta distinta a la anterior, hay que soltarla.
  ensureSeedPromise = null;
  await refreshEv();
  renderToday(); renderWeek(); renderGrid(); renderTodos();
  renderSyncDot();

  if (today) {
    const el = document.querySelector(`.col-head[data-day="${today}"]`);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ inline: 'start', block: 'nearest' }));
  }
}
