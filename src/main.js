import './styles/auth.css';
import './themes/coursicle-soft.css';
import './themes/liquid-glass.css';
import './themes/obsidian-amoled.css';
import './themes/themeMenu.css';
import { supabase } from './data/supabase.js';
import { pull, startSync, stopSync } from './data/sync.js';
import { register, setNotFound, startRouter, navigate, currentRoute } from './router.js';
import { renderLanding } from './screens/landing.js';
import { renderSignup } from './screens/signup.js';
import { renderLogin } from './screens/login.js';
import { renderRecuperar } from './screens/recuperar.js';
import { renderNuevaContrasena } from './screens/nuevaContrasena.js';
import { renderAjustesSeguridad } from './screens/ajustesSeguridad.js';
import { bindLegacyAppOnce, loadAndRenderApp } from './legacy-app.js';
import { initTheme, pullThemeFromProfile } from './themes/theme.js';

/* ======== LIMPIEZA DE DATOS LEGACY (Fase 0.5) ========
   Corre una sola vez, antes de leer cualquier dato. La usuaria original
   autorizó borrar sus datos de la versión anterior (no se preservan ni
   se respaldan). Cualquier key que no pertenezca al set del nuevo sistema
   se elimina; el flag legacy_cleaned_at evita repetir esto en cada carga. */
(function limpiarDatosLegacy() {
  if (localStorage.getItem('legacy_cleaned_at')) return;
  const keysNuevoSistema = new Set(['theme', 'migrated_v2', 'sync_last_pull_at', 'pending_writes', 'legacy_cleaned_at']);
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith('sb-') || keysNuevoSistema.has(k)) return;
    localStorage.removeItem(k);
  });
  localStorage.setItem('legacy_cleaned_at', new Date().toISOString());
})();

initTheme();

const authShell = document.getElementById('auth-shell');
const appShell = document.getElementById('app-shell');

const PROTECTED_ROUTES = new Set(['/app', '/ajustes/seguridad']);
const PUBLIC_SCREENS = {
  '/landing': renderLanding,
  '/signup': renderSignup,
  '/login': renderLogin,
  '/recuperar': renderRecuperar,
};

let currentUserId = null;

function showAuthScreen(renderFn) {
  appShell.hidden = true;
  authShell.hidden = false;
  renderFn(authShell);
}

async function ensureSyncStarted(session) {
  if (currentUserId === session.user.id) return;
  if (currentUserId) stopSync(); // había otra cuenta activa en esta misma pestaña
  currentUserId = session.user.id;
  // Espera el primer pull antes de que la app siembre nada por default:
  // si esta usuaria ya tiene datos en el servidor (ej. entrando desde un
  // segundo dispositivo), tienen que aparecer antes de decidir si hace
  // falta un horario de ejemplo.
  await pull();
  await pullThemeFromProfile(currentUserId); // si cambiaste el tema en otro dispositivo, el remoto manda
  startSync(currentUserId);
}

async function guardedRender(path) {
  // /nueva-contrasena es un caso especial: aterrizaje del link de reset,
  // no depende de si ya hay sesión o no.
  if (path === '/nueva-contrasena') {
    showAuthScreen(renderNuevaContrasena);
    return;
  }

  const { data } = await supabase.auth.getSession();
  const session = data.session;

  if (PROTECTED_ROUTES.has(path)) {
    if (!session) { navigate('/landing'); return; }
    await ensureSyncStarted(session);

    if (path === '/app') {
      appShell.hidden = false;
      authShell.hidden = true;
      bindLegacyAppOnce();
      await loadAndRenderApp();
    } else {
      showAuthScreen(renderAjustesSeguridad);
    }
    return;
  }

  // rutas públicas: si ya hay sesión, no tiene caso ver login/signup de nuevo
  if (session) { navigate('/app'); return; }
  if (currentUserId) {
    stopSync();
    currentUserId = null;
  }
  showAuthScreen(PUBLIC_SCREENS[path] || renderLanding);
}

['/landing', '/signup', '/login', '/recuperar', '/nueva-contrasena', '/app', '/ajustes/seguridad'].forEach((path) => {
  register(path, () => guardedRender(path));
});
setNotFound(() => navigate('/landing'));

// El intercambio del link de magic-link / reset (?code=...) es
// asíncrono y puede resolverse después del primer dispatch del router
// -- re-evaluamos la ruta actual cuando cambia el estado de auth para
// no quedarnos mostrando "landing" mientras la sesión ya llegó.
//
// SIGNED_IN también se dispara al re-autenticar dentro de una sesión ya
// activa (ej. "Ajustes de seguridad" pide la contraseña actual antes de
// cambiarla, vía signInWithPassword) -- si ya somos esa misma usuaria,
// re-renderizar la ruta actual reemplazaría la pantalla a medio envío
// de formulario, perdiendo el mensaje de éxito/error. Solo importa
// reaccionar cuando de verdad cambiamos de identidad.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || event === 'PASSWORD_RECOVERY') {
    guardedRender(currentRoute() || '/landing');
    return;
  }
  if (event === 'SIGNED_IN' && currentUserId !== session?.user?.id) {
    guardedRender(currentRoute() || '/landing');
  }
});

startRouter();
