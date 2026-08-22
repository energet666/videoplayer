// ============================================================================
// Главный процесс Electron (Main Process)
// ============================================================================
// Этот файл — точка входа Electron-приложения. Он запускается в Node.js-среде
// и управляет жизненным циклом приложения: создание окна, обработка аргументов
// командной строки, IPC-взаимодействие с renderer-процессом и т.д.
// ============================================================================

import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';

// __dirname не доступен в ESM-модулях, поэтому вычисляем его вручную
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Список поддерживаемых видеоформатов (используется для определения,
// является ли аргумент командной строки путём к видеофайлу)
const VIDEO_EXTENSIONS = ['.mp4', '.m4v', '.webm', '.ogv'];

// Ссылка на главное окно (BrowserWindow). Хранится глобально, чтобы
// иметь доступ из обработчиков событий (second-instance, open-file и т.д.)
let mainWindow;

// Путь к файлу, который нужно открыть при запуске. Заполняется из аргументов
// командной строки (Windows/Linux) или из события open-file (macOS)
let fileToOpen = null;

/**
 * Извлекает путь к видеофайлу из аргументов командной строки.
 *
 * На Windows при «Открыть с помощью...» путь к файлу передаётся как
 * аргумент командной строки. Мы ищем аргумент, который выглядит как
 * путь к видеофайлу (по расширению), вместо привязки к конкретному
 * индексу — это надёжнее для разных режимов запуска (dev / production / portable).
 *
 * @param {string[]} argv - Массив аргументов командной строки
 * @returns {string|null} - Путь к видеофайлу или null
 */
function extractFileFromArgs(argv) {
    // Пропускаем первый аргумент (путь к исполняемому файлу или 'electron')
    // и аргументы, начинающиеся с '-' (флаги вроде --inspect)
    for (let i = 1; i < argv.length; i++) {
        const arg = argv[i];
        // Пропускаем флаги и '.' (используется в dev-режиме как entry point)
        if (arg.startsWith('-') || arg === '.') continue;
        // Проверяем расширение файла
        const ext = path.extname(arg).toLowerCase();
        if (VIDEO_EXTENSIONS.includes(ext)) {
            return arg;
        }
    }
    return null;
}

/**
 * Конвертирует локальный путь к файлу в URL вида file://
 *
 * Используем встроенную Node.js функцию pathToFileURL, которая корректно
 * обрабатывает:
 * - Обратные слеши Windows → прямые слеши
 * - Буквы дисков (C: → file:///C:/...)
 * - Специальные символы (пробелы, кириллица и т.д.)
 *
 * @param {string} filePath - Абсолютный путь к файлу
 * @returns {string} - URL вида file:///...
 */
function toFileURL(filePath) {
    return pathToFileURL(filePath).href;
}

function isPositiveFiniteNumber(value) {
    return Number.isFinite(value) && value > 0;
}

// ============================================================================
// Блокировка единственного экземпляра (Single Instance Lock)
// ============================================================================
// На Windows каждое «Открыть с помощью...» запускает новый процесс.
// Мы блокируем повторный запуск: если приложение уже открыто, второй
// экземпляр передаёт свои аргументы первому и завершается.
// ============================================================================
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // Другой экземпляр уже запущен — он получит наши argv
    // через событие 'second-instance'. Завершаем текущий процесс.
    app.quit();
} else {
    // ========================================================================
    // Обработка второго экземпляра
    // ========================================================================
    // Когда пользователь пытается открыть файл, а приложение уже запущено,
    // срабатывает это событие. Извлекаем путь к файлу из commandLine
    // и отправляем его в renderer-процесс через IPC-канал 'open-file'.
    // ========================================================================
    app.on('second-instance', (_event, commandLine, _workingDirectory) => {
        const filePath = extractFileFromArgs(commandLine);
        if (filePath && mainWindow && !mainWindow.isDestroyed()) {
            // Отправляем URL файла в renderer-процесс
            mainWindow.webContents.send('open-file', toFileURL(filePath));
            // Восстанавливаем окно, если оно было свёрнуто
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    // ========================================================================
    // Обработка файловых ассоциаций на macOS
    // ========================================================================
    // На macOS при «Открыть с помощью...» система отправляет событие
    // 'open-file' вместо передачи аргументов через командную строку.
    // Это событие может сработать как ДО, так и ПОСЛЕ создания окна.
    // ========================================================================
    app.on('open-file', (event, filePath) => {
        event.preventDefault(); // Предотвращаем стандартное поведение Electron
        fileToOpen = toFileURL(filePath);

        if (mainWindow && !mainWindow.isDestroyed()) {
            // Окно уже создано — отправляем файл в renderer
            mainWindow.webContents.send('open-file', fileToOpen);
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        } else if (app.isReady()) {
            // Приложение готово, но окна нет — создаём его.
            // fileToOpen уже установлен и будет получен через get-initial-file
            createWindow();
        }
        // Если app ещё не ready — fileToOpen сохранится и будет использован
        // при создании окна в app.whenReady()
    });

    /**
     * Создаёт главное окно приложения (BrowserWindow).
     *
     * Настройки окна включают:
     * - Без рамки (frame: false), свои кнопки окна вместо системных
     * - Прозрачность и blur-эффекты (vibrancy для macOS, acrylic для Windows 11)
     * - Безопасность: contextIsolation включён, nodeIntegration выключен
     * - webSecurity выключен только в dev-режиме (в проде включён)
     */
    function createWindow() {
        mainWindow = new BrowserWindow({
            width: 800,          // Начальная ширина окна (пикселей)
            height: 600,         // Начальная высота окна (пикселей)
            show: false,         // Скрываем окно до применения ресайза
            frame: false,        // Убираем рамку ОС вместе с системными кнопками окна.
            // ВАЖНО: titleBarStyle: 'hidden' здесь намеренно НЕ используется.
            // Это macOS-only опция, которая скрывает заголовок, но ОСТАВЛЯЕТ
            // «светофор» — он ложился поверх видео. На Windows её эффекта нет
            // вовсе, поэтому там кнопок не было совсем. Чтобы поведение было
            // одинаковым на всех платформах, системные кнопки убраны полностью,
            // а свои (fullscreen / закрыть) рисуются в VideoControls.svelte.
            webPreferences: {
                preload: path.join(__dirname, 'preload.cjs'), // Preload-скрипт (мост между main и renderer)
                contextIsolation: true,   // Изоляция контекста (безопасность)
                nodeIntegration: false,   // Запрещаем Node.js API в renderer
                webSecurity: process.env.NODE_ENV !== 'development',
            },
            // На Windows transparent: false, чтобы работал acrylic blur.
            // На macOS/Linux — transparent: true для vibrancy.
            transparent: process.platform !== 'win32',
            vibrancy: 'fullscreen-ui',       // macOS: blur-эффект (размытие фона за окном)
            backgroundMaterial: 'acrylic',   // Windows 11: acrylic blur-эффект
            visualEffectState: 'active',     // macOS: сохранять vibrancy даже при потере фокуса
            backgroundColor: '#00000000',    // Полностью прозрачный фон (AARRGGBB)
            minWidth: 320,       // Минимальная ширина окна
            minHeight: 240,      // Минимальная высота окна
            // Экран приветствия ресайзить незачем: подсказки свёрстаны под
            // стартовые 800×600, а при сужении окна колонки схлопываются и
            // низ списка обрезается. Ресайз включается обратно в обработчике
            // 'resize-window' — то есть ровно тогда, когда загрузилось видео
            // и у окна появился осмысленный aspect ratio.
            resizable: false,
            // В dev-режиме устанавливаем иконку вручную (в production — берётся из сборки)
            ...(process.env.NODE_ENV === 'development' ? { icon: path.join(__dirname, '../build/icon.png') } : {})
        });

        const isDev = process.env.NODE_ENV === 'development';

        if (isDev) {
            // В разработке загружаем Vite dev-сервер и открываем DevTools
            mainWindow.loadURL('http://localhost:5173');
            mainWindow.webContents.openDevTools({ mode: 'detach' });
        } else {
            // В production загружаем собранный HTML из папки dist
            mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
        }

        // ====================================================================
        // Проброс состояния полноэкранного режима в renderer
        // ====================================================================
        // Кнопка fullscreen в панели управления должна показывать правильную
        // иконку (развернуть / свернуть). Слушаем нативные события окна, а не
        // только свои клики: в fullscreen можно войти и выйти системными
        // способами (Ctrl+Cmd+F на macOS, F11, жест мышью по краю экрана).
        const sendFullscreenState = (isFullscreen) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('fullscreen-changed', isFullscreen);
            }
        };
        mainWindow.on('enter-full-screen', () => sendFullscreenState(true));
        mainWindow.on('leave-full-screen', () => sendFullscreenState(false));

        mainWindow.once('ready-to-show', () => {
            if (!fileToOpen) {
                mainWindow.show();
            } else {
                // Фоллбэк: если метаданные видео не загрузятся за 1 секунду
                setTimeout(() => {
                    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
                        mainWindow.show();
                    }
                }, 1000);
            }
        });
    }

    // ========================================================================
    // Инициализация приложения
    // ========================================================================
    // app.whenReady() срабатывает, когда Electron полностью инициализирован.
    // Здесь мы: проверяем аргументы для Windows/Linux, создаём окно
    // и регистрируем IPC-обработчики.
    // ========================================================================
    app.whenReady().then(() => {
        // На Windows/Linux проверяем аргументы командной строки для файла
        // (на macOS это обрабатывается через событие 'open-file' выше)
        if (process.platform === 'win32' || process.platform === 'linux') {
            const filePath = extractFileFromArgs(process.argv);
            if (filePath) {
                fileToOpen = toFileURL(filePath);
            }
        }

        // В dev-режиме на macOS устанавливаем иконку в Dock вручную
        if (process.platform === 'darwin' && process.env.NODE_ENV === 'development') {
            app.dock.setIcon(path.join(__dirname, '../build/icon.png'));
        }

        // Создаём главное окно
        createWindow();

        // ====================================================================
        // IPC-обработчики (Inter-Process Communication)
        // ====================================================================
        // Это каналы связи между main-процессом и renderer-процессом (UI).
        // Renderer вызывает эти функции через window.electronAPI (см. preload.cjs)
        // ====================================================================

        // Renderer запрашивает начальный файл (если приложение открыто через "Открыть с помощью")
        ipcMain.handle('get-initial-file', () => fileToOpen);

        // Renderer просит изменить размер окна (при загрузке метаданных видео).
        // Окно масштабируется пропорционально, чтобы вместить видео и не выходить за экран.
        ipcMain.on('resize-window', (event, { width, height }) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                if (!isPositiveFiniteNumber(width) || !isPositiveFiniteNumber(height)) {
                    return;
                }

                // Видео загрузилось — возвращаем окну ручной ресайз, который был
                // выключен для экрана приветствия (см. createWindow).
                // Делаем это ДО setAspectRatio/setContentSize: у нерезайзимого
                // окна пропорции задавать нечему.
                mainWindow.setResizable(true);

                // Фиксируем пропорции окна по соотношению сторон текущего видео.
                // Это заставляет ручной ресайз (перетаскивание краёв/углов)
                // сохранять aspect ratio.
                mainWindow.setAspectRatio(width / height);

                // Определяем экран, на котором находится окно
                const currentScreen = screen.getDisplayMatching(mainWindow.getBounds());
                const { width: screenWidth, height: screenHeight } = currentScreen.workAreaSize;

                // Отступ от краёв экрана (пикселей), чтобы окно не прилипало к краям
                const padding = 100;
                const availableWidth = screenWidth - padding;
                const availableHeight = screenHeight - padding;

                let newWidth = Math.min(width, 8192);
                let newHeight = Math.min(height, 8192);

                // Если видео больше экрана — масштабируем пропорционально
                if (newWidth > availableWidth || newHeight > availableHeight) {
                    const widthRatio = availableWidth / width;
                    const heightRatio = availableHeight / height;
                    const scale = Math.min(widthRatio, heightRatio); // Берём меньший множитель

                    newWidth = width * scale;
                    newHeight = height * scale;
                }

                // Устанавливаем размер контента (без учёта рамки) и центрируем
                mainWindow.setContentSize(Math.floor(newWidth), Math.floor(newHeight));
                mainWindow.center();

                // Если окно было скрыто (при запуске), показываем его после ресайза
                if (!mainWindow.isVisible()) {
                    mainWindow.show();
                }
            }
        });

        // ====================================================================
        // Сохранение лога событий плеера (только dev)
        // ====================================================================
        // Renderer постоянно держит в памяти последние события (см.
        // src/lib/logic/debug-log.ts) и присылает их сюда, когда поймано
        // зависание. В production канал не регистрируется вовсе — писать
        // файлы по просьбе renderer'а в released-сборке незачем.
        if (process.env.NODE_ENV === 'development') {
            ipcMain.handle('write-debug-log', async (event, content) => {
                if (typeof content !== 'string' || content.length > 16 * 1024 * 1024) {
                    return null;
                }

                try {
                    const dir = path.join(process.cwd(), 'debug-logs');
                    await fs.promises.mkdir(dir, { recursive: true });

                    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const file = path.join(dir, `player-${stamp}.jsonl`);
                    await fs.promises.writeFile(file, content, 'utf8');

                    return file;
                } catch (error) {
                    console.error('Не удалось сохранить лог событий:', error);
                    return null;
                }
            });
        }

        // Renderer просит скрыть окно (используется при входе в PiP-режим)
        ipcMain.on('hide-window', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.hide();
            }
        });

        // Renderer просит показать окно (используется при выходе из PiP-режима)
        ipcMain.on('show-window', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.show();
            }
        });

        // Renderer просит свернуть окно (правый клик по видео).
        // Именно minimize(), а не hide(): свёрнутое окно остаётся в Dock/панели
        // задач и возвращается кликом по нему, а спрятанное вернуть нечем.
        ipcMain.on('minimize-window', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.minimize();
            }
        });

        // Renderer просит закрыть окно (кнопка «крестик» в панели управления).
        // Заменяет системную кнопку закрытия, которой нет при frame: false.
        // На Windows/Linux за этим последует window-all-closed → app.quit(),
        // на macOS приложение по обычаю платформы останется в Dock.
        ipcMain.on('close-window', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.close();
            }
        });

        // Renderer просит переключить полноэкранный режим.
        // Используем нативный fullscreen окна, а не HTML5 Fullscreen API:
        // на macOS это даёт «настоящий» полный экран со скрытием строки меню,
        // то есть ровно то, что раньше делала зелёная кнопка «светофора».
        ipcMain.on('toggle-fullscreen', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
        });

        // Renderer запрашивает текущее состояние fullscreen при монтировании
        ipcMain.handle('is-fullscreen', () => {
            return mainWindow && !mainWindow.isDestroyed()
                ? mainWindow.isFullScreen()
                : false;
        });

        // macOS: при клике на иконку в Dock — создаём окно, если все закрыты
        app.on('activate', () => {
            if (BrowserWindow.getAllWindows().length === 0) createWindow();
        });
    });

    // На Windows и Linux приложение завершается при закрытии всех окон.
    // На macOS (darwin) приложение остаётся в Dock.
    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin') app.quit();
    });
}
