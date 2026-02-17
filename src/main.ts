// ============================================================================
// Точка входа Svelte-приложения (Renderer Process)
// ============================================================================
// Этот файл инициализирует Svelte-приложение и монтирует корневой компонент
// App.svelte в DOM-элемент #app (определён в index.html).
// Запускается в renderer-процессе Electron (по сути — в браузере).
// ============================================================================

import { mount } from 'svelte'
import './app.css'       // Глобальные стили + подключение TailwindCSS
import App from './App.svelte'  // Корневой компонент приложения

// Монтируем Svelte-приложение в DOM.
// document.getElementById('app')! — элемент <div id="app"> из index.html.
// Восклицательный знак (!) — утверждение TypeScript, что элемент точно существует.
const app = mount(App, {
  target: document.getElementById('app')!,
})

export default app
