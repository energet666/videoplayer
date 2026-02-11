const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    resizeWindow: (width, height) => ipcRenderer.send('resize-window', { width, height }),
    onOpenFile: (callback) => ipcRenderer.on('open-file', (_event, value) => callback(value)),
    getInitialFile: () => ipcRenderer.invoke('get-initial-file'),
    hideWindow: () => ipcRenderer.send('hide-window'),
    showWindow: () => ipcRenderer.send('show-window'),
    getPlatform: () => process.platform
});
