import { app, BrowserWindow, ipcMain, screen } from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import chokidar, { type FSWatcher } from 'chokidar';
import { CcusageService } from './services/ccusageCli';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Fix Windows GPU acceleration / transparent window rendering issues
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let isPinned = true; // Always-on-top state
let isExpanded = false; // Collapsed by default
const ccusageService = new CcusageService();
let pollingTimer: NodeJS.Timeout | null = null;
let fileWatcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;

const COLLAPSED_HEIGHT = 58;
const EXPANDED_HEIGHT = 540;
const WINDOW_WIDTH = 350;
const SCREEN_MARGIN = 24;

// High-frequency polling: 20 seconds
const POLL_INTERVAL = 20 * 1000;

function updateWindowBounds(expanded: boolean) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isExpanded = expanded;

  try {
    // Get the display where the window is currently located (supports multi-monitor setups)
    const bounds = mainWindow.getBounds();
    const currentDisplay = screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = currentDisplay.workArea;

    const targetHeight = expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
    const targetWidth = WINDOW_WIDTH;

    // Anchor to the bottom-right corner of the work area (above the Windows taskbar)
    const newX = displayX + screenWidth - targetWidth - SCREEN_MARGIN;
    const newY = displayY + screenHeight - targetHeight - SCREEN_MARGIN;

    console.log(`[Main] updateWindowBounds -> expanded: ${expanded}, targetHeight: ${targetHeight}, pos: (${newX}, ${newY})`);

    // Ensure Windows doesn't clamp the window size
    mainWindow.setMinimumSize(280, expanded ? 400 : 40);
    mainWindow.setMaximumSize(500, expanded ? 900 : 120);

    // Apply new bounds
    mainWindow.setBounds({
      x: newX,
      y: newY,
      width: targetWidth,
      height: targetHeight,
    });
  } catch (err) {
    console.error('[Main] Failed to update window bounds:', err);
  }
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = primaryDisplay.workArea;

  const initialHeight = isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
  const x = displayX + screenWidth - WINDOW_WIDTH - SCREEN_MARGIN;
  const y = displayY + screenHeight - initialHeight - SCREEN_MARGIN;

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: initialHeight,
    x,
    y,
    minWidth: 280,
    maxWidth: 500,
    frame: false,
    transparent: true,
    alwaysOnTop: isPinned,
    resizable: true,
    skipTaskbar: false,
    hasShadow: true,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      const data = await ccusageService.fetchUsage(true);
      mainWindow?.webContents.send('ccusage:data-updated', data);
    } catch (err) {
      console.error('[Main] Initial fetch error:', err);
    }
  });

  startPolling();
  startFileWatcher();

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopPolling();
    stopFileWatcher();
  });
}

function startPolling() {
  stopPolling();
  pollingTimer = setInterval(async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const data = await ccusageService.fetchUsage(false);
        mainWindow.webContents.send('ccusage:data-updated', data);
      } catch (err) {
        console.error('[Polling] Error during 20s background polling:', err);
      }
    }
  }, POLL_INTERVAL);
}

function stopPolling() {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
}

function startFileWatcher() {
  stopFileWatcher();
  const home = os.homedir();

  const watchTargets = [
    path.join(home, '.claude/history.jsonl'),
    path.join(home, '.claude/sessions'),
    path.join(home, '.codex/session_index.jsonl'),
    path.join(home, '.codex/logs_2.sqlite-wal'),
    path.join(home, '.gemini/antigravity/conversations'),
    path.join(home, '.gemini/antigravity/brain'),
  ].filter((p) => {
    try {
      return fs.existsSync(p) || fs.existsSync(path.dirname(p));
    } catch {
      return false;
    }
  });

  try {
    fileWatcher = chokidar.watch(watchTargets, {
      ignoreInitial: true,
      persistent: true,
      depth: 2,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    const onFileActivity = (event: string, filePath: string) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            console.log(`[Watcher] Activity detected (${event}: ${path.basename(filePath)}), updating widget...`);
            const data = await ccusageService.fetchUsage(true);
            mainWindow.webContents.send('ccusage:data-updated', data);
          } catch (err) {
            console.error('[Watcher] Update failed:', err);
          }
        }
      }, 400);
    };

    fileWatcher.on('all', onFileActivity);
  } catch (err) {
    console.warn('[Watcher] Could not start chokidar watcher:', err);
  }
}

function stopFileWatcher() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }
}

// --- IPC Handlers ---

// Handle Hover / Click Expand and Collapse
ipcMain.handle('window:setExpanded', (_, expanded: boolean) => {
  updateWindowBounds(expanded);
  return isExpanded;
});

ipcMain.on('window:setExpanded', (_, expanded: boolean) => {
  updateWindowBounds(expanded);
});

// Fetch data manually from renderer
ipcMain.handle('ccusage:fetch', async () => {
  return await ccusageService.fetchUsage(true);
});

// Window controls
ipcMain.on('window:minimize', () => {
  // Minimize collapses the window to the mini-bar
  updateWindowBounds(false);
});

ipcMain.on('window:close', () => {
  mainWindow?.close();
});

// Pin / Always-On-Top toggle
ipcMain.handle('window:togglePin', () => {
  if (!mainWindow) return isPinned;
  isPinned = !isPinned;
  mainWindow.setAlwaysOnTop(isPinned, 'screen-saver');
  return isPinned;
});

ipcMain.handle('window:isPinned', () => {
  return isPinned;
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopPolling();
  stopFileWatcher();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
