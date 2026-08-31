// Header del horario activo (nombre + créditos) + selector multi-horario.
import { scheduleRepo } from '../data/repositories/scheduleRepo.js';
import { esc, haptic, H, openSheet, closeSheet, toast } from './shared.js';
import { getState } from './state.js';

export function renderScheduleHeader() {
  const { activeSchedule, allCourses } = getState();
  const nameEl = document.getElementById('scheduleName');
  const creditsEl = document.getElementById('scheduleCredits');
  if (nameEl) nameEl.textContent = activeSchedule?.name || 'Mi horario';
  if (creditsEl) {
    const total = allCourses.reduce((sum, c) => sum + (c.credits || 0), 0);
    creditsEl.textContent = total > 0 ? `${allCourses.length} materias · ${total} créditos` : `${allCourses.length} materias`;
  }
}

export function openScheduleSwitcher(afterSwitch) {
  const sheet = document.getElementById('sheet');
  const { allSchedules, activeSchedule } = getState();

  function paint() {
    sheet.innerHTML = `
      <div class="sheet-handle"></div><button class="sheet-close" id="sc">×</button>
      <label>Tus horarios</label>
      <div id="schList" style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">
        ${allSchedules.map((s) => `
          <div style="display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:12px;background:${s.id === activeSchedule?.id ? 'var(--surface)' : 'transparent'};border:1px solid var(--glass-border)">
            <button data-activate="${s.id}" style="flex:1;text-align:left;border:none;background:none;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer;${s.id === activeSchedule?.id ? 'color:var(--terracotta)' : ''}">${s.id === activeSchedule?.id ? '● ' : '○ '}${esc(s.name)}</button>
            <button data-rename="${s.id}" style="border:none;background:none;color:var(--ink2);cursor:pointer;font-size:12px">✎</button>
            ${allSchedules.length > 1 ? `<button data-archive="${s.id}" style="border:none;background:none;color:var(--tag-coral);cursor:pointer;font-size:12px">Archivar</button>` : ''}
          </div>`).join('')}
      </div>
      <label>Nuevo horario</label>
      <input type="text" id="newSchName" placeholder="Ej. Primavera 2027">
      <div class="sheet-actions"><button class="btn-primary" id="newSchSave">Crear y activar</button></div>`;

    document.getElementById('sc').onclick = closeSheet;
    sheet.querySelectorAll('[data-activate]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.activate;
        if (id === activeSchedule?.id) { closeSheet(); return; }
        for (const s of allSchedules) await scheduleRepo.update(s.id, { is_active: s.id === id });
        await afterSwitch();
        haptic(H.select); closeSheet(); toast('Horario activado');
      };
    });
    sheet.querySelectorAll('[data-rename]').forEach((btn) => {
      btn.onclick = async () => {
        const s = allSchedules.find((x) => x.id === btn.dataset.rename);
        const name = prompt('Nuevo nombre para el horario:', s.name);
        if (!name || !name.trim()) return;
        await scheduleRepo.update(s.id, { name: name.trim() });
        await afterSwitch();
        toast('Renombrado'); paint();
      };
    });
    sheet.querySelectorAll('[data-archive]').forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.archive;
        const wasActive = id === activeSchedule?.id;
        await scheduleRepo.delete(id);
        if (wasActive) {
          const remaining = allSchedules.filter((s) => s.id !== id);
          if (remaining[0]) await scheduleRepo.update(remaining[0].id, { is_active: true });
        }
        await afterSwitch();
        haptic(H.del); closeSheet(); toast('Horario archivado');
      };
    });
    document.getElementById('newSchSave').onclick = async () => {
      const name = document.getElementById('newSchName').value.trim();
      if (!name) { document.getElementById('newSchName').style.borderColor = 'var(--tag-coral)'; return; }
      for (const s of allSchedules) await scheduleRepo.update(s.id, { is_active: false });
      await scheduleRepo.create({ name, is_active: true });
      await afterSwitch();
      haptic(H.save); closeSheet(); toast('Horario creado');
    };
    openSheet();
  }
  paint();
}
