import { supabase } from '../data/supabase.js';
import { navigate } from '../router.js';

export function renderSignup(container) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <p class="auth-eyebrow">Mi Horario</p>
        <h2 class="auth-title">Crea tu cuenta</h2>
        <p class="auth-subtitle">Gratis, y tus datos se sincronizan entre tus dispositivos.</p>
        <div id="signupMsg"></div>
        <form id="signupForm">
          <div class="auth-field">
            <label for="suName">Nombre (opcional)</label>
            <input type="text" id="suName" autocomplete="name" placeholder="¿Cómo te llamamos?">
          </div>
          <div class="auth-field">
            <label for="suEmail">Correo</label>
            <input type="email" id="suEmail" autocomplete="email" required placeholder="tu@correo.com">
          </div>
          <div class="auth-field">
            <label for="suPass">Contraseña</label>
            <input type="password" id="suPass" autocomplete="new-password" required minlength="8" placeholder="Mínimo 8 caracteres">
            <p class="auth-hint">Sin necesidad de mayúsculas ni símbolos, solo 8 caracteres o más.</p>
          </div>
          <div class="auth-field">
            <label for="suPass2">Confirmar contraseña</label>
            <input type="password" id="suPass2" autocomplete="new-password" required minlength="8">
          </div>
          <button type="submit" class="auth-btn-primary" id="suSubmit">Crear cuenta</button>
        </form>
        <div class="auth-links">
          <button class="auth-link" id="suToLogin">Ya tengo cuenta</button>
        </div>
      </div>
    </div>`;

  container.querySelector('#suToLogin').onclick = () => navigate('/login');

  const form = container.querySelector('#signupForm');
  const msg = container.querySelector('#signupMsg');
  const submitBtn = container.querySelector('#suSubmit');

  form.onsubmit = async (e) => {
    e.preventDefault();
    msg.innerHTML = '';

    const displayName = container.querySelector('#suName').value.trim();
    const email = container.querySelector('#suEmail').value.trim();
    const password = container.querySelector('#suPass').value;
    const password2 = container.querySelector('#suPass2').value;

    if (password.length < 8) {
      msg.innerHTML = `<div class="auth-error">La contraseña necesita al menos 8 caracteres.</div>`;
      return;
    }
    if (password !== password2) {
      msg.innerHTML = `<div class="auth-error">Las contraseñas no coinciden.</div>`;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Creando cuenta…';

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: displayName ? { display_name: displayName } : undefined,
        emailRedirectTo: `${window.location.origin}${window.location.pathname}#/login`,
      },
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Crear cuenta';

    if (error) {
      msg.innerHTML = `<div class="auth-error">${mensajeError(error)}</div>`;
      return;
    }

    if (data.session) {
      // confirmación de correo desactivada (ej. desarrollo local): ya hay sesión
      navigate('/app');
      return;
    }

    msg.innerHTML = `<div class="auth-success">Revisa tu correo (${email}) y confirma tu cuenta para poder entrar.</div>`;
    form.reset();
  };
}

function mensajeError(error) {
  if (error.message?.includes('already registered') || error.message?.includes('already exists')) {
    return 'Ya existe una cuenta con ese correo. Intenta iniciar sesión en vez de crear una nueva.';
  }
  if (error.message?.includes('Password')) {
    return 'La contraseña no cumple los requisitos mínimos.';
  }
  return 'No se pudo crear la cuenta. Revisa tu conexión e intenta de nuevo.';
}
