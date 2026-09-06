import { navigate } from '../router.js';

export function renderLanding(container) {
  container.innerHTML = `
    <div class="auth-page">
      <div class="landing-hero">
        <p class="auth-eyebrow">Mi Horario</p>
        <h1>Tu semana, a su tiempo</h1>
        <p>El horario, las tareas y las notas de tus materias en un solo lugar — se sincroniza entre tu teléfono y tu compu.</p>
        <img src="/landing-preview.png" alt="Vista del calendario semanal de Mi Horario" loading="lazy">
      </div>
      <div class="landing-actions">
        <button class="auth-btn-primary" id="landingSignup">Empezar</button>
        <button class="auth-btn-secondary" id="landingLogin">Ya tengo cuenta</button>
      </div>
    </div>`;
  // Si nadie puso public/landing-preview.png todavía, ocultar el hueco en
  // vez de mostrar el ícono roto en una pantalla pública de marketing.
  const preview = container.querySelector('.landing-hero img');
  preview.onerror = () => { preview.style.display = 'none'; };
  container.querySelector('#landingSignup').onclick = () => navigate('/signup');
  container.querySelector('#landingLogin').onclick = () => navigate('/login');
}
