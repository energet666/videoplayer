# План разработки видеоплеера (Svelte 5 + Tailwind 4 + Electron)

## 1. Инициализация проекта
- [x] Создать проект на Vite с шаблоном Svelte.
  - Используем Svelte 5.
- [x] Установить Tailwind CSS 4.
  - Настройка PostCSS/Vite для Tailwind 4.
- [x] Установить Electron и необходимые зависимости.
  - `electron`, `electron-builder` (для сборки), `concurrently` (для запуска dev server и electron).

## 2. Настройка Electron (Main Process)
- [x] Создать точку входа `electron/main.js`.
- [x] Настроить создание окна:
  - `frame: false` (без рамок и заголовков).
  - `titleBarStyle: 'hidden'`.
  - `transparent: false` (черный фон).
  - `resizable: true`.
- [x] Настроить загрузку URL.

## 3. Настройка Svelte (Renderer Process)
- [x] Очистить стартовый шаблон.
- [x] Настроить стили Tailwind:
  - `html`, `body` 100% ширины/высоты, `overflow: hidden`, черный фон.

## 4. Реализация функционала
### 4.1. Drag & Drop
- [x] Реализовать обработку событий `drop` в `App.svelte`.
- [x] При падении файла:
  - Получение `File` объекта.
  - Создание `blob:` URL.
  - Передача в компонент.

### 4.2. Воспроизведение видео
- [x] Создать компонент `<VideoPlayer />`.
- [x] Использовать тег `<video>` с `controls`.
- [x] Использовать `URL.createObjectURL`.

### 4.3. Адаптация окна под видео
- [x] При `loadedmetadata` получить размеры.
- [x] Отправить IPC `resize-window`.
- [x] Main process: `mainWindow.setContentSize`.

## 5. UI и Эстетика
- [x] Скрыть стандартные рамки (сделано в конфигурации окна).
- [x] Основной UI: Черный экран, приглашение Drop Video.
- [x] Drag Region:
  - В пустом состоянии: все окно.
  - При воспроизведении: верхняя область (градиент при наведении).

## 6. Сборка и Запуск
- [x] Настроить скрипты в `package.json`.
- [ ] Проверить работу на macOS.
