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

        // KROK 1: Získat seznam VŠECH očekávaných souborů z manifestu
        console.log(`[MODPACK] Získávám informace o ${manifest.files.length} souborech z manifestu...`);
        if (onProgress) onProgress(60, 'Načítám seznam modů z modpacku...');

        const expectedFiles = {
            mods: new Map(),        // fileName -> { mod, modFile, targetDir, fileType }
            resourcepacks: new Map(),
            shaderpacks: new Map()
        };

        const checkBatchSize = 10;
        for (let i = 0; i < manifest.files.length; i += checkBatchSize) {
            const batch = manifest.files.slice(i, i + checkBatchSize);
            const progress = 60 + Math.round((i / manifest.files.length) * 5);
            if (onProgress) onProgress(progress, `Kontroluji manifest ${i}/${manifest.files.length}...`);

            await Promise.all(batch.map(async (mod) => {
                try {
                    const modInfo = await curseforge.getMod(mod.projectID);
                    const modFile = await curseforge.getModFile(mod.projectID, mod.fileID);

                    // Určit cílovou složku podle kategorie
                    let targetDir = modsDir;
                    let fileType = 'Mod';
                    let mapKey = 'mods';

                    if (modInfo.classId === 12) {
                        targetDir = resourcepacksDir;
                        fileType = 'Resource Pack';
                        mapKey = 'resourcepacks';
                    } else if (modInfo.classId === 4546) {
                        targetDir = shaderpacksDir;
                        fileType = 'Shader Pack';
                        mapKey = 'shaderpacks';
                    }

                    expectedFiles[mapKey].set(modFile.fileName, { mod, modFile, targetDir, fileType });
                } catch (error) {
                    console.error(`[MODPACK] Chyba při získávání info o ${mod.projectID}:`, error.message);
                }
            }));
        }

        console.log(`[MODPACK] Očekávané soubory - Mods: ${expectedFiles.mods.size}, Resource Packs: ${expectedFiles.resourcepacks.size}, Shaders: ${expectedFiles.shaderpacks.size}`);

        // KROK 2: Smazat soubory které NEJSOU v manifestu (staré verze, nepotřebné mody)
        if (onProgress) onProgress(66, 'Odstraňuji staré verze modů...');

        const cleanupDir = (dir, expectedMap, fileType) => {
            if (!fs.existsSync(dir)) return;
            const files = fs.readdirSync(dir);
            for (const file of files) {
                // Přeskočit .zip soubory v mods složce (budou přesunuty do shaderpacks)
                if (dir === modsDir && file.toLowerCase().endsWith('.zip')) continue;

                // Pokud soubor NENÍ v expectedFiles, smazat ho
                if (!expectedMap.has(file)) {
                    const filePath = path.join(dir, file);
                    try {
                        fs.unlinkSync(filePath);
                        console.log(`[MODPACK] ❌ Odstraněn starý ${fileType}: ${file}`);
                    } catch (e) {
                        console.error(`[MODPACK] Chyba při mazání ${file}:`, e.message);
                    }
                }
            }
        };

        cleanupDir(modsDir, expectedFiles.mods, 'mod');
        cleanupDir(resourcepacksDir, expectedFiles.resourcepacks, 'resource pack');
        cleanupDir(shaderpacksDir, expectedFiles.shaderpacks, 'shader pack');

        // KROK 3: Stáhnout chybějící soubory
        const filesToDownload = [];

        for (const [mapKey, expectedMap] of Object.entries(expectedFiles)) {
            for (const [fileName, info] of expectedMap) {
                const filePath = path.join(info.targetDir, fileName);
                if (!fs.existsSync(filePath)) {
                    filesToDownload.push(info);
                }
            }
        }

        console.log(`[MODPACK] Celkem očekávaných souborů: ${expectedFiles.mods.size + expectedFiles.resourcepacks.size + expectedFiles.shaderpacks.size}, Chybí: ${filesToDownload.length}`);

        if (filesToDownload.length === 0) {
            console.log('[MODPACK] ✅ Všechny soubory jsou správné verze');
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

                    console.log(`[MODPACK] ⬇️ Stahuji ${fileType}: ${modFile.fileName}`);
                    await curseforge.downloadFile(downloadUrl, filePath, (progress, speed, downloaded) => {
                        const elapsed = (Date.now() - startTime) / 1000;
                        const avgSpeed = (totalDownloaded + downloaded) / elapsed / 1024 / 1024;
                        const prog = 70 + Math.round((completed / totalFiles) * 25);
                        onProgress(prog, `${fileType} ${completed + 1}/${totalFiles} (${avgSpeed.toFixed(2)} MB/s)`);
                    });
                    console.log(`[MODPACK] ✅ Staženo ${fileType}: ${modFile.fileName}`);
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
            console.log('[MODPACK] ========== KONTROLA A SYNCHRONIZACE MODPACKU ==========');
            console.log('[MODPACK] Modpack ID:', modpackId);

            // Získat nejnovější verzi z CurseForge
            if (onProgress) onProgress(0, 'Kontroluji nejnovější verzi modpacku...');
            const latestFile = await curseforge.getLatestFile(modpackId);
            const latestFileId = latestFile.id;
            const installedFileId = this.getInstalledFileId(modpackId);

            console.log('[MODPACK] Nainstalovaná verze (fileId):', installedFileId);
            console.log('[MODPACK] Nejnovější verze (fileId):', latestFileId);
            console.log('[MODPACK] Nejnovější soubor:', latestFile.displayName || latestFile.fileName);

            // VŽDY stáhnout aktuální modpack a synchronizovat mody
            console.log('[MODPACK] 🔄 Stahuji aktuální modpack pro synchronizaci modů...');
            if (onProgress) onProgress(5, 'Stahuji aktuální modpack...');

            // Stáhnout nejnovější verzi
            const zipPath = path.join(this.tempDir, `modpack-${modpackId}.zip`);

            await curseforge.downloadFile(latestFile.downloadUrl, zipPath, (progress, speed) => {
                console.log(`[MODPACK] Stahování modpacku: ${progress}%`);
                const speedText = speed ? ` (${speed.toFixed(2)} MB/s)` : '';
                if (onProgress) onProgress(5 + (progress * 0.3), `Stahování modpacku: ${progress}%${speedText}`);
            });
            console.log('[MODPACK] Modpack stažen');

            if (onProgress) onProgress(40, 'Rozbaluji modpack...');
            console.log('[MODPACK] Rozbaluji modpack...');
            await this.extractModpack(zipPath);
            console.log('[MODPACK] Modpack rozbalen');

            if (onProgress) onProgress(50, 'Načítám manifest...');
            const manifest = await this.readManifest();
            console.log('[MODPACK] Manifest načten:', manifest ? 'OK' : 'CHYBÍ');
            if (manifest && manifest.files) {
                console.log('[MODPACK] Počet modů v manifestu:', manifest.files.length);
            }

            if (manifest) {
                console.log('[MODPACK] ⚙️ Synchronizuji mody s aktuálním modpackem...');
                if (onProgress) onProgress(55, 'Synchronizuji mody...');
                await this.downloadMods(manifest, onProgress || (() => { }));
                console.log('[MODPACK] ✅ Všechny mody synchronizovány');

                // Uložit verzi jako nainstalovanou
                this.markAsInstalled(modpackId, manifest, latestFileId);
            }

            // Cleanup
            if (fs.existsSync(zipPath)) {
                fs.unlinkSync(zipPath);
            }

            const needsUpdate = installedFileId !== latestFileId;
            console.log('[MODPACK] ✅ Synchronizace dokončena!' + (needsUpdate ? ' (nová verze)' : ' (bez změny verze)'));
            return { needsUpdate, manifest };

        } catch (error) {
            console.error('[MODPACK] Chyba při synchronizaci modpacku:', error);
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
