const curseforge = require('../api/curseforge');
const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');

class ModpackInstaller {
    constructor() {
        this.minecraftDir = path.join(os.homedir(), '.void-craft-launcher', 'minecraft');
        this.tempDir = path.join(os.homedir(), '.void-craft-launcher', 'temp');
        this.ensureDirectories();
    }

    ensureDirectories() {
        [this.minecraftDir, this.tempDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    async installModpack(modpackId, onProgress) {
        try {
            console.log('[MODPACK] ========== INSTALACE MODPACKU ==========');
            console.log('[MODPACK] Modpack ID:', modpackId);
            onProgress(10, 'Načítám informace o modpacku...');
            const latestFile = await curseforge.getLatestFile(modpackId);
            console.log('[MODPACK] Nejnovější soubor:', latestFile.displayName || latestFile.fileName);
            console.log('[MODPACK] Download URL:', latestFile.downloadUrl);
            
            onProgress(20, 'Stahuji modpack...');
            const zipPath = path.join(this.tempDir, `modpack-${modpackId}.zip`);
            console.log('[MODPACK] Cesta k ZIP:', zipPath);
            
            console.log('[MODPACK] Začínám stahování modpacku...');
            await curseforge.downloadFile(latestFile.downloadUrl, zipPath, (progress, speed) => {
                console.log(`[MODPACK] Stahování: ${progress}%`);
                const speedText = speed ? ` (${speed.toFixed(2)} MB/s)` : '';
                onProgress(20 + (progress * 0.3), `Stahování: ${progress}%${speedText}`);
            });
            console.log('[MODPACK] Modpack stažen');

            onProgress(50, 'Rozbaluji modpack...');
            console.log('[MODPACK] Rozbaluji ZIP...');
            await this.extractModpack(zipPath);
            console.log('[MODPACK] ZIP rozbalen');

            onProgress(60, 'Načítám manifest...');
            console.log('[MODPACK] Čtu manifest.json...');
            const manifest = await this.readManifest();
            console.log('[MODPACK] Manifest načten:', manifest ? 'OK' : 'CHYBÍ');
            if (manifest) {
                console.log('[MODPACK] Minecraft verze:', manifest.minecraft?.version);
                console.log('[MODPACK] Počet modů:', manifest.files?.length || 0);
            }

            onProgress(70, 'Stahuji mody...');
            console.log('[MODPACK] Začínám stahování modů...');
            await this.downloadMods(manifest, onProgress);
            console.log('[MODPACK] Všechny mody staženy');

            onProgress(95, 'Instalace dokončena!');
            
            // Cleanup
            if (fs.existsSync(zipPath)) {
                fs.unlinkSync(zipPath);
            }

            onProgress(100, 'Hotovo!');
            return manifest;
        } catch (error) {
            console.error('Chyba při instalaci modpacku:', error);
            throw error;
        }
    }

    async extractModpack(zipPath) {
        const zip = new AdmZip(zipPath);
        zip.extractAllTo(this.tempDir, true);
        
        // Zkopírovat overrides do Minecraft složky
        const overridesPath = path.join(this.tempDir, 'overrides');
        if (fs.existsSync(overridesPath)) {
            console.log('[MODPACK] Kopíruji overrides do Minecraft složky...');
            this.copyRecursive(overridesPath, this.minecraftDir);
        }
    }
    
    copyRecursive(src, dest) {
        if (!fs.existsSync(src)) return;
        
        if (fs.statSync(src).isDirectory()) {
            if (!fs.existsSync(dest)) {
                fs.mkdirSync(dest, { recursive: true });
            }
            fs.readdirSync(src).forEach(item => {
                this.copyRecursive(path.join(src, item), path.join(dest, item));
            });
        } else {
            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }
            fs.copyFileSync(src, dest);
        }
    }

    async readManifest() {
        const manifestPath = path.join(this.tempDir, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
            return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        }
        return null;
    }

    async downloadMods(manifest, onProgress) {
        if (!manifest || !manifest.files) return;

        const modsDir = path.join(this.minecraftDir, 'mods');
        if (!fs.existsSync(modsDir)) {
            fs.mkdirSync(modsDir, { recursive: true });
        }

        const totalMods = manifest.files.length;
        let completed = 0;
        let totalDownloaded = 0;
        const startTime = Date.now();
        const concurrency = 5;
        
        for (let i = 0; i < totalMods; i += concurrency) {
            const batch = manifest.files.slice(i, i + concurrency);
            
            await Promise.all(batch.map(async (mod) => {
                try {
                    const modFile = await curseforge.getModFile(mod.projectID, mod.fileID);
                    const modPath = path.join(modsDir, modFile.fileName);
                    
                    if (!fs.existsSync(modPath)) {
                        await curseforge.downloadFile(modFile.downloadUrl, modPath, (progress, speed, downloaded) => {
                            const elapsed = (Date.now() - startTime) / 1000;
                            const avgSpeed = (totalDownloaded + downloaded) / elapsed / 1024 / 1024;
                            const prog = 70 + Math.round((completed / totalMods) * 25);
                            onProgress(prog, `Mod ${completed + 1}/${totalMods} (${avgSpeed.toFixed(2)} MB/s)`);
                        });
                        totalDownloaded += modFile.fileLength || 0;
                    }
                    
                    completed++;
                    const elapsed = (Date.now() - startTime) / 1000;
                    const avgSpeed = totalDownloaded / elapsed / 1024 / 1024;
                    const progress = 70 + Math.round((completed / totalMods) * 25);
                    onProgress(progress, `Mod ${completed}/${totalMods} (${avgSpeed.toFixed(2)} MB/s)`);
                } catch (error) {
                    console.error(`Chyba při stahování modu ${mod.projectID}:`, error);
                    completed++;
                }
            }));
        }
    }

    isModpackInstalled(modpackId) {
        const installedPath = path.join(this.minecraftDir, '.installed', `${modpackId}.json`);
        return fs.existsSync(installedPath);
    }

    markAsInstalled(modpackId, manifest) {
        const installedDir = path.join(this.minecraftDir, '.installed');
        if (!fs.existsSync(installedDir)) {
            fs.mkdirSync(installedDir, { recursive: true });
        }
        fs.writeFileSync(
            path.join(installedDir, `${modpackId}.json`),
            JSON.stringify({ modpackId, installedAt: new Date(), manifest }, null, 2)
        );
    }
}

module.exports = new ModpackInstaller();
