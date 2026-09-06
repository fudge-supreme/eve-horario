// Onboarding de 5 pasos, post-signup: bienvenida, crear primer horario,
// agregar primera materia (opcional), elegir tema, permiso de
// notificaciones. Al terminar marca profiles.onboarded_at -- el guard
// en main.js manda aquí a cualquier sesión sin ese campo.
import { supabase } from '../data/supabase.js';
import { navigate } from '../router.js';
import { scheduleRepo } from '../data/repositories/scheduleRepo.js';
import { courseRepo } from '../data/repositories/courseRepo.js';
import { classSessionRepo } from '../data/repositories/classSessionRepo.js';
import { THEME_OPTIONS, setTheme } from '../themes/theme.js';
import { activatePush } from '../app/push.js';

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const DAY_TO_NUM = { Domingo: 0, Lunes: 1, Martes: 2, Miércoles: 3, Jueves: 4, Viernes: 5, Sábado: 6 };
const STEP_COUNT = 5;

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}
function pad2(n) { return String(n).padStart(2, '0'); }
function fmtHour(h) { const hh = h % 12 === 0 ? 12 : h % 12; return hh + (h >= 12 ? ' pm' : ' am'); }
function hoursOptions(selected) {
  const opts = [];
  for (let h = 6; h <= 22; h++) opts.push(`<option value="${h}"${h === selected ? ' selected' : ''}>${fmtHour(h)}</option>`);
  return opts.join('');
}

export async function renderOnboarding(container) {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) { navigate('/landing'); return; }
  const userId = session.user.id;

  let step = 0;
  let displayName = session.user.user_metadata?.display_name || '';
  let activeSchedule = null;
  let selectedTheme = 'coursicle-soft';

  function progressDots() {
    return `<div style="display:flex;gap:6px;justify-content:center;margin-bottom:22px">
      ${Array.from({ length: STEP_COUNT }, (_, i) => `<span style="width:${i === step ? 20 : 7}px;height:7px;border-radius:4px;background:${i <= step ? 'var(--terracotta)' : 'var(--line)'};transition:width .2s var(--ease-out),background-color .2s"></span>`).join('')}
    </div>`;
  }

  function shell(inner) {
    container.innerHTML = `
      <div class="auth-page">
        <div class="auth-card" style="max-width:440px">
          ${progressDots()}
          ${inner}
        </div>
      </div>`;
  }

  function paint() {
    if (step === 0) paintBienvenida();
    else if (step === 1) paintHorario();
    else if (step === 2) paintMateria();
    else if (step === 3) paintTema();
    else paintNotificaciones();
  }

  function paintBienvenida() {
    shell(`
      <p class="auth-eyebrow">Mi Horario</p>
      <h2 class="auth-title">¡Bienvenida!</h2>
      <p class="auth-subtitle">Antes de empezar, ¿cómo te llamamos?</p>
      <div class="auth-field"><label for="obName">Nombre</label><input type="text" id="obName" value="${esc(displayName)}" placeholder="Tu nombre"></div>
      <button class="auth-btn-primary" id="obNext">Continuar</button>`);
    container.querySelector('#obNext').onclick = async () => {
      displayName = container.querySelector('#obName').value.trim();
      if (displayName) await supabase.from('profiles').update({ display_name: displayName }).eq('id', userId);
      step++; paint();
    };
  }

  function paintHorario() {
    shell(`
      <p class="auth-eyebrow">Paso 2 de 5</p>
      <h2 class="auth-title">Tu primer horario</h2>
      <p class="auth-subtitle">Así vas a organizar tus materias. Puedes crear más horarios después, por ejemplo para el siguiente semestre.</p>
      <div class="auth-field"><label for="obSchedName">Nombre del horario</label><input type="text" id="obSchedName" value="Otoño 2026"></div>
      <div id="obMsg"></div>
      <button class="auth-btn-primary" id="obNext">Continuar</button>`);
    container.querySelector('#obNext').onclick = async () => {
      const name = container.querySelector('#obSchedName').value.trim() || 'Mi horario';
      const btn = container.querySelector('#obNext');
      btn.disabled = true; btn.textContent = 'Creando…';
      try {
        // Si el onboarding se interrumpió después de crear un horario (la
        // pestaña se recargó, se cerró el navegador) y la sesión vuelve
        // aquí, ya existe un horario activo -- no crear otro duplicado.
        const existing = await scheduleRepo.list();
        const already = existing.find((s) => s.is_active) || existing[0];
        activeSchedule = already || (await scheduleRepo.create({ name, is_active: true }));
        step++; paint();
      } catch (err) {
        container.querySelector('#obMsg').innerHTML = `<div class="auth-error">No se pudo crear el horario. Intenta de nuevo.</div>`;
        btn.disabled = false; btn.textContent = 'Continuar';
      }
    };
  }

  function paintMateria() {
    shell(`
      <p class="auth-eyebrow">Paso 3 de 5</p>
      <h2 class="auth-title">Tu primera materia</h2>
      <p class="auth-subtitle">Opcional -- puedes agregar todas tus materias después desde la vista Materias.</p>
      <div class="auth-field"><label for="obCourseName">Nombre</label><input type="text" id="obCourseName" placeholder="Ej. Tipografía 1"></div>
      <div class="auth-field"><label for="obCourseRoom">Aula <span style="font-weight:400;text-transform:none">(vacío = en línea)</span></label><input type="text" id="obCourseRoom" placeholder="Ej. S-201"></div>
      <div class="time-row">
        <div><label>Día</label><select id="obDay">${DAYS.map((d) => `<option>${d}</option>`).join('')}</select></div>
        <div><label>Inicio</label><select id="obStart">${hoursOptions(15)}</select></div>
        <div><label>Fin</label><select id="obEnd">${hoursOptions(17)}</select></div>
      </div>
      <div id="obMsg"></div>
      <div style="display:flex;gap:8px;margin-top:16px">
        <button class="auth-btn-secondary" id="obSkip" style="flex:1">Después</button>
        <button class="auth-btn-primary" id="obNext" style="flex:1">Agregar</button>
      </div>`);
    container.querySelector('#obSkip').onclick = () => { step++; paint(); };
    container.querySelector('#obNext').onclick = async () => {
      const name = container.querySelector('#obCourseName').value.trim();
      if (!name) { step++; paint(); return; }
      const room = container.querySelector('#obCourseRoom').value.trim();
      const day = container.querySelector('#obDay').value;
      const start = +container.querySelector('#obStart').value;
      const end = +container.querySelector('#obEnd').value;
      if (end <= start) {
        container.querySelector('#obMsg').innerHTML = `<div class="auth-error">La hora de fin debe ser después del inicio.</div>`;
        return;
      }
      const btn = container.querySelector('#obNext');
      btn.disabled = true; btn.textContent = 'Agregando…';
      const course = await courseRepo.create({
        schedule_id: activeSchedule.id,
        name,
        room: room || null,
        color: '#B8D4F1',
      });
      await classSessionRepo.create({
        course_id: course.id,
        day_of_week: DAY_TO_NUM[day],
        start_time: `${pad2(start)}:00`,
        end_time: `${pad2(end)}:00`,
      });
      step++; paint();
    };
  }

  function paintTema() {
    shell(`
      <p class="auth-eyebrow">Paso 4 de 5</p>
      <h2 class="auth-title">Elige un estilo</h2>
      <p class="auth-subtitle">Lo puedes cambiar cuando quieras desde el menú de temas.</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px" id="obThemeGrid">
        ${THEME_OPTIONS.map(
          (opt) => `
          <button class="theme-onboard-card${opt.value === selectedTheme ? ' sel' : ''}" data-value="${opt.value}" style="border-radius:14px;border:2px solid ${opt.value === selectedTheme ? 'var(--terracotta)' : 'var(--glass-border)'};background:var(--surface);padding:14px;cursor:pointer;text-align:left">
            <span style="display:block;width:26px;height:26px;border-radius:50%;margin-bottom:8px;background:${opt.swatch || 'linear-gradient(135deg,#2E7CF6 50%,#A855F7 50%)'}"></span>
            <span style="font-size:12.5px;font-weight:600;color:var(--ink)">${opt.label}</span>
          </button>`
        ).join('')}
      </div>
      <button class="auth-btn-primary" id="obNext">Continuar</button>`);
    container.querySelector('#obThemeGrid').onclick = (e) => {
      const card = e.target.closest('.theme-onboard-card');
      if (!card) return;
      selectedTheme = card.dataset.value;
      setTheme(selectedTheme);
      paintTema(); // repinta para mover el borde de selección
    };
    container.querySelector('#obNext').onclick = () => { step++; paint(); };
  }

  function paintNotificaciones() {
    shell(`
      <p class="auth-eyebrow">Paso 5 de 5</p>
      <h2 class="auth-title">¿Quieres que te avisemos?</h2>
      <p class="auth-subtitle">Te podemos mandar una notificación antes de que empiece tu próxima clase, y para recordarte tus tareas. Puedes cambiar esto cuando quieras desde Ajustes.</p>
      <div class="sheet-actions" style="margin-top:8px">
        <button class="auth-btn-secondary" id="obLater">Ahora no</button>
        <button class="auth-btn-primary" id="obActivate">Activar recordatorios</button>
      </div>`);
    container.querySelector('#obLater').onclick = () => finish();
    container.querySelector('#obActivate').onclick = async () => {
      const btn = container.querySelector('#obActivate');
      btn.disabled = true; btn.textContent = 'Activando…';
      await activatePush();
      finish();
    };
  }

  async function finish() {
    await supabase.from('profiles').update({ onboarded_at: new Date().toISOString() }).eq('id', userId);
    navigate('/app');
  }

  paint();
}
