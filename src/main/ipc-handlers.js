const { ipcMain } = require('electron');
const curseforge = require('../api/curseforge');

function setupIPC() {
    // Microsoft přihlášení
    ipcMain.handle('microsoft-login', async () => {
        try {
            const microsoftAuth = require('../launcher/microsoft-auth');
            return await microsoftAuth.login();
        } catch (error) {
            throw error;
        }
    });

    // Načtení modpacku
    ipcMain.handle('get-modpack', async (event, modpackId) => {
        try {
            return await curseforge.getModpack(modpackId);
        } catch (error) {
            throw error;
        }
    });

    // Spuštění Minecraftu
    ipcMain.handle('launch-minecraft', async (event, user, version) => {
        try {
            const minecraftLauncher = require('../launcher/minecraft');
            return await minecraftLauncher.launch(user, version);
        } catch (error) {
            throw error;
        }
    });

    // Instalace modpacku
    ipcMain.handle('install-modpack', async (event, modpackId) => {
        try {
            const modpackInstaller = require('../launcher/modpack-installer');
            return await modpackInstaller.installModpack(modpackId);
        } catch (error) {
            throw error;
        }
    });
    
    // Kontrola zda Minecraft běží
    ipcMain.handle('is-minecraft-running', () => {
        const minecraftLauncher = require('../launcher/minecraft');
        return minecraftLauncher.isRunning();
    });
    
    // Ukončení Minecraftu
    ipcMain.handle('kill-minecraft', () => {
        const minecraftLauncher = require('../launcher/minecraft');
        return minecraftLauncher.kill();
    });
}

module.exports = { setupIPC };
