import { supabase } from '../data/supabase.js';
import { navigate } from '../router.js';

export function renderRecuperar(container) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <p class="auth-eyebrow">Mi Horario</p>
        <h2 class="auth-title">Recupera tu contraseña</h2>
        <p class="auth-subtitle">Te mandamos un link para elegir una nueva.</p>
        <div id="recMsg"></div>
        <form id="recForm">
          <div class="auth-field">
            <label for="recEmail">Correo</label>
            <input type="email" id="recEmail" autocomplete="email" required placeholder="tu@correo.com">
          </div>
          <button type="submit" class="auth-btn-primary" id="recSubmit">Enviar link</button>
        </form>
        <div class="auth-links">
          <button class="auth-link" id="recToLogin">Volver a iniciar sesión</button>
        </div>
      </div>
    </div>`;

  container.querySelector('#recToLogin').onclick = () => navigate('/login');

  const form = container.querySelector('#recForm');
  const msg = container.querySelector('#recMsg');
  const submitBtn = container.querySelector('#recSubmit');

  form.onsubmit = async (e) => {
    e.preventDefault();
    msg.innerHTML = '';
    const email = container.querySelector('#recEmail').value.trim();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando…';

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${window.location.pathname}#/nueva-contrasena`,
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Enviar link';

    if (error) {
      // Supabase no distingue "no existe la cuenta" como error (por diseño,
      // para no filtrar esa info) -- si llegamos aquí es una falla real.
      msg.innerHTML = `<div class="auth-error">No se pudo enviar el link. Revisa tu conexión e intenta de nuevo.</div>`;
      return;
    }
    msg.innerHTML = `<div class="auth-success">Si existe una cuenta con ${email}, te mandamos un link para elegir una nueva contraseña.</div>`;
    form.reset();
  };
}
