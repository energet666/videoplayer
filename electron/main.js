import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow;
let fileToOpen = null;

// Handle file associations on macOS
app.on('open-file', (event, path) => {
    event.preventDefault();
    fileToOpen = path;
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('open-file', path);
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    } else if (app.isReady()) {
        if (process.platform === 'darwin' && process.env.NODE_ENV === 'development') {
            app.dock.setIcon(path.join(__dirname, '../build/icon.png'));
        }
        createWindow();
    }
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        frame: false,
        titleBarStyle: 'hidden',
        hasShadow: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,
        },
        backgroundColor: '#000000',
        minWidth: 320,
        minHeight: 240,
        ...(process.env.NODE_ENV === 'development' ? { icon: path.join(__dirname, '../build/icon.png') } : {})
    });

    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    }
}

app.whenReady().then(() => {
    // Check for file argument on Windows/Linux
    if (process.platform === 'win32' || process.platform === 'linux') {
        const argv = process.argv;
        const isDev = process.env.NODE_ENV === 'development';
        // In production: argv[0] is exe, argv[1] is file
        // In dev: argv[0] is electron, argv[1] is ., argv[2] is file
        const fileArgIndex = isDev ? 2 : 1;

        if (argv.length > fileArgIndex) {
            fileToOpen = argv[fileArgIndex];
        }
    }

    if (process.platform === 'darwin' && process.env.NODE_ENV === 'development') {
        app.dock.setIcon(path.join(__dirname, '../build/icon.png'));
    }

    createWindow();

    ipcMain.handle('get-initial-file', () => fileToOpen);

    ipcMain.on('resize-window', (event, { width, height }) => {
        console.log('Main process received resize-window:', width, height);
        if (mainWindow && !mainWindow.isDestroyed()) {
            const currentScreen = screen.getDisplayMatching(mainWindow.getBounds());
            const { width: screenWidth, height: screenHeight } = currentScreen.workAreaSize;

            // Padding to ensure window doesn't touch screen edges
            const padding = 100;
            const availableWidth = screenWidth - padding;
            const availableHeight = screenHeight - padding;

            let newWidth = width;
            let newHeight = height;

            // Check if scaling is needed
            if (newWidth > availableWidth || newHeight > availableHeight) {
                const widthRatio = availableWidth / width;
                const heightRatio = availableHeight / height;
                const scale = Math.min(widthRatio, heightRatio); // Scale down to fit

                newWidth = width * scale;
                newHeight = height * scale;
            }

            mainWindow.setContentSize(Math.floor(newWidth), Math.floor(newHeight));
            mainWindow.center();
        }
    });

    ipcMain.on('hide-window', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.hide();
        }
    });

    ipcMain.on('show-window', () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.show();
        }
    });

    app.on('activate', () => {

        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
