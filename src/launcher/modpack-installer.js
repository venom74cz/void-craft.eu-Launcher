const curseforge = require('../api/curseforge');
const path = require('path');
const os = require('os');
const fs = require('fs');
const AdmZip = require('adm-zip');

class ModpackInstaller {
    constructor() {
        this.baseDir = path.join(os.homedir(), '.void-craft-launcher');
        this.modpacksDir = path.join(this.baseDir, 'modpacks');
        this.tempDir = path.join(this.baseDir, 'temp');
        this.currentModpackDir = null; // Set per modpack
        this.overrideFiles = new Set();
        this.ensureDirectories();
    }

    setModpackDir(modpackName) {
        const safeName = this.sanitizeFolderName(modpackName);
        this.currentModpackDir = path.join(this.modpacksDir, safeName);
        if (!fs.existsSync(this.currentModpackDir)) {
            fs.mkdirSync(this.currentModpackDir, { recursive: true });
        }
        return this.currentModpackDir;
    }

    getModpackDir(modpackName) {
        const safeName = this.sanitizeFolderName(modpackName);
        return path.join(this.modpacksDir, safeName);
    }

    sanitizeFolderName(name) {
        // Remove invalid filesystem characters, replace spaces with underscores
        return String(name)
            .replace(/[<>:"/\\|?*]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 50); // Max 50 chars
    }

    ensureDirectories() {
        [this.modpacksDir, this.tempDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    async installModpack(modpackId, onProgress) {
        try {
            console.log('[MODPACK] ========== INSTALACE MODPACKU ==========');
            console.log('[MODPACK] Modpack ID:', modpackId);

            onProgress(5, 'Načítám informace o modpacku...');

            // Získat jméno modpacku pro složku
            const modpackInfo = await curseforge.getModpack(modpackId);
            const modpackName = modpackInfo.name;
            console.log('[MODPACK] Modpack jméno:', modpackName);

            // Nastavit modpack-specifickou složku podle jména
            const modpackDir = this.setModpackDir(modpackName);
            console.log('[MODPACK] Modpack složka:', modpackDir);

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

            // Uložit jako nainstalovaný
            this.markAsInstalled(modpackId, modpackName, manifest, latestFile.id);

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

        // Vyčistit seznam override souborů
        this.overrideFiles.clear();

        // Zkopírovat overrides do Minecraft složky
        const overridesPath = path.join(this.tempDir, 'overrides');
        if (fs.existsSync(overridesPath)) {
            console.log('[MODPACK] Kopíruji overrides do Minecraft složky...');
            this.copyRecursive(overridesPath, this.currentModpackDir, true);
        }

        // Zkusit i client-overrides (některé modpacky používají tento formát)
        const clientOverridesPath = path.join(this.tempDir, 'client-overrides');
        if (fs.existsSync(clientOverridesPath)) {
            console.log('[MODPACK] Kopíruji client-overrides do Minecraft složky...');
            this.copyRecursive(clientOverridesPath, this.currentModpackDir, true);
        }

        console.log(`[MODPACK] Zkopírováno ${this.overrideFiles.size} souborů z overrides`);
    }

    copyRecursive(src, dest, trackOverrides = false) {
        if (!fs.existsSync(src)) return;

        const stats = fs.statSync(src);
        const isDirectory = stats.isDirectory();

        if (isDirectory) {
            if (!fs.existsSync(dest)) {
                console.log(`[MODPACK] Vytvářím složku: ${dest}`)
                fs.mkdirSync(dest, { recursive: true });
            }
            fs.readdirSync(src).forEach(item => {
                this.copyRecursive(path.join(src, item), path.join(dest, item), trackOverrides);
            });
        } else {
            const fileName = path.basename(dest);

            // Nepřepisovat options.txt pokud již existuje (zachovat nastavení hráče)
            if (fileName === 'options.txt' && fs.existsSync(dest)) {
                console.log(`[MODPACK] Přeskakuji ${fileName} (zachovávám nastavení hráče)`);
                return;
            }

            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) {
                console.log(`[MODPACK] Vytvářím složku: ${destDir}`)
                fs.mkdirSync(destDir, { recursive: true });
            }

            // Ochrana uživatelských dat
            if (this.currentModpackDir) {
                // 1. servers.dat se nepřepisuje, pokud existuje
                if (fileName === 'servers.dat' && fs.existsSync(dest)) {
                    console.log(`[MODPACK] Přeskakuji servers.dat (již existuje)`);
                    return;
                }

                // 2. config soubory se nepřepisují, pokud existuje config složka
                const relativeDest = path.relative(this.currentModpackDir, dest);
                // Detekce jestli jde o soubor v config složce
                const isConfig = relativeDest.startsWith('config' + path.sep) || relativeDest === 'config';

                if (isConfig) {
                    if (fs.existsSync(dest)) {
                        console.log(`[MODPACK] Přeskakuji config (soubor již existuje): ${fileName}`);
                        return;
                    }
                }
            }

            console.log(`[MODPACK] Kopíruji soubor: ${fileName} -> ${dest}`)
            fs.copyFileSync(src, dest);

            // Track override files to prevent them from being deleted during cleanup
            if (trackOverrides) {
                this.overrideFiles.add(fileName);
            }
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

        const modsDir = path.join(this.currentModpackDir, 'mods');
        const resourcepacksDir = path.join(this.currentModpackDir, 'resourcepacks');
        const shaderpacksDir = path.join(this.currentModpackDir, 'shaderpacks');

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

        // KROK 1: Získat seznam VŠECH očekávaných souborů z manifestu - RYCHLE pomocí batch API
        console.log(`[MODPACK] Získávám informace o ${manifest.files.length} souborech z manifestu (batch mode)...`);
        if (onProgress) onProgress(60, 'Načítám seznam modů z modpacku...');

        const expectedFiles = {
            mods: new Map(),        // fileName -> { mod, modFile, targetDir, fileType }
            resourcepacks: new Map(),
            shaderpacks: new Map()
        };

        // Batch fetch all mod infos (max 50 per request)
        const allModIds = manifest.files.map(m => m.projectID);
        const allFileIds = manifest.files.map(m => ({ modId: m.projectID, fileId: m.fileID }));

        const modInfoMap = new Map(); // projectID -> modInfo
        const fileInfoMap = new Map(); // fileId -> fileInfo

        // Fetch mod infos in batches of 50
        console.log('[MODPACK] ⚡ Batch načítání informací o modech...');
        const batchSize = 50;
        for (let i = 0; i < allModIds.length; i += batchSize) {
            const batchIds = allModIds.slice(i, i + batchSize);
            const progress = 60 + Math.round((i / allModIds.length) * 2);
            if (onProgress) onProgress(progress, `Načítám info o modech ${i}/${allModIds.length}...`);

            try {
                const mods = await curseforge.getMods(batchIds);
                mods.forEach(mod => modInfoMap.set(mod.id, mod));
            } catch (error) {
                console.error('[MODPACK] Chyba při batch načítání modů, zkouším jednotlivě:', error.message);
                // Fallback to individual calls if batch fails
                for (const id of batchIds) {
                    try {
                        const mod = await curseforge.getMod(id);
                        modInfoMap.set(mod.id, mod);
                    } catch (e) {
                        console.error(`[MODPACK] Nepodařilo se načíst mod ${id}`);
                    }
                }
            }
        }

        // Fetch file infos in batches
        console.log('[MODPACK] ⚡ Batch načítání informací o souborech...');
        for (let i = 0; i < allFileIds.length; i += batchSize) {
            const batchFiles = allFileIds.slice(i, i + batchSize);
            const progress = 62 + Math.round((i / allFileIds.length) * 3);
            if (onProgress) onProgress(progress, `Načítám info o souborech ${i}/${allFileIds.length}...`);

            try {
                const files = await curseforge.getModFiles(batchFiles);
                files.forEach(file => fileInfoMap.set(file.id, file));
            } catch (error) {
                console.error('[MODPACK] Chyba při batch načítání souborů, zkouším jednotlivě:', error.message);
                // Fallback to individual calls if batch fails
                for (const { modId, fileId } of batchFiles) {
                    try {
                        const file = await curseforge.getModFile(modId, fileId);
                        fileInfoMap.set(file.id, file);
                    } catch (e) {
                        console.error(`[MODPACK] Nepodařilo se načíst soubor ${fileId}`);
                    }
                }
            }
        }

        console.log(`[MODPACK] ✅ Načteno ${modInfoMap.size} modů a ${fileInfoMap.size} souborů`);

        // Build expected files map
        for (const mod of manifest.files) {
            const modInfo = modInfoMap.get(mod.projectID);
            const modFile = fileInfoMap.get(mod.fileID);

            if (!modInfo || !modFile) {
                console.warn(`[MODPACK] ⚠️ Chybí info pro mod ${mod.projectID}/${mod.fileID}`);
                continue;
            }

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

                // Přeskočit soubory z overrides - ty nesmí být smazány!
                if (this.overrideFiles.has(file)) {
                    console.log(`[MODPACK] ⏭️ Přeskakuji override soubor: ${file}`);
                    continue;
                }

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
                let shouldDownload = false;

                if (!fs.existsSync(filePath)) {
                    shouldDownload = true;
                } else {
                    // Check file integrity via size
                    try {
                        const stats = fs.statSync(filePath);
                        // Only check if we have Expected Length from API
                        if (info.modFile.fileLength && stats.size !== info.modFile.fileLength) {
                            console.warn(`[MODPACK] ⚠️ Poškozený soubor detekován: ${fileName} (Má: ${stats.size}b, má mít: ${info.modFile.fileLength}b)`);
                            shouldDownload = true;
                            // Delete corrupt file immediately
                            try { fs.unlinkSync(filePath); } catch (e) { }
                        }
                    } catch (e) {
                        console.error(`[MODPACK] Chyba při kontrole souboru ${fileName}:`, e);
                        shouldDownload = true;
                    }
                }

                if (shouldDownload) {
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

    // Central registry of installed modpacks (ID -> name mapping)
    getRegistryPath() {
        return path.join(this.baseDir, 'installed-modpacks.json');
    }

    loadRegistry() {
        const regPath = this.getRegistryPath();
        if (fs.existsSync(regPath)) {
            try {
                return JSON.parse(fs.readFileSync(regPath, 'utf8'));
            } catch (e) {
                return {};
            }
        }
        return {};
    }

    saveRegistry(registry) {
        fs.writeFileSync(this.getRegistryPath(), JSON.stringify(registry, null, 2));
    }

    isModpackInstalled(modpackId) {
        const registry = this.loadRegistry();
        return !!registry[String(modpackId)];
    }

    getInstalledModpackName(modpackId) {
        const registry = this.loadRegistry();
        const entry = registry[String(modpackId)];
        return entry ? entry.name : null;
    }

    getInstalledFileId(modpackId) {
        const registry = this.loadRegistry();
        const entry = registry[String(modpackId)];
        return entry ? entry.fileId : null;
    }

    markAsInstalled(modpackId, modpackName, manifest, fileId = null) {
        const registry = this.loadRegistry();
        registry[String(modpackId)] = {
            id: modpackId,
            name: modpackName,
            folderName: this.sanitizeFolderName(modpackName),
            fileId: fileId,
            installedAt: new Date().toISOString(),
            mcVersion: manifest?.minecraft?.version
        };
        this.saveRegistry(registry);

        // Also save manifest in modpack folder
        const manifestPath = path.join(this.currentModpackDir, 'modpack-manifest.json');
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    async checkForModpackUpdate(modpackId, onProgress) {
        try {
            console.log('[MODPACK] ========== KONTROLA A SYNCHRONIZACE MODPACKU ==========');
            console.log('[MODPACK] Modpack ID:', modpackId);

            // Získat jméno pro složku z registry nebo z API
            let modpackName = this.getInstalledModpackName(modpackId);
            if (!modpackName) {
                const modpackInfo = await curseforge.getModpack(modpackId);
                modpackName = modpackInfo.name;
            }
            this.setModpackDir(modpackName);
            console.log('[MODPACK] Modpack složka:', this.currentModpackDir);

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
                this.markAsInstalled(modpackId, modpackName, manifest, latestFileId);
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
}

module.exports = new ModpackInstaller();
