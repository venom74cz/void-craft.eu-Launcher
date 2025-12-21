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
            return { manifest, fileId: latestFile.id };
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

        const stats = fs.statSync(src);
        const isDirectory = stats.isDirectory();

        if (isDirectory) {
            if (!fs.existsSync(dest)) {
                console.log(`[MODPACK] Vytvářím složku: ${dest}`)
                fs.mkdirSync(dest, { recursive: true });
            }
            fs.readdirSync(src).forEach(item => {
                this.copyRecursive(path.join(src, item), path.join(dest, item));
            });
        } else {
            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) {
                console.log(`[MODPACK] Vytvářím složku: ${destDir}`)
                fs.mkdirSync(destDir, { recursive: true });
            }
            console.log(`[MODPACK] Kopíruji soubor: ${path.basename(src)} -> ${dest}`)
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
        const resourcepacksDir = path.join(this.minecraftDir, 'resourcepacks');
        const shaderpacksDir = path.join(this.minecraftDir, 'shaderpacks');

        // Vytvořit složky
        [modsDir, resourcepacksDir, shaderpacksDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });

        // Přesunout všechny .zip z mods/ do shaderpacks/
        if (fs.existsSync(modsDir)) {
            const files = fs.readdirSync(modsDir);
            for (const file of files) {
                if (file.toLowerCase().endsWith('.zip')) {
                    const oldPath = path.join(modsDir, file);
                    const newPath = path.join(shaderpacksDir, file);
                    console.log(`[MODPACK] Přesouvám .zip z mods/ do shaderpacks/: ${file}`);
                    fs.renameSync(oldPath, newPath);
                }
            }
        }

        // Kontrola chybějících souborů - PARALELNĚ
        const filesToDownload = [];

        console.log(`[MODPACK] Kontroluji ${manifest.files.length} souborů...`);
        const checkBatchSize = 10;
        for (let i = 0; i < manifest.files.length; i += checkBatchSize) {
            const batch = manifest.files.slice(i, i + checkBatchSize);
            const results = await Promise.all(batch.map(async (mod) => {
                try {
                    const modInfo = await curseforge.getMod(mod.projectID);
                    const modFile = await curseforge.getModFile(mod.projectID, mod.fileID);

                    // Určit cílovou složku podle kategorie
                    let targetDir = modsDir;
                    let fileType = 'Mod';

                    if (modInfo.classId === 12) {
                        targetDir = resourcepacksDir;
                        fileType = 'Resource Pack';
                    } else if (modInfo.classId === 4546) {
                        targetDir = shaderpacksDir;
                        fileType = 'Shader Pack';
                    }

                    const filePath = path.join(targetDir, modFile.fileName);
                    if (!fs.existsSync(filePath)) {
                        return { mod, modFile, targetDir, fileType };
                    }
                } catch (error) {
                    console.error(`[MODPACK] Chyba při kontrole ${mod.projectID}:`, error.message);
                }
                return null;
            }));
            filesToDownload.push(...results.filter(r => r !== null));
        }

        console.log(`[MODPACK] Celkem souborů: ${manifest.files.length}, Chybí: ${filesToDownload.length}`);

        if (filesToDownload.length === 0) {
            console.log('[MODPACK] Všechny soubory již jsou nainstalovány');
            return;
        }

        const totalFiles = filesToDownload.length;
        let completed = 0;
        let totalDownloaded = 0;
        const startTime = Date.now();
        const concurrency = 15;

        for (let i = 0; i < totalFiles; i += concurrency) {
            const batch = filesToDownload.slice(i, i + concurrency);

            await Promise.all(batch.map(async ({ mod, modFile, targetDir, fileType }) => {
                try {
                    const filePath = path.join(targetDir, modFile.fileName);

                    // Pokud API nevrátí downloadUrl, použijeme fallback URL
                    let downloadUrl = modFile.downloadUrl;
                    if (!downloadUrl) {
                        downloadUrl = `https://edge.forgecdn.net/files/${Math.floor(mod.fileID / 1000)}/${mod.fileID % 1000}/${modFile.fileName}`;
                        console.log(`[MODPACK] Používám fallback URL pro ${modFile.fileName}`);
                    }

                    console.log(`[MODPACK] Stahuji ${fileType}: ${modFile.fileName}`);
                    await curseforge.downloadFile(downloadUrl, filePath, (progress, speed, downloaded) => {
                        const elapsed = (Date.now() - startTime) / 1000;
                        const avgSpeed = (totalDownloaded + downloaded) / elapsed / 1024 / 1024;
                        const prog = 70 + Math.round((completed / totalFiles) * 25);
                        onProgress(prog, `${fileType} ${completed + 1}/${totalFiles} (${avgSpeed.toFixed(2)} MB/s)`);
                    });
                    console.log(`[MODPACK] Staženo ${fileType}: ${modFile.fileName}`);
                    totalDownloaded += modFile.fileLength || 0;

                    completed++;
                    const elapsed = (Date.now() - startTime) / 1000;
                    const avgSpeed = totalDownloaded / elapsed / 1024 / 1024;
                    const progress = 70 + Math.round((completed / totalFiles) * 25);
                    onProgress(progress, `${fileType} ${completed}/${totalFiles} (${avgSpeed.toFixed(2)} MB/s)`);
                } catch (error) {
                    console.error(`Chyba při stahování ${mod.projectID}:`, error);
                    completed++;
                }
            }));
        }

        // Přesunout všechny .zip z mods/ do shaderpacks/ (po stažení)
        if (fs.existsSync(modsDir)) {
            const files = fs.readdirSync(modsDir);
            for (const file of files) {
                if (file.toLowerCase().endsWith('.zip')) {
                    const oldPath = path.join(modsDir, file);
                    const newPath = path.join(shaderpacksDir, file);
                    console.log(`[MODPACK] Přesouvám .zip z mods/ do shaderpacks/: ${file}`);
                    fs.renameSync(oldPath, newPath);
                }
            }
        }
    }

    isModpackInstalled(modpackId) {
        const installedPath = path.join(this.minecraftDir, '.installed', `${modpackId}.json`);
        return fs.existsSync(installedPath);
    }

    getInstalledFileId(modpackId) {
        const installedPath = path.join(this.minecraftDir, '.installed', `${modpackId}.json`);
        if (fs.existsSync(installedPath)) {
            try {
                const installed = JSON.parse(fs.readFileSync(installedPath, 'utf8'));
                return installed.fileId || null;
            } catch (e) {
                console.error('[MODPACK] Chyba při čtení instalovaného souboru:', e);
                return null;
            }
        }
        return null;
    }

    async checkForModpackUpdate(modpackId, onProgress) {
        try {
            console.log('[MODPACK] ========== KONTROLA AKTUALIZACE ==========');
            console.log('[MODPACK] Modpack ID:', modpackId);

            // Získat nejnovější verzi z CurseForge
            const latestFile = await curseforge.getLatestFile(modpackId);
            const latestFileId = latestFile.id;
            const installedFileId = this.getInstalledFileId(modpackId);

            console.log('[MODPACK] Nainstalovaná verze (fileId):', installedFileId);
            console.log('[MODPACK] Nejnovější verze (fileId):', latestFileId);
            console.log('[MODPACK] Nejnovější soubor:', latestFile.displayName || latestFile.fileName);

            if (installedFileId === latestFileId) {
                console.log('[MODPACK] ✅ Modpack je aktuální');

                // I přesto zkontrolovat, zda všechny mody existují
                const installedPath = path.join(this.minecraftDir, '.installed', `${modpackId}.json`);
                if (fs.existsSync(installedPath)) {
                    const installed = JSON.parse(fs.readFileSync(installedPath, 'utf8'));
                    const manifest = installed.manifest;

                    if (manifest && manifest.files) {
                        console.log('[MODPACK] Kontroluji integritu modů...');
                        if (onProgress) onProgress(5, 'Kontroluji mody...');
                        await this.downloadMods(manifest, onProgress || (() => { }));
                    }
                }

                return { needsUpdate: false, manifest: null };
            }

            console.log('[MODPACK] ⚠️ Je k dispozici nová verze! Aktualizuji...');
            if (onProgress) onProgress(0, '🔄 Aktualizace modpacku...');

            // Stáhnout novou verzi
            const zipPath = path.join(this.tempDir, `modpack-${modpackId}.zip`);
            console.log('[MODPACK] Stahuji novou verzi modpacku...');

            await curseforge.downloadFile(latestFile.downloadUrl, zipPath, (progress, speed) => {
                console.log(`[MODPACK] Stahování aktualizace: ${progress}%`);
                const speedText = speed ? ` (${speed.toFixed(2)} MB/s)` : '';
                if (onProgress) onProgress(5 + (progress * 0.3), `Stahování aktualizace: ${progress}%${speedText}`);
            });
            console.log('[MODPACK] Aktualizace stažena');

            if (onProgress) onProgress(40, 'Rozbaluji aktualizaci...');
            console.log('[MODPACK] Rozbaluji aktualizaci...');
            await this.extractModpack(zipPath);
            console.log('[MODPACK] Aktualizace rozbalena');

            if (onProgress) onProgress(50, 'Načítám manifest...');
            const manifest = await this.readManifest();
            console.log('[MODPACK] Manifest načten:', manifest ? 'OK' : 'CHYBÍ');

            if (manifest) {
                console.log('[MODPACK] Aktualizuji mody...');
                if (onProgress) onProgress(55, 'Aktualizuji mody...');
                await this.downloadMods(manifest, onProgress || (() => { }));
                console.log('[MODPACK] Všechny mody aktualizovány');

                // Uložit novou verzi jako nainstalovanou
                this.markAsInstalled(modpackId, manifest, latestFileId);
            }

            // Cleanup
            if (fs.existsSync(zipPath)) {
                fs.unlinkSync(zipPath);
            }

            console.log('[MODPACK] ✅ Aktualizace dokončena!');
            return { needsUpdate: true, manifest };

        } catch (error) {
            console.error('[MODPACK] Chyba při kontrole aktualizace:', error);
            throw error;
        }
    }

    markAsInstalled(modpackId, manifest, fileId = null) {
        const installedDir = path.join(this.minecraftDir, '.installed');
        if (!fs.existsSync(installedDir)) {
            fs.mkdirSync(installedDir, { recursive: true });
        }
        fs.writeFileSync(
            path.join(installedDir, `${modpackId}.json`),
            JSON.stringify({ modpackId, fileId, installedAt: new Date(), manifest }, null, 2)
        );
    }
}

module.exports = new ModpackInstaller();
