// Tab bar (mobile) + nav rail (desktop): una sola función de "ir a esta
// sección" para ambos, ya que comparten el mismo significado.
import { haptic, H } from './shared.js';

const PANEL_FOR_TAB = { hoy: 'panelSemana', semana: 'panelSemana', materias: 'panelMaterias', tareas: 'panelTareas' };

export function setActiveTab(name) {
  const layout = document.getElementById('appLayout');
  if (layout) layout.dataset.tab = name;
  document.querySelectorAll('.tab-bar-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.nav-rail-btn').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
  // en desktop las 3 columnas ya están visibles siempre -- "navegar" ahí
  // solo hace scroll suave hasta la columna correspondiente.
  if (window.innerWidth >= 1024) {
    document.getElementById(PANEL_FOR_TAB[name])?.scrollIntoView?.({ behavior: 'smooth', block: 'start', inline: 'nearest' });
  }
}

export function bindNav() {
  document.querySelectorAll('.tab-bar-btn').forEach((btn) => {
    btn.onclick = () => { haptic(H.tap); setActiveTab(btn.dataset.tab); };
  });
  document.querySelectorAll('.nav-rail-btn').forEach((btn) => {
    btn.onclick = () => { haptic(H.tap); setActiveTab(btn.dataset.nav); };
  });
}
