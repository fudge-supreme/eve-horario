// Helpers puros sin dependencias -- para que cualquier módulo de app/
// los pueda usar sin crear ciclos de import.
export const haptic = (p = 8) => { try { navigator.vibrate?.(p); } catch {} };
export const H = { tap: 6, select: 8, save: [10, 40, 10], toggle: 10, check: 12, del: [15, 30, 15], open: 6, close: 5 };

export function fH(h) {
  const hh = h % 12 === 0 ? 12 : h % 12;
  return hh + (h >= 12 ? ' pm' : ' am');
}
export function esc(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}
export function toast(m) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = m || 'Guardado';
  t.classList.add('show');
  clearTimeout(toast._);
  toast._ = setTimeout(() => t.classList.remove('show'), 1600);
}

const backdrop = () => document.getElementById('backdrop');
const sheetEl = () => document.getElementById('sheet');
export function openSheet() { backdrop().classList.add('open'); sheetEl().classList.add('open'); haptic(H.open); }
export function closeSheet() { backdrop().classList.remove('open'); sheetEl().classList.remove('open'); sheetEl().style.transform = ''; haptic(H.close); }
