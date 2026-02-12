import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.avi', '.mov', '.webm', '.m4v'];

let mainWindow;
let fileToOpen = null;

/**
 * Extract video file path from command-line arguments.
 * On Windows, "Open with" passes the file path as a CLI argument.
 * We search for an argument that looks like a video file path
 * instead of relying on a fixed index, which is more reliable
 * across dev/production and different build targets (portable, nsis).
 */
function extractFileFromArgs(argv) {
    // Skip the first argument (executable path or 'electron')
    // and skip arguments starting with '-' (flags like --inspect)
    for (let i = 1; i < argv.length; i++) {
        const arg = argv[i];
        // Skip flags and '.' (used in dev mode as entry point)
        if (arg.startsWith('-') || arg === '.') continue;
        // Check if it's a video file by extension
        const ext = path.extname(arg).toLowerCase();
        if (VIDEO_EXTENSIONS.includes(ext)) {
            return arg;
        }
    }
    return null;
}

/**
 * Convert a native file path to a proper file:// URL string.
 * Uses Node's pathToFileURL which correctly handles:
 * - Windows backslashes -> forward slashes
 * - Drive letters (C: -> file:///C:/...)
 * - Special characters encoding
 */
function toFileURL(filePath) {
    return pathToFileURL(filePath).href;
}

// --- Single Instance Lock ---
// On Windows, "Open with" launches a new process each time.
// We use a single instance lock so that the second launch
// sends its argv to the first instance and then quits.
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
    // Another instance is already running — it will receive our argv
    // via the 'second-instance' event. Quit this instance.
    app.quit();
} else {
    // Handle second instance: extract file path and send to existing window
    app.on('second-instance', (_event, commandLine, _workingDirectory) => {
        const filePath = extractFileFromArgs(commandLine);
        if (filePath && mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('open-file', toFileURL(filePath));
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        }
    });

    // Handle file associations on macOS
    app.on('open-file', (event, filePath) => {
        event.preventDefault();
        fileToOpen = toFileURL(filePath);
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('open-file', fileToOpen);
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
        } else if (app.isReady()) {
            createWindow();
        }
    });

    function createWindow() {
        mainWindow = new BrowserWindow({
            width: 800,
            height: 600,
            frame: false,
            titleBarStyle: 'hidden',
            webPreferences: {
                preload: path.join(__dirname, 'preload.cjs'),
                contextIsolation: true,
                nodeIntegration: false,
                webSecurity: false,
            },
            transparent: process.platform !== 'win32', // false on Windows enables native blur effects
            vibrancy: 'fullscreen-ui', // macOS blur effect
            backgroundMaterial: 'acrylic', // Windows 11 blur effect
            visualEffectState: 'active', // keep vibrancy active when window is not focused
            backgroundColor: '#00000000', // fully transparent background
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
            const filePath = extractFileFromArgs(process.argv);
            if (filePath) {
                fileToOpen = toFileURL(filePath);
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
}
