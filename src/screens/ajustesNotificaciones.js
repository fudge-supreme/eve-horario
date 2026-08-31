import { supabase } from '../data/supabase.js';
import { navigate } from '../router.js';
import { activatePush, deactivatePush, isSubscribed, pushSupported, pushPermission } from '../app/push.js';

export async function renderAjustesNotificaciones(container) {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  const { data: prefs } = await supabase.from('notification_prefs').select('*').eq('user_id', userId).single();
  const subscribed = await isSubscribed();

  function statusLine() {
    if (!pushSupported()) return 'Este navegador no soporta notificaciones push.';
    if (subscribed) return 'Recordatorios activados en este dispositivo.';
    if (pushPermission() === 'denied') return 'Bloqueaste el permiso de notificaciones -- actívalo desde los ajustes de tu navegador o sistema.';
    return 'Los recordatorios no están activados en este dispositivo.';
  }

  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card" style="max-width:420px">
        <p class="auth-eyebrow">Mi Horario</p>
        <h2 class="auth-title">Notificaciones</h2>
        <p class="auth-subtitle">${statusLine()}</p>

        <button class="auth-btn-primary" id="pushToggleBtn" ${!pushSupported() ? 'disabled' : ''}>
          ${subscribed ? 'Desactivar en este dispositivo' : 'Activar recordatorios'}
        </button>

        <div style="height:22px"></div>

        <label style="display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);margin-bottom:8px">Aviso antes de cada clase</label>
        <select id="classReminderMin" style="width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--glass-border);background:var(--surface);font-size:14px;color:var(--ink);margin-bottom:16px">
          ${[5, 10, 15, 30, 60].map((m) => `<option value="${m}"${prefs?.class_reminder_minutes === m ? ' selected' : ''}>${m} minutos antes</option>`).join('')}
        </select>

        <label style="display:flex;align-items:center;gap:10px;font-size:13px;margin-bottom:12px;cursor:pointer">
          <input type="checkbox" id="eveningBefore" ${prefs?.task_reminder_evening_before !== false ? 'checked' : ''}>
          Avisar la noche anterior a que venza una tarea (8pm)
        </label>
        <label style="display:flex;align-items:center;gap:10px;font-size:13px;margin-bottom:16px;cursor:pointer">
          <input type="checkbox" id="morningOf" ${prefs?.task_reminder_morning_of !== false ? 'checked' : ''}>
          Avisar la mañana en que vence una tarea (8am)
        </label>

        <label style="display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);margin-bottom:8px">Horas de silencio <span style="font-weight:400;text-transform:none">(opcional)</span></label>
        <div class="time-row">
          <div><label>Desde</label><input type="time" id="quietStart" value="${prefs?.quiet_hours_start?.slice(0, 5) || ''}"></div>
          <div><label>Hasta</label><input type="time" id="quietEnd" value="${prefs?.quiet_hours_end?.slice(0, 5) || ''}"></div>
        </div>

        <div style="height:16px"></div>
        <button class="auth-btn-secondary" id="savePrefsBtn">Guardar preferencias</button>
        <div id="notifMsg"></div>

        <div class="auth-links">
          <button class="auth-link" id="securityLink">Seguridad</button>
          <button class="auth-link" id="backBtn">Volver</button>
        </div>
      </div>
    </div>`;

  container.querySelector('#backBtn').onclick = () => navigate('/app');
  container.querySelector('#securityLink').onclick = () => navigate('/ajustes/seguridad');

  container.querySelector('#pushToggleBtn').onclick = async () => {
    const btn = container.querySelector('#pushToggleBtn');
    btn.disabled = true;
    if (subscribed) {
      await deactivatePush();
    } else {
      await activatePush();
    }
    renderAjustesNotificaciones(container);
  };

  container.querySelector('#savePrefsBtn').onclick = async () => {
    const msg = container.querySelector('#notifMsg');
    const quietStart = container.querySelector('#quietStart').value || null;
    const quietEnd = container.querySelector('#quietEnd').value || null;
    const { error } = await supabase
      .from('notification_prefs')
      .update({
        class_reminder_minutes: Number(container.querySelector('#classReminderMin').value),
        task_reminder_evening_before: container.querySelector('#eveningBefore').checked,
        task_reminder_morning_of: container.querySelector('#morningOf').checked,
        quiet_hours_start: quietStart,
        quiet_hours_end: quietEnd,
      })
      .eq('user_id', userId);
    msg.innerHTML = error
      ? `<div class="auth-error">No se pudieron guardar las preferencias.</div>`
      : `<div class="auth-success">Preferencias guardadas.</div>`;
  };
}
