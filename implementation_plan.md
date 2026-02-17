# X-Stas-Player — План разработки и архитектура

> Десктопный видеоплеер на **Svelte 5 + Tailwind CSS 4 + Electron**.
> Минималистичный дизайн в стиле Apple с glassmorphism-контролами,
> blur-эффектами окна и управлением с клавиатуры/тачпада.

---

## Архитектура проекта

```
videoplayer/
├── electron/                  # Electron (Main Process) — Node.js
│   ├── main.js                #   Точка входа: окно, IPC, файловые ассоциации
│   └── preload.cjs            #   Мост main↔renderer: exposes electronAPI
│
├── src/                       # Svelte (Renderer Process) — браузерный контекст
│   ├── main.ts                #   Точка входа Svelte-приложения
│   ├── App.svelte             #   Корневой компонент: welcome-экран + drag&drop
│   ├── app.css                #   Глобальные стили + TailwindCSS
│   ├── vite-env.d.ts          #   TypeScript-типы для electronAPI
│   │
│   └── lib/                   # Библиотека компонентов и логики
│       ├── VideoPlayer.svelte #   Основной плеер: видео + контролы + обработчики
│       ├── utils.ts           #   Утилиты (formatTime)
│       │
│       ├── components/        #   UI-компоненты плеера
│       │   ├── VideoControls.svelte  # Нижняя панель: прогресс, громкость, PiP
│       │   ├── PlayOverlay.svelte    # Большая кнопка Play по центру
│       │   └── SpeedIndicator.svelte # Бейдж скорости (1.5x, 2x)
│       │
│       ├── icons/             #   SVG-иконки
│       │   ├── index.ts       #     Коллекция inline-иконок (play, mute, volume, pip)
│       │   └── DropVideoIcon.svelte  # Иконка кинопленки для welcome-экрана
│       │
│       └── logic/             #   Бизнес-логика (отделена от UI)
│           ├── keyboard.svelte.ts   # Обработчик клавиатуры (Space, стрелки)
│           ├── touchpad.svelte.ts   # Обработчик жестов тачпада (горизонтальный свайп)
│           └── video-actions.ts     # Утилиты: safePlay, togglePlay, fullscreen, PiP
│
├── build/                     # Ресурсы для сборки (иконки приложения)
├── index.html                 # HTML-точка входа для Vite
├── vite.config.js             # Конфигурация Vite (Svelte + Tailwind плагины)
├── svelte.config.js           # Конфигурация Svelte
├── tsconfig.json              # Конфигурация TypeScript
└── package.json               # Зависимости, скрипты, electron-builder конфиг
```

### Как взаимодействуют процессы

```
┌─────────────────────────────────────────────────────────────────┐
│                        Electron                                 │
│                                                                 │
│  ┌──────────────────┐    IPC (каналы)    ┌───────────────────┐  │
│  │   Main Process   │◄──────────────────►│ Renderer Process  │  │
│  │   (electron/     │                    │ (src/ — Svelte)   │  │
│  │    main.js)      │  resize-window ──► │                   │  │
│  │                  │  hide-window ────► │  window.          │  │
│  │  Управляет:      │  show-window ────► │  electronAPI.*    │  │
│  │  - Окно          │  get-initial-file► │                   │  │
│  │  - Файлы         │  ◄── open-file     │  Отображает:      │  │
│  │  - Жизненный     │                    │  - UI (Svelte)    │  │
│  │    цикл          │                    │  - Видео (<video>)│  │
│  └──────────────────┘    preload.cjs     └───────────────────┘  │
│                        (мост/bridge)                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## Этапы реализации

### 1. Инициализация проекта
> Базовая настройка инструментов и зависимостей.

- [x] Создать проект на Vite с шаблоном Svelte 5
  - *Svelte 5 использует новый синтаксис: `$state()`, `$effect()`, `$props()`, `$bindable()`*
- [x] Установить Tailwind CSS 4
  - *Tailwind 4 подключается как Vite-плагин (`@tailwindcss/vite`), без отдельного `tailwind.config.js`*
- [x] Установить Electron и зависимости
  - `electron` — среда выполнения
  - `electron-builder` — сборка дистрибутивов (.dmg, .exe)
  - `concurrently` — параллельный запуск Vite dev-сервера и Electron

### 2. Настройка Electron (Main Process)
> Файл: `electron/main.js` — управляет окном, жизненным циклом и IPC.

- [x] Создать точку входа `electron/main.js`
- [x] Настроить создание окна (`BrowserWindow`):
  - `frame: false` — убрать стандартную рамку ОС
  - `titleBarStyle: 'hidden'` — скрыть заголовок (на macOS кнопки светофора остаются)
  - `transparent: true` на macOS / `false` на Windows (для acrylic blur)
  - `vibrancy: 'fullscreen-ui'` — blur-эффект на macOS
  - `backgroundMaterial: 'acrylic'` — blur-эффект на Windows 11
  - `webSecurity: false` — разрешить загрузку `file://` URL (локальные видео)
- [x] Настроить загрузку URL:
  - Dev: `http://localhost:5173` (Vite dev-server)
  - Production: `dist/index.html` (собранный бандл)
- [x] Реализовать preload-скрипт (`electron/preload.cjs`):
  - Через `contextBridge` безопасно предоставляет `window.electronAPI`
  - Методы: `resizeWindow`, `onOpenFile`, `getInitialFile`, `hideWindow`, `showWindow`, `getPlatform`

### 3. Настройка Svelte (Renderer Process)
> Файлы: `src/main.ts`, `src/app.css` — инициализация UI и глобальные стили.

- [x] Очистить стартовый шаблон Vite
- [x] Настроить глобальные стили:
  - `html`, `body`: 100% ширины/высоты, `overflow: hidden`, прозрачный фон
  - `-webkit-app-region: no-drag` — по умолчанию запретить перетаскивание окна
- [x] Создать TypeScript-декларацию `electronAPI` (`src/vite-env.d.ts`)

### 4. Реализация функционала

#### 4.1. Drag & Drop
> Файл: `src/App.svelte` — перетаскивание видеофайлов в окно.

- [x] Обработка событий `drop`, `dragover`, `dragleave` в `App.svelte`
- [x] При сбросе файла:
  - Проверка типа файла (MIME `video/*` или расширение `.mp4`, `.webm`)
  - Создание `blob:` URL через `URL.createObjectURL()`
  - Передача URL в `<VideoPlayer>`
- [x] Визуальная индикация при перетаскивании (синяя подсветка + рамка)
- [x] Освобождение памяти: `URL.revokeObjectURL()` при загрузке нового видео

#### 4.2. Воспроизведение видео
> Файл: `src/lib/VideoPlayer.svelte` — основной компонент плеера.

- [x] Создать компонент `<VideoPlayer>` с HTML5 `<video>`
- [x] Двусторонняя привязка состояния: `bind:paused`, `bind:currentTime`, `bind:volume`, `bind:duration`
- [x] Автозапуск видео (`autoplay`)
- [x] Клик по видео → play/pause
- [x] Двойной клик → полноэкранный режим

#### 4.3. Адаптация окна под видео
> Файлы: `src/lib/VideoPlayer.svelte` → `electron/main.js` (через IPC).

- [x] При событии `loadedmetadata` — получить `videoWidth` и `videoHeight`
- [x] Отправить IPC-сообщение `resize-window` с размерами
- [x] Main process: масштабировать окно пропорционально, не выходя за границы экрана
  - *Отступ 100px от краёв, пропорциональное уменьшение при необходимости*

### 5. UI и эстетика
> Минималистичный дизайн: всё строится на прозрачности, blur-эффектах и плавных анимациях.

- [x] Скрыть стандартные рамки окна (конфигурация `BrowserWindow`)
- [x] Welcome-экран (пустое состояние):
  - Иконка кинопленки со стрелкой (`DropVideoIcon.svelte`)
  - Подсказки клавиатурных сочетаний (стилизованные `<kbd>`)
  - Поддерживаемые форматы: MP4 • WebM
- [x] Drag Region (область перетаскивания окна):
  - Welcome-экран: верхняя полоса 48px
  - Режим видео: верхняя полоса 64px с градиентом (появляется при наведении мыши)
- [x] Платформо-зависимые стили фона:
  - macOS: `bg-white/50` / `bg-black/40` (более прозрачный, т.к. vibrancy)
  - Windows: `bg-white/60` / `bg-black/40` (плотнее из-за acrylic)

### 6. Сборка и запуск
> Скрипты в `package.json`.

- [x] Настроить скрипты:
  - `npm run dev` — Vite dev-server + Electron (через concurrently)
  - `npm run build` — сборка Vite
  - `npm run build:mac` — сборка .dmg для macOS
  - `npm run build:win` — сборка portable .exe для Windows (x64 + arm64)
- [ ] Финальная проверка на macOS
- [ ] Финальная проверка на Windows

### 7. Кастомные элементы управления (Apple Style)
> Файлы: `VideoControls.svelte`, `PlayOverlay.svelte`, `SpeedIndicator.svelte`

- [x] Отключить стандартные `<video controls>`
- [x] Нижняя панель управления (`VideoControls.svelte`):
  - Дизайн «Liquid Glass»: `bg-black/40 backdrop-blur-2xl backdrop-saturate-150`
  - Скруглённые углы `rounded-3xl`, тонкая граница `border-white/10`
  - Текущее время + прогресс-бар + длительность
  - Кнопка PiP (Picture-in-Picture)
  - Регулятор громкости + кнопка mute
  - Плавный выезд снизу (cubic-bezier(0.32, 0.72, 0, 1))
- [x] Кнопка Play по центру (`PlayOverlay.svelte`):
  - Полупрозрачный круг с иконкой ▶
  - Появляется только на паузе + при видимых контролах
- [x] Индикатор скорости (`SpeedIndicator.svelte`):
  - Бейдж "1.5x" / "2x" в правом верхнем углу
  - Появляется на 500мс при изменении скорости
- [x] Автоскрытие контролов через 1 секунду бездействия
  - Не скрываются, если курсор над панелью или перетаскивается прогресс-бар
  - Курсор скрывается вместе с контролами (`cursor-none`)

#### 7.1. Управление с клавиатуры
> Файл: `src/lib/logic/keyboard.svelte.ts`
> Принцип: таймер 200мс отличает короткое нажатие от длинного.

- [x] **Пробел (Space)**:
  - Короткое нажатие → toggle play/pause
  - Зажатие (>200мс) → ускорение ×2 (при отпускании — возврат к userPlaybackRate)
- [x] **Стрелки ←→ (ArrowLeft/ArrowRight)**:
  - Короткое нажатие → перемотка ±1 секунда
  - Зажатие → (>200мс):
    - Вправо: playbackRate = 16 (быстрая перемотка вперёд)
    - Влево: прыжки назад на 3 секунды каждые 300мс (имитация rewind)
- [x] **Стрелки ↑↓ (ArrowUp/ArrowDown)**:
  - Переключение скорости: 1.0 → 1.25 → 1.5 → 2.0 (и обратно)
  - При изменении показывается SpeedIndicator

#### 7.2. Управление тачпадом
> Файл: `src/lib/logic/touchpad.svelte.ts`

- [x] Горизонтальный свайп (scroll) по тачпаду → перемотка видео
  - Чувствительность: 0.05 сек/пиксель (100px свайпа ≈ 5 секунд)
  - Инвертированное направление (свайп вправо = перемотка вперёд)
  - `preventDefault()` блокирует навигацию браузера

### 8. Доработки и улучшения

- [x] Blur-эффекты окна:
  - macOS: `vibrancy: 'fullscreen-ui'` + `visualEffectState: 'active'`
  - Windows 11: `backgroundMaterial: 'acrylic'`
  - *На Windows `transparent: false`, иначе acrylic не работает*
- [x] Плавная перемотка назад (вместо `playbackRate = -2`, который не поддерживается HTML5)
- [x] Авто-запуск видео при Drag & Drop (`autoplay` атрибут)
- [x] Адаптивность панели: `max-w-2xl`, `flex-nowrap`, `shrink-0` для элементов

### 9. Файловые ассоциации и "Открыть с помощью..."
> Файл: `electron/main.js` — обработка файлов из ОС.

- [x] **macOS**: событие `app.on('open-file')` — ОС передаёт путь к файлу
- [x] **Windows/Linux**: аргумент командной строки — путь к файлу в `process.argv`
- [x] **Single Instance Lock**: предотвращение запуска нескольких копий
  - При повторном запуске файл отправляется в уже открытое окно через IPC
- [x] Конвертация пути в `file://` URL (через `pathToFileURL` из Node.js)
- [x] Конфигурация `fileAssociations` в `package.json` (`.mp4`, `.webm`)

### 10. Picture-in-Picture (PiP)
> Файлы: `VideoPlayer.svelte`, `video-actions.ts`, `electron/main.js`

- [x] Кнопка PiP в панели управления
- [x] При входе в PiP → скрытие окна Electron (`hideWindow`)
- [x] При выходе из PiP → показ окна Electron (`showWindow`)
- [x] Отслеживание через события `enterpictureinpicture` / `leavepictureinpicture`

### 11. Конфигурация сборки (Build & Distribution)
> Настройки `electron-builder` в `package.json`.

- [x] Настроить `electron-builder` для кросс-платформенной сборки
- [x] macOS: сборка в `.dmg` (arm64 + x64)
- [x] Windows: portable `.exe` (x64 + arm64)
- [x] Скрипты: `npm run build:mac`, `npm run build:win`

### 12. Миграция на TypeScript
> Строгая типизация для надёжности кода.

- [x] Установка `typescript`, `svelte-check`
- [x] Конфигурация `tsconfig.json` (strict mode)
- [x] Конвертация `.js` → `.ts`, добавление `lang="ts"` в Svelte-компоненты
- [x] Типизация `electronAPI` через расширение `Window` интерфейса
- [x] Выделение логики в отдельные `.ts`-файлы (`keyboard.svelte.ts`, `touchpad.svelte.ts`, `video-actions.ts`)

---

## Ключевые технические решения

| Решение | Почему |
|---------|--------|
| `webSecurity: false` | Чтобы `<video>` мог загружать локальные файлы через `file://` URL |
| `transparent` только на macOS | На Windows `transparent: true` ломает acrylic blur |
| `contextIsolation: true` | Безопасность: renderer не имеет прямого доступа к Node.js |
| `safePlay()` вместо `.play()` | `play()` возвращает Promise, может кинуть AbortError при быстром play/pause |
| Fullscreen на `parentNode` | Чтобы кастомные контролы отображались поверх видео в fullscreen |
| Rewind через setInterval | HTML5 video не поддерживает отрицательный `playbackRate` |
| `base: './'` в Vite | Electron загружает HTML через `file://`, нужны относительные пути |
| Single Instance Lock | На Windows «Открыть с помощью...» запускает новый процесс каждый раз |
