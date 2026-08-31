// Router mínimo por hash (#/landing, #/login, ...). Nada de framework:
// un mapa de ruta -> función de render, y un listener de hashchange.
const routes = new Map();
let notFoundHandler = () => navigate('/landing');
let currentPath = null;

export function register(path, renderFn) {
  routes.set(path, renderFn);
}

export function setNotFound(fn) {
  notFoundHandler = fn;
}

export function navigate(path) {
  if (location.hash.slice(1) === path) {
    dispatch(); // ya estás ahí (ej. tras un submit): fuerza re-render igual
  } else {
    location.hash = path;
  }
}

export function currentRoute() {
  return currentPath;
}

function dispatch() {
  const path = location.hash.slice(1) || '/landing';
  currentPath = path;
  const renderFn = routes.get(path);
  if (renderFn) renderFn();
  else notFoundHandler(path);
}

export function startRouter() {
  window.addEventListener('hashchange', dispatch);
  dispatch();
}
