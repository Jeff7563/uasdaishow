import {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  shell,
} from 'electron';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import chokidar, { type FSWatcher } from 'chokidar';
import { CcusageService } from './services/ccusageCli';
import { NotificationService } from './services/notificationService';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Single Instance Lock: Prevent multiple copies of widget running concurrently
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
  process.exit(0);
}

// Fix Windows GPU acceleration / transparent window rendering issues
app.disableHardwareAcceleration();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isPinned = true; // Always-on-top state
let isExpanded = false; // Collapsed by default
let currentOpacity = 1.0;

const ccusageService = new CcusageService();
const notificationService = new NotificationService();

let pollingTimer: NodeJS.Timeout | null = null;
let fileWatcher: FSWatcher | null = null;
let debounceTimer: NodeJS.Timeout | null = null;

const COLLAPSED_HEIGHT = 58;
const EXPANDED_HEIGHT = 540;
const WINDOW_WIDTH = 350;
const SCREEN_MARGIN = 24;
const SNAP_THRESHOLD = 24; // Magnetic snap distance in pixels

// High-frequency polling: 20 seconds
const POLL_INTERVAL = 20 * 1000;

let isSnapping = false;

function snapToNearestEdge() {
  if (!mainWindow || mainWindow.isDestroyed() || isSnapping) return;

  try {
    const bounds = mainWindow.getBounds();
    const display = screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay();
    const { x: dX, y: dY, width: dW, height: dH } = display.workArea;

    let targetX = bounds.x;
    let targetY = bounds.y;

    // Snap Left edge
    if (Math.abs(bounds.x - dX) <= SNAP_THRESHOLD) {
      targetX = dX;
    }
    // Snap Right edge
    else if (Math.abs((bounds.x + bounds.width) - (dX + dW)) <= SNAP_THRESHOLD) {
      targetX = dX + dW - bounds.width;
    }

    // Snap Top edge
    if (Math.abs(bounds.y - dY) <= SNAP_THRESHOLD) {
      targetY = dY;
    }
    // Snap Bottom edge
    else if (Math.abs((bounds.y + bounds.height) - (dY + dH)) <= SNAP_THRESHOLD) {
      targetY = dY + dH - bounds.height;
    }

    // Clamp within workArea bounds
    targetX = Math.max(dX, Math.min(targetX, dX + dW - bounds.width));
    targetY = Math.max(dY, Math.min(targetY, dY + dH - bounds.height));

    if (Math.round(targetX) !== bounds.x || Math.round(targetY) !== bounds.y) {
      isSnapping = true;
      mainWindow.setBounds({
        x: Math.round(targetX),
        y: Math.round(targetY),
        width: bounds.width,
        height: bounds.height,
      });
      setTimeout(() => {
        isSnapping = false;
      }, 80);
    }
  } catch (err) {
    console.error('[Main] snapToNearestEdge error:', err);
  }
}

function updateWindowBounds(expanded: boolean) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  isExpanded = expanded;

  try {
    const currentBounds = mainWindow.getBounds();
    const currentDisplay = screen.getDisplayMatching(currentBounds) || screen.getPrimaryDisplay();
    const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = currentDisplay.workArea;

    const targetHeight = expanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
    const targetWidth = WINDOW_WIDTH;

    // Preserve user's dragged X position!
    let newX = currentBounds.x;

    // Anchor bottom edge: expanding moves top up, collapsing moves top down
    const currentBottom = currentBounds.y + currentBounds.height;
    let newY = currentBottom - targetHeight;

    // Ensure window stays within workArea bounds
    newX = Math.max(displayX, Math.min(newX, displayX + screenWidth - targetWidth));
    newY = Math.max(displayY, Math.min(newY, displayY + screenHeight - targetHeight));

    // Magnetic snap on edge alignment
    if (Math.abs(newX - displayX) <= SNAP_THRESHOLD) {
      newX = displayX;
    } else if (Math.abs((newX + targetWidth) - (displayX + screenWidth)) <= SNAP_THRESHOLD) {
      newX = displayX + screenWidth - targetWidth;
    }

    if (Math.abs((newY + targetHeight) - (displayY + screenHeight)) <= SNAP_THRESHOLD) {
      newY = displayY + screenHeight - targetHeight;
    }

    console.log(`[Main] updateWindowBounds -> expanded: ${expanded}, targetHeight: ${targetHeight}, pos: (${newX}, ${newY})`);

    mainWindow.setMinimumSize(280, 40);
    mainWindow.setMaximumSize(600, 1000);

    mainWindow.setBounds({
      x: Math.round(newX),
      y: Math.round(newY),
      width: Math.round(targetWidth),
      height: Math.round(targetHeight),
    });
  } catch (err) {
    console.error('[Main] Failed to update window bounds:', err);
  }
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x: displayX, y: displayY, width: screenWidth, height: screenHeight } = primaryDisplay.workArea;

  const initialHeight = isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
  const x = Math.round(displayX + screenWidth - WINDOW_WIDTH - SCREEN_MARGIN);
  const y = Math.round(displayY + screenHeight - initialHeight - SCREEN_MARGIN);

  mainWindow = new BrowserWindow({
    width: WINDOW_WIDTH,
    height: initialHeight,
    x,
    y,
    minWidth: 280,
    minHeight: 40,
    maxWidth: 600,
    maxHeight: 1000,
    frame: false,
    transparent: true,
    alwaysOnTop: isPinned,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
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

  // Setup notification click handler to focus & expand widget
  notificationService.setOnClick(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) mainWindow.show();
    updateWindowBounds(true);
    mainWindow.webContents.send('widget:setExpandedState', true);
    mainWindow.focus();
  });

  mainWindow.webContents.on('did-finish-load', async () => {
    try {
      const data = await ccusageService.fetchUsage(true);
      mainWindow?.webContents.send('ccusage:data-updated', data);
      notificationService.checkAndNotify(data);
    } catch (err) {
      console.error('[Main] Initial fetch error:', err);
    }
  });

  // Magnetic screen edge snapping when window finishes moving
  mainWindow.on('moved', () => {
    snapToNearestEdge();
  });

  startPolling();
  startFileWatcher();

  mainWindow.on('closed', () => {
    mainWindow = null;
    stopPolling();
    stopFileWatcher();
    if (tray) {
      tray.destroy();
      tray = null;
    }
    app.quit();
    process.exit(0);
  });
}

function startPolling() {
  stopPolling();
  pollingTimer = setInterval(async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const data = await ccusageService.fetchUsage(false);
        mainWindow.webContents.send('ccusage:data-updated', data);
        notificationService.checkAndNotify(data);
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
        stabilityThreshold: 400,
        pollInterval: 150,
      },
    });

    const onFileActivity = (event: string, filePath: string) => {
      // Ignore SQLite WAL / SHM and temp files that fire on every keystroke
      if (
        filePath.endsWith('.db-shm') ||
        filePath.endsWith('.db-wal') ||
        filePath.endsWith('-wal') ||
        filePath.endsWith('.tmp')
      ) {
        return;
      }

      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          try {
            console.log(`[Watcher] Activity detected (${event}: ${path.basename(filePath)}), updating widget...`);
            const data = await ccusageService.fetchUsage(false);
            mainWindow.webContents.send('ccusage:data-updated', data);
            notificationService.checkAndNotify(data);
          } catch (err) {
            console.error('[Watcher] Update failed:', err);
          }
        }
      }, 2000); // 2s debounce
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

// --- System Tray ---
function setupTray() {
  try {
    const iconBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAARklEQVR4nGNgGJTAYu+PLdgw0RpXhH6/gw0TNAifZmRDiNKcnPbxPzImaAiyAeia0Q0ZCQaQFYgURyMDNRISukEkJ+UBAQDnelNUGPNV2QAAAABJRU5ErkJggg==';
    const icon = nativeImage.createFromDataURL(`data:image/png;base64,${iconBase64}`);
    tray = new Tray(icon);
    tray.setToolTip('AI Quota Monitor (Alt+Shift+Q)');

    const refreshMenu = () => {
      if (!tray) return;
      const isLogin = app.getLoginItemSettings().openAtLogin;
      const isVisible = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible();

      const contextMenu = Menu.buildFromTemplate([
        {
          label: 'AI Quota Monitor',
          enabled: false,
        },
        {
          label: 'Shortcut: Alt+Shift+Q',
          enabled: false,
        },
        { type: 'separator' },
        {
          label: isVisible ? 'Hide Widget' : 'Show Widget',
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            if (mainWindow.isVisible()) {
              mainWindow.hide();
            } else {
              mainWindow.show();
              mainWindow.focus();
            }
            refreshMenu();
          },
        },
        {
          label: isExpanded ? 'Collapse to Mini-Bar' : 'Expand Details',
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            if (!mainWindow.isVisible()) mainWindow.show();
            const next = !isExpanded;
            updateWindowBounds(next);
            mainWindow.webContents.send('widget:setExpandedState', next);
            refreshMenu();
          },
        },
        {
          label: 'Always on Top',
          type: 'checkbox',
          checked: isPinned,
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            isPinned = !isPinned;
            mainWindow.setAlwaysOnTop(isPinned, 'screen-saver');
            refreshMenu();
          },
        },
        { type: 'separator' },
        {
          label: 'Start with Windows',
          type: 'checkbox',
          checked: isLogin,
          click: () => {
            const next = !isLogin;
            app.setLoginItemSettings({
              openAtLogin: next,
              openAsHidden: false,
            });
            refreshMenu();
          },
        },
        {
          label: 'Refresh Quota Now',
          click: async () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              const data = await ccusageService.fetchUsage(true);
              mainWindow.webContents.send('ccusage:data-updated', data);
              notificationService.checkAndNotify(data);
            }
          },
        },
        { type: 'separator' },
        {
          label: 'Quit',
          click: () => {
            stopPolling();
            stopFileWatcher();
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.destroy();
            app.quit();
            process.exit(0);
          },
        },
      ]);

      tray.setContextMenu(contextMenu);
    };

    tray.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (!mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
      } else {
        const next = !isExpanded;
        updateWindowBounds(next);
        mainWindow.webContents.send('widget:setExpandedState', next);
      }
      refreshMenu();
    });

    tray.on('double-click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
      mainWindow.focus();
      refreshMenu();
    });

    refreshMenu();
  } catch (err) {
    console.warn('[Main] Failed to setup tray:', err);
  }
}

// --- Global Hotkeys ---
function registerGlobalShortcuts() {
  try {
    // Alt+Shift+Q: Quick toggle (Show / Expand / Collapse)
    globalShortcut.register('Alt+Shift+Q', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (!mainWindow.isVisible()) {
        mainWindow.show();
        mainWindow.focus();
      } else {
        const next = !isExpanded;
        updateWindowBounds(next);
        mainWindow.webContents.send('widget:setExpandedState', next);
      }
    });

    // Alt+Shift+H: Show / Hide Widget
    globalShortcut.register('Alt+Shift+H', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
  } catch (err) {
    console.warn('[Main] Could not register global shortcuts:', err);
  }
}

// --- IPC Handlers ---

// Handle Click Expand and Collapse
ipcMain.handle('window:setExpanded', (_, expanded: boolean) => {
  updateWindowBounds(expanded);
  return isExpanded;
});

ipcMain.on('window:setExpanded', (_, expanded: boolean) => {
  updateWindowBounds(expanded);
});

// Fetch data manually from renderer (Refresh button)
ipcMain.handle('ccusage:fetch', async () => {
  const data = await ccusageService.fetchUsage(true);
  notificationService.checkAndNotify(data);
  return data;
});

// Window controls
ipcMain.on('window:minimize', () => {
  updateWindowBounds(false);
});

ipcMain.on('window:close', () => {
  stopPolling();
  stopFileWatcher();
  if (tray) {
    tray.destroy();
    tray = null;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.destroy();
  }
  mainWindow = null;
  app.quit();
  process.exit(0);
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

// Window Opacity
ipcMain.handle('window:setOpacity', (_, opacity: number) => {
  if (!mainWindow || mainWindow.isDestroyed()) return currentOpacity;
  currentOpacity = Math.max(0.3, Math.min(1.0, opacity));
  mainWindow.setOpacity(currentOpacity);
  return currentOpacity;
});

ipcMain.handle('window:getOpacity', () => {
  return currentOpacity;
});

// Windows Startup
ipcMain.handle('app:toggleStartup', () => {
  const current = app.getLoginItemSettings().openAtLogin;
  const next = !current;
  app.setLoginItemSettings({ openAtLogin: next, openAsHidden: false });
  return next;
});

ipcMain.handle('app:isStartupEnabled', () => {
  return app.getLoginItemSettings().openAtLogin;
});

// One-Click External Web Launcher
ipcMain.handle('app:openExternal', async (_, targetUrl: string) => {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      await shell.openExternal(targetUrl);
    }
  } catch (err) {
    console.warn('[Main] Failed to open external URL:', targetUrl, err);
  }
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();
  setupTray();
  registerGlobalShortcuts();

  // Automatically enable Start with Windows when packaged (can be toggled in Tray)
  if (app.isPackaged) {
    try {
      const loginSettings = app.getLoginItemSettings();
      if (!loginSettings.openAtLogin) {
        app.setLoginItemSettings({
          openAtLogin: true,
          openAsHidden: false,
        });
      }
    } catch (err) {
      console.warn('[Main] Could not set openAtLogin:', err);
    }
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  stopPolling();
  stopFileWatcher();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
