// Tab bar (mobile): qué panel mostrar entre Hoy/Semana/Materias/Tareas.
// En desktop no hace falta -- el tri-panel ya muestra Materias/Semana/
// Tareas los tres a la vez (ver layout.css), así que "navegar" ahí no
// tiene nada que hacer. Hubo un rail de íconos a la izquierda pensado
// para eso, pero estaba invisible por un bug de CSS desde que se
// escribió (ver CHANGELOG) -- al corregirlo apareció por primera vez,
// y resultó que su único efecto (`scrollIntoView` a la columna) no
// hacía nada: las 3 columnas ya viven fijas en una grilla de 100vh sin
// scroll de página, así que no había a dónde "moverse". Se quitó en
// vez de dejarlo ahí sin función real.
import { haptic, H } from './shared.js';

export function setActiveTab(name) {
  const layout = document.getElementById('appLayout');
  if (layout) layout.dataset.tab = name;
  document.querySelectorAll('.tab-bar-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
}

export function bindNav() {
  document.querySelectorAll('.tab-bar-btn').forEach((btn) => {
    btn.onclick = () => { haptic(H.tap); setActiveTab(btn.dataset.tab); };
  });
}
