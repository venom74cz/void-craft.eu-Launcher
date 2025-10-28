class AutoUpdater {
    constructor() {
        this.autoUpdater = null;
    }

    setupAutoUpdater() {
        const { app, dialog } = require('electron');
        
        if (!app || !app.isReady()) {
            return;
        }

        try {
            const { autoUpdater } = require('electron-updater');
            this.autoUpdater = autoUpdater;
        } catch (error) {
            console.log('Auto-updater není dostupný:', error.message);
            return;
        }
        
        // GitHub Releases
        this.autoUpdater.setFeedURL({
            provider: 'github',
            owner: 'venom74cz',
            repo: 'void-craft.eu-Launcher'
        });
        
        // Konfigurace auto-updater
        this.autoUpdater.autoDownload = false;
        this.autoUpdater.autoInstallOnAppQuit = true;

        // Event listenery
        this.autoUpdater.on('update-available', (info) => {
            const { dialog } = require('electron');
            dialog.showMessageBox({
                type: 'info',
                title: 'Aktualizace dostupná',
                message: `Nová verze ${info.version} je k dispozici. Chceš ji stáhnout?`,
                buttons: ['Ano', 'Ne']
            }).then((result) => {
                if (result.response === 0) {
                    this.autoUpdater.downloadUpdate();
                }
            });
        });

        this.autoUpdater.on('update-downloaded', () => {
            const { dialog } = require('electron');
            dialog.showMessageBox({
                type: 'info',
                title: 'Aktualizace stažena',
                message: 'Aktualizace byla stažena. Launcher se restartuje pro instalaci.',
                buttons: ['Restartovat']
            }).then(() => {
                this.autoUpdater.quitAndInstall();
            });
        });

        this.autoUpdater.on('error', (error) => {
            console.error('Chyba při aktualizaci:', error);
        });

        this.autoUpdater.on('download-progress', (progress) => {
            console.log(`Stahování: ${Math.round(progress.percent)}%`);
        });
    }

    checkForUpdates() {
        if (this.autoUpdater) {
            this.autoUpdater.checkForUpdates();
        }
    }
}

module.exports = new AutoUpdater();
