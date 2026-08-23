import { defineConfig } from 'vite';

// base relativo: el build funciona en cualquier subpath de GitHub Pages
// (https://usuaria.github.io/nombre-del-repo/) sin hardcodear el nombre del repo.
export default defineConfig({
  base: './',
});
