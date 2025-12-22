const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { setupIPC } = require('./ipc-handlers');
const autoUpdater = require('../launcher/auto-updater');
const { exec } = require('child_process');

let mainWindow;
let remoteMain;

// Kontrola admin práv na Windows
if (process.platform === 'win32') {
  exec('net session', (error) => {
    if (error) {
      console.log('[ADMIN] Aplikace neběží jako admin, restartuji...');
      const { spawn } = require('child_process');
      const args = process.argv.slice(1);
      spawn('powershell', ['-Command', 'Start-Process', `"${process.execPath}"`, '-Verb', 'RunAs'], {
        detached: true,
        stdio: 'ignore'
      }).unref();
      app.quit();
    } else {
      console.log('[ADMIN] Aplikace běží s admin právy ✓');
    }
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    frame: false,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true
    },
    icon: path.join(__dirname, '../../assets/VOID-CRAFT.ico')
  });

  // Přesměrování console.log z renderer do main (CMD)
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[RENDERER] ${message}`);
  });

  if (remoteMain) {
    remoteMain.enable(mainWindow.webContents);
  }

  // Otevřít DevTools pro debug (můžeš zakomentovat)
  // mainWindow.webContents.openDevTools();

  // Zkontrolovat, zda je uživatel přihlášen
  const fs = require('fs');
  const os = require('os');
  const accountPath = path.join(os.homedir(), '.void-craft-launcher', 'account.json');

  if (fs.existsSync(accountPath)) {
    // Uživatel je přihlášen - načíst hlavní aplikaci
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  } else {
    // Uživatel není přihlášen - načíst přihlašovací stránku
    mainWindow.loadFile(path.join(__dirname, '../renderer/login.html'));
  }

  mainWindow.setMenuBarVisibility(false);

  // Zkontrolovat aktualizace po 3 sekundách
  setTimeout(() => {
    autoUpdater.setupAutoUpdater();
    autoUpdater.checkForUpdates();
  }, 3000);
}

app.whenReady().then(() => {
  try {
    remoteMain = require('@electron/remote/main');
    remoteMain.initialize();
  } catch (error) {
    console.log('@electron/remote není dostupný:', error.message);
  }


  // .zip soubory jsou nyní přesouvány v modpack-installer.js per-modpack

  setupIPC();
  createWindow();

  // IPC pro manuální kontrolu aktualizací
  ipcMain.on('check-for-updates', () => {
    console.log('[MAIN] Manuální kontrola aktualizací...');
    autoUpdater.checkForUpdates();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
