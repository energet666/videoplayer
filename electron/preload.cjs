// ============================================================================
// Preload-скрипт (мост между Main и Renderer процессами)
// ============================================================================
// Этот файл выполняется в контексте renderer-процесса, но с доступом к Node.js API.
// Через contextBridge мы безопасно предоставляем renderer-процессу (UI) ограниченный
// набор функций для взаимодействия с main-процессом через IPC.
//
// Все функции становятся доступны в renderer как window.electronAPI.xxx
// ============================================================================

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    // Отправляет запрос на изменение размера окна (при загрузке видео).
    // Main-процесс подстроит окно под размер видео с учётом размера экрана.
    resizeWindow: (width, height) => ipcRenderer.send('resize-window', { width, height }),

    // Подписка на событие открытия файла.
    // Срабатывает, когда пользователь открывает файл через "Открыть с помощью..."
    // при уже запущенном приложении (second-instance на Windows, open-file на macOS).
    onOpenFile: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('open-file', handler);
        return () => ipcRenderer.removeListener('open-file', handler);
    },

    // Запрашивает начальный файл (если приложение было запущено с аргументом — путём к файлу).
    // Возвращает Promise<string | null>: URL файла или null, если запущено без файла.
    getInitialFile: () => ipcRenderer.invoke('get-initial-file'),

    // Скрывает главное окно (используется при входе в режим Picture-in-Picture)
    hideWindow: () => ipcRenderer.send('hide-window'),

    // Показывает главное окно (используется при выходе из режима Picture-in-Picture)
    showWindow: () => ipcRenderer.send('show-window'),

    // Закрывает окно приложения (кнопка «крестик» в панели управления).
    // Нужна, потому что системных кнопок окна нет (frame: false в main.js).
    closeWindow: () => ipcRenderer.send('close-window'),

    // Переключает нативный полноэкранный режим окна
    toggleFullscreen: () => ipcRenderer.send('toggle-fullscreen'),

    // Возвращает текущее состояние полноэкранного режима: Promise<boolean>
    isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),

    // Подписка на смену полноэкранного режима. Срабатывает и на наши клики,
    // и на системные способы входа/выхода (Ctrl+Cmd+F, F11).
    // Возвращает функцию отписки.
    onFullscreenChange: (callback) => {
        const handler = (_event, value) => callback(value);
        ipcRenderer.on('fullscreen-changed', handler);
        return () => ipcRenderer.removeListener('fullscreen-changed', handler);
    },

    // Сохранение лога событий плеера в файл. Существует только в dev-режиме:
    // в production соответствующего обработчика в main-процессе нет.
    ...(process.env.NODE_ENV === 'development'
        ? { writeDebugLog: (content) => ipcRenderer.invoke('write-debug-log', content) }
        : {}),

    // Возвращает текущую платформу: 'darwin' (macOS), 'win32' (Windows), 'linux'
    // Используется в UI для платформо-зависимых стилей (например, прозрачность фона)
    getPlatform: () => process.platform,
});
