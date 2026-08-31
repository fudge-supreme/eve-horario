import { THEME_OPTIONS, getStoredTheme, setTheme } from './theme.js';

// Monta el botón de 3 barritas + su menú desplegable de temas dentro de
// `container`. setTheme() (en theme.js) ya se encarga de subir el
// cambio a profiles.theme si hay sesión activa.
export function mountThemeMenu(container) {
  container.innerHTML = `
    <div class="theme-menu">
      <button class="theme-menu-btn" id="themeMenuBtn" aria-label="Cambiar tema" aria-haspopup="true" aria-expanded="false">
        <span class="theme-menu-bar"></span><span class="theme-menu-bar"></span><span class="theme-menu-bar"></span>
      </button>
      <div class="theme-menu-panel" id="themeMenuPanel" hidden role="menu">
        ${THEME_OPTIONS.map(
          (opt) => `
          <button class="theme-menu-item" data-theme-value="${opt.value}" role="menuitemradio">
            <span class="theme-menu-swatch" style="${opt.swatch ? `background:${opt.swatch}` : 'background:linear-gradient(135deg,#2E7CF6 50%,#A855F7 50%)'}"></span>
            <span class="theme-menu-label">${opt.label}</span>
            <span class="theme-menu-check">✓</span>
          </button>`
        ).join('')}
      </div>
    </div>`;

  const btn = container.querySelector('#themeMenuBtn');
  const panel = container.querySelector('#themeMenuPanel');
  const items = [...panel.querySelectorAll('.theme-menu-item')];

  function renderActive() {
    const current = getStoredTheme();
    items.forEach((item) => item.classList.toggle('active', item.dataset.themeValue === current));
  }
  renderActive();

  function onOutsideClick(e) {
    if (!container.contains(e.target)) closeMenu();
  }
  function onKeydown(e) {
    if (e.key === 'Escape') closeMenu();
  }
  function openMenu() {
    panel.hidden = false;
    btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', onOutsideClick, true);
    document.addEventListener('keydown', onKeydown);
  }
  function closeMenu() {
    panel.hidden = true;
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onOutsideClick, true);
    document.removeEventListener('keydown', onKeydown);
  }

  btn.onclick = (e) => {
    e.stopPropagation();
    if (panel.hidden) openMenu();
    else closeMenu();
  };

  items.forEach((item) => {
    item.onclick = () => {
      setTheme(item.dataset.themeValue);
      renderActive();
      closeMenu();
      try { navigator.vibrate?.(8); } catch {}
    };
  });
}
