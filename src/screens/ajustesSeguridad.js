import { supabase } from '../data/supabase.js';
import { navigate } from '../router.js';
import { clearLocalData } from '../data/sync.js';

export async function renderAjustesSeguridad(container) {
  const { data } = await supabase.auth.getSession();
  const email = data.session?.user?.email ?? '';

  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card" style="max-width:420px">
        <p class="auth-eyebrow">Mi Horario</p>
        <h2 class="auth-title">Seguridad</h2>
        <p class="auth-subtitle">Sesión iniciada como ${email}</p>

        <div id="pwMsg"></div>
        <form id="pwForm">
          <label style="display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);margin-bottom:8px">Cambiar contraseña</label>
          <div class="auth-field">
            <label for="curPass">Contraseña actual</label>
            <input type="password" id="curPass" autocomplete="current-password" required>
          </div>
          <div class="auth-field">
            <label for="newPass">Nueva contraseña</label>
            <input type="password" id="newPass" autocomplete="new-password" required minlength="8">
          </div>
          <button type="submit" class="auth-btn-secondary" id="pwSubmit">Actualizar contraseña</button>
        </form>

        <div style="height:22px"></div>

        <div id="emailMsg"></div>
        <form id="emailForm">
          <label style="display:block;font-size:10.5px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink2);margin-bottom:8px">Cambiar correo</label>
          <div class="auth-field">
            <label for="newEmail">Nuevo correo</label>
            <input type="email" id="newEmail" autocomplete="email" required>
          </div>
          <button type="submit" class="auth-btn-secondary" id="emailSubmit">Actualizar correo</button>
        </form>

        <div style="height:22px"></div>

        <button class="auth-btn-primary" id="signOutBtn" style="background:var(--tag-coral)">Cerrar sesión</button>
        <div class="auth-links">
          <button class="auth-link" id="notifLink">Notificaciones</button>
          <button class="auth-link" id="backBtn">Volver</button>
        </div>
      </div>
    </div>`;

  container.querySelector('#backBtn').onclick = () => navigate('/app');
  container.querySelector('#notifLink').onclick = () => navigate('/ajustes/notificaciones');

  const pwForm = container.querySelector('#pwForm');
  const pwMsg = container.querySelector('#pwMsg');
  pwForm.onsubmit = async (e) => {
    e.preventDefault();
    pwMsg.innerHTML = '';
    const currentPassword = container.querySelector('#curPass').value;
    const newPassword = container.querySelector('#newPass').value;
    const submitBtn = container.querySelector('#pwSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Verificando…';

    // Supabase no exige la contraseña actual para updateUser(), pero
    // nosotros sí la pedimos: re-autenticar primero confirma que quien
    // está frente a la sesión abierta de verdad sabe la contraseña.
    const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (reauthError) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Actualizar contraseña';
      pwMsg.innerHTML = `<div class="auth-error">La contraseña actual no es correcta.</div>`;
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Actualizar contraseña';
    if (error) {
      pwMsg.innerHTML = `<div class="auth-error">No se pudo actualizar la contraseña. Intenta de nuevo.</div>`;
      return;
    }
    pwMsg.innerHTML = `<div class="auth-success">Contraseña actualizada.</div>`;
    pwForm.reset();
  };

  const emailForm = container.querySelector('#emailForm');
  const emailMsg = container.querySelector('#emailMsg');
  emailForm.onsubmit = async (e) => {
    e.preventDefault();
    emailMsg.innerHTML = '';
    const newEmail = container.querySelector('#newEmail').value.trim();
    const submitBtn = container.querySelector('#emailSubmit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando…';
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Actualizar correo';
    if (error) {
      emailMsg.innerHTML = `<div class="auth-error">No se pudo iniciar el cambio de correo. Intenta de nuevo.</div>`;
      return;
    }
    emailMsg.innerHTML = `<div class="auth-success">Revisa tu correo actual y el nuevo (${newEmail}) — hay que confirmar el cambio desde los dos.</div>`;
    emailForm.reset();
  };

  container.querySelector('#signOutBtn').onclick = async () => {
    await clearLocalData();
    await supabase.auth.signOut();
    navigate('/landing');
  };
}
