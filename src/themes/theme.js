import { supabase } from '../data/supabase.js';

const THEME_KEY = 'theme';
const MIGRATED_KEY = 'migrated_v2';

export const THEME_OPTIONS = [
  { value: 'coursicle-soft', label: 'Coursicle Soft', swatch: '#2E7CF6' },
  { value: 'liquid-glass', label: 'Liquid Glass', swatch: '#5B7FD9' },
  { value: 'obsidian-amoled', label: 'Obsidian AMOLED', swatch: '#A855F7' },
  { value: 'auto', label: 'Automático', swatch: null },
];

const SELECTABLE = new Set(THEME_OPTIONS.map((o) => o.value));
const DEFAULT_THEME = 'coursicle-soft';

const META_COLOR = {
  'coursicle-soft': '#2E7CF6',
  'liquid-glass': '#5B7FD9',
  'obsidian-amoled': '#000000',
};

function systemPrefersDark() {
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

// 'auto' no es un tema en sí -- es un alias que resuelve a uno de los dos
// según el sistema. Los otros 3 (cuando exist(a)n) son paletas fijas.
function resolve(name) {
  if (name === 'auto') return systemPrefersDark() ? 'obsidian-amoled' : 'coursicle-soft';
  return SELECTABLE.has(name) ? name : DEFAULT_THEME;
}

function applyResolved(resolved) {
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_COLOR[resolved] || META_COLOR[DEFAULT_THEME]);
}

export function getStoredTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  return SELECTABLE.has(stored) ? stored : DEFAULT_THEME;
}

export function applyTheme(name) {
  applyResolved(resolve(name));
}

export function setTheme(name) {
  const value = SELECTABLE.has(name) ? name : DEFAULT_THEME;
  localStorage.setItem(THEME_KEY, value);
  applyTheme(value);
  pushThemeToProfile(value);
}

async function pushThemeToProfile(value) {
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return; // sin sesión (ej. en /landing): solo queda local
    await supabase.from('profiles').update({ theme: value }).eq('id', userId);
  } catch (err) {
    console.error('[theme] no se pudo sincronizar el tema al perfil', err);
  }
}

// Se llama una vez por sesión autenticada: si el perfil remoto tiene un
// tema distinto al local (ej. lo cambiaste en otro dispositivo), el
// remoto manda.
export async function pullThemeFromProfile(userId) {
  try {
    const { data, error } = await supabase.from('profiles').select('theme').eq('id', userId).single();
    if (error || !data?.theme) return;
    if (data.theme !== localStorage.getItem(THEME_KEY)) {
      localStorage.setItem(THEME_KEY, data.theme);
      applyTheme(data.theme);
    }
  } catch (err) {
    console.error('[theme] no se pudo bajar el tema del perfil', err);
  }
}

// MIGRACIÓN: cualquier cuenta que todavía no haya pasado por el sistema
// de temas nuevo (flag migrated_v2 ausente) arranca en coursicle-soft.
// No hay un valor previo que preservar -- Editorial Rosé y su
// claro/oscuro se retiraron por completo en esta fase.
export function migrateLegacyThemeIfNeeded() {
  if (localStorage.getItem(MIGRATED_KEY) === 'true') return;
  localStorage.setItem(THEME_KEY, DEFAULT_THEME);
  localStorage.setItem(MIGRATED_KEY, 'true');
}

// Bootstrap: corre antes de renderizar nada, igual que la limpieza de
// datos legacy de Fase 0.5.
export function initTheme() {
  migrateLegacyThemeIfNeeded();
  applyTheme(getStoredTheme());
}

// Si la selección activa es "auto" y cambia el modo del sistema mientras
// la app está abierta, se re-resuelve en vivo sin recargar.
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getStoredTheme() === 'auto') applyTheme('auto');
});
