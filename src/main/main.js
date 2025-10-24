const { app, BrowserWindow } = require('electron');
const path = require('path');
const { setupIPC } = require('./ipc-handlers');
const autoUpdater = require('../launcher/auto-updater');

let mainWindow;
let remoteMain;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    frame: true,
    backgroundColor: '#0a0a0a',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true
    },
    icon: path.join(__dirname, '../../assets/icon.png')
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
  
  setupIPC();
  createWindow();
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
