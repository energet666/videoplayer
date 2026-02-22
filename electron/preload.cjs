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

    // Возвращает текущую платформу: 'darwin' (macOS), 'win32' (Windows), 'linux'
    // Используется в UI для платформо-зависимых стилей (например, прозрачность фона)
    getPlatform: () => process.platform,
});
