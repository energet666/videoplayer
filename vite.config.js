import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'

// ============================================================================
// Конфигурация Vite (сборщик проекта)
// ============================================================================
// - tailwindcss(): подключает TailwindCSS v4 через Vite-плагин
// - svelte(): подключает компилятор Svelte 5 (runes, $state, $effect и т.д.)
// - base: './' — относительные пути в HTML (важно для Electron,
//   т.к. index.html загружается через file://, а не http://)
// ============================================================================
export default defineConfig({
  plugins: [tailwindcss(), svelte()],
  base: './',
})
