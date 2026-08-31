import { supabase } from '../data/supabase.js';
import { navigate } from '../router.js';

export function renderNuevaContrasena(container) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <p class="auth-eyebrow">Mi Horario</p>
        <h2 class="auth-title">Elige una nueva contraseña</h2>
        <p class="auth-subtitle">Este link solo funciona si lo abriste desde tu correo, hace poco.</p>
        <div id="npMsg"></div>
        <form id="npForm">
          <div class="auth-field">
            <label for="npPass">Nueva contraseña</label>
            <input type="password" id="npPass" autocomplete="new-password" required minlength="8" placeholder="Mínimo 8 caracteres">
          </div>
          <div class="auth-field">
            <label for="npPass2">Confirmar</label>
            <input type="password" id="npPass2" autocomplete="new-password" required minlength="8">
          </div>
          <button type="submit" class="auth-btn-primary" id="npSubmit">Guardar contraseña</button>
        </form>
      </div>
    </div>`;

  const form = container.querySelector('#npForm');
  const msg = container.querySelector('#npMsg');
  const submitBtn = container.querySelector('#npSubmit');

  form.onsubmit = async (e) => {
    e.preventDefault();
    msg.innerHTML = '';
    const password = container.querySelector('#npPass').value;
    const password2 = container.querySelector('#npPass2').value;

    if (password.length < 8) {
      msg.innerHTML = `<div class="auth-error">La contraseña necesita al menos 8 caracteres.</div>`;
      return;
    }
    if (password !== password2) {
      msg.innerHTML = `<div class="auth-error">Las contraseñas no coinciden.</div>`;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando…';
    const { error } = await supabase.auth.updateUser({ password });
    submitBtn.disabled = false;
    submitBtn.textContent = 'Guardar contraseña';

    if (error) {
      msg.innerHTML = `<div class="auth-error">Este link ya expiró o no es válido. Pide uno nuevo desde "Olvidé mi contraseña".</div>`;
      return;
    }

    msg.innerHTML = `<div class="auth-success">Contraseña actualizada. Entrando…</div>`;
    setTimeout(() => navigate('/app'), 900);
  };
}
