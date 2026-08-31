import { supabase } from '../data/supabase.js';
import { navigate } from '../router.js';

export function renderLogin(container) {
  let mode = 'password'; // 'password' | 'magic'

  function paint() {
    container.innerHTML = `
      <div class="auth-page">
        <div class="auth-card">
          <p class="auth-eyebrow">Mi Horario</p>
          <h2 class="auth-title">Inicia sesión</h2>
          <p class="auth-subtitle">${mode === 'password' ? 'Con tu correo y contraseña.' : 'Te mandamos un link para entrar sin contraseña.'}</p>
          <div id="loginMsg"></div>
          <form id="loginForm">
            <div class="auth-field">
              <label for="liEmail">Correo</label>
              <input type="email" id="liEmail" autocomplete="email" required placeholder="tu@correo.com">
            </div>
            ${
              mode === 'password'
                ? `<div class="auth-field">
                     <label for="liPass">Contraseña</label>
                     <input type="password" id="liPass" autocomplete="current-password" required>
                   </div>`
                : ''
            }
            <button type="submit" class="auth-btn-primary" id="liSubmit">${mode === 'password' ? 'Entrar' : 'Enviar link'}</button>
          </form>
          <div class="auth-links">
            ${
              mode === 'password'
                ? `<button class="auth-link" id="liToMagic">Prefiero recibir un link por correo</button>
                   <button class="auth-link" id="liToRecover">Olvidé mi contraseña</button>`
                : `<button class="auth-link" id="liToPassword">Prefiero entrar con contraseña</button>`
            }
            <button class="auth-link" id="liToSignup">Crear una cuenta</button>
          </div>
        </div>
      </div>`;

    const msg = container.querySelector('#loginMsg');
    const form = container.querySelector('#loginForm');
    const submitBtn = container.querySelector('#liSubmit');

    container.querySelector('#liToSignup').onclick = () => navigate('/signup');
    if (mode === 'password') {
      container.querySelector('#liToMagic').onclick = () => { mode = 'magic'; paint(); };
      container.querySelector('#liToRecover').onclick = () => navigate('/recuperar');
    } else {
      container.querySelector('#liToPassword').onclick = () => { mode = 'password'; paint(); };
    }

    form.onsubmit = async (e) => {
      e.preventDefault();
      msg.innerHTML = '';
      const email = container.querySelector('#liEmail').value.trim();

      submitBtn.disabled = true;

      if (mode === 'password') {
        const password = container.querySelector('#liPass').value;
        submitBtn.textContent = 'Entrando…';
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        submitBtn.disabled = false;
        submitBtn.textContent = 'Entrar';
        if (error) {
          // mensaje genérico a propósito: no revela si el correo existe o no
          msg.innerHTML = `<div class="auth-error">Correo o contraseña incorrectos.</div>`;
          return;
        }
        navigate('/app');
      } else {
        submitBtn.textContent = 'Enviando…';
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${window.location.origin}${window.location.pathname}#/app` },
        });
        submitBtn.disabled = false;
        submitBtn.textContent = 'Enviar link';
        if (error) {
          msg.innerHTML = `<div class="auth-error">No se pudo enviar el link. Revisa tu conexión e intenta de nuevo.</div>`;
          return;
        }
        msg.innerHTML = `<div class="auth-success">Te mandamos un link a ${email}. Ábrelo desde este mismo dispositivo para entrar.</div>`;
        form.reset();
      }
    };
  }

  paint();
}
