const { Client, Authenticator } = require('minecraft-launcher-core');
const MinecraftDirect = require('./minecraft-direct');
const path = require('path');
const os = require('os');
const fs = require('fs');
const javaManager = require('./java-manager');
const forgeInstaller = require('./forge-installer');

class MinecraftLauncher {
    constructor() {
        this.launcher = new Client();
        this.gameDir = path.join(os.homedir(), '.void-craft-launcher', 'minecraft');
        this.directLauncher = new MinecraftDirect(this.gameDir);
        this.ensureDirectories();
    }
    
    isRunning() {
        return this.directLauncher.isRunning();
    }
    
    kill() {
        return this.directLauncher.kill();
    }

    ensureDirectories() {
        if (!fs.existsSync(this.gameDir)) {
            fs.mkdirSync(this.gameDir, { recursive: true });
        }
    }

    async launch(user, modpackVersion = '1.20.1', manifest = null, onProgress, ramAllocation = 4) {
        try {
            console.log('[MINECRAFT] ========== SPOUŠTĚNÍ MINECRAFTU ==========');
            console.log('[MINECRAFT] Verze:', modpackVersion);
            console.log('[MINECRAFT] Uživatel:', user.username, '(' + user.type + ')');
            console.log('[MINECRAFT] UUID:', user.uuid);
            
            // Získat Java
            if (onProgress) onProgress(5, 'Kontroluji Javu...');
            console.log('[MINECRAFT] Kontroluji Javu...');
            const javaPath = await javaManager.getJavaPath();
            console.log('[MINECRAFT] Použita Java:', javaPath);

            // Nainstalovat mod loader pokud je potřeba
            if (manifest) {
                console.log('[MINECRAFT] Detekuji mod loader z manifestu...');
                const modLoader = await forgeInstaller.detectModLoader(manifest);
                if (modLoader) {
                    console.log('[MINECRAFT] Detekovaný mod loader:', modLoader.type, 'verze:', modLoader.version);
                    if (onProgress) onProgress(10, `Instaluji ${modLoader.type}...`);
                    
                    if (modLoader.type === 'forge') {
                        await forgeInstaller.installForge(
                            manifest.minecraft.version,
                            modLoader.version,
                            javaPath,
                            (progress, text) => {
                                if (onProgress) onProgress(10 + (progress * 0.2), text);
                            }
                        );
                        modpackVersion = `${manifest.minecraft.version}-forge-${modLoader.version}`;
                    } else if (modLoader.type === 'neoforge') {
                        await forgeInstaller.installNeoForge(
                            manifest.minecraft.version,
                            modLoader.version,
                            javaPath,
                            (progress, text) => {
                                if (onProgress) onProgress(10 + (progress * 0.2), text);
                            }
                        );
                        // NeoForge vytváří profil s názvem "neoforge-{version}"
                        modpackVersion = `neoforge-${modLoader.version}`;
                    } else if (modLoader.type === 'fabric') {
                        await forgeInstaller.installFabric(
                            manifest.minecraft.version,
                            modLoader.version,
                            (progress, text) => {
                                if (onProgress) onProgress(10 + (progress * 0.2), text);
                            }
                        );
                        modpackVersion = `fabric-loader-${modLoader.version}-${manifest.minecraft.version}`;
                    }
                }
            }

            if (onProgress) onProgress(30, 'Spouštím Minecraft...');

            console.log('[MINECRAFT] Finální verze pro spuštění:', modpackVersion);
            console.log('[MINECRAFT] Připravuji launcher options...');

            // Pro NeoForge/Forge launcher core automaticky najde JSON v versions složce
            const isModded = modpackVersion.includes('forge') || modpackVersion.includes('neoforge');
            
            console.log('[MINECRAFT] Je modded:', isModded);
            console.log('[MINECRAFT] Verze:', modpackVersion);

            // Nastavení paměti podle ramAllocation
            let maxRam = Math.max(2, Number(ramAllocation) || 4);
            let minRam = Math.max(1, Math.floor(maxRam / 2));
            if (minRam > maxRam) minRam = maxRam;
            const opts = {
                clientPackage: null,
                authorization: this.getAuth(user),
                root: this.gameDir,
                version: {
                    number: modpackVersion,
                    type: "release"
                },
                memory: {
                    max: `${maxRam}G`,
                    min: `${minRam}G`
                },
                javaPath: javaPath
            };

            // Pro modded použijeme custom launcher
            if (isModded) {
                console.log('[MINECRAFT] Spouštím modded Minecraft přímo...');
                if (manifest && manifest.minecraft && manifest.minecraft.version) {
                    console.log('[MINECRAFT] Stahuji vanilla knihovny pro', manifest.minecraft.version);
                    if (onProgress) onProgress(25, 'Stahuji Minecraft knihovny...');
                    await this.downloadVanillaLibraries(manifest.minecraft.version, onProgress);
                }
                await this.directLauncher.launch(user, modpackVersion, javaPath, onProgress, maxRam);
                console.log('[MINECRAFT] Minecraft úspěšně spuštěn!');
                return true;
            }
            
            // Použijeme launcher core pro všechny verze
            this.launcher.on('debug', (e) => console.log('[LAUNCHER-CORE]', e));
            this.launcher.on('data', (e) => console.log('[LAUNCHER-CORE]', e));
            this.launcher.on('progress', (e) => {
                if (onProgress) {
                    const progress = 30 + Math.round((e.task / e.total) * 65);
                    onProgress(progress, e.type);
                }
            });

            console.log('[MINECRAFT] Spouštím Minecraft launcher core...');
            console.log('[MINECRAFT] Verze:', modpackVersion);
            console.log('[MINECRAFT] Root:', this.gameDir);
            
            await this.launcher.launch(opts);
            console.log('[MINECRAFT] Minecraft úspěšně spuštěn!');
            return true;
        } catch (error) {
            console.error('[MINECRAFT] ========== CHYBA ==========');
            console.error('[MINECRAFT] Chyba při spouštění:', error);
            console.error('[MINECRAFT] Stack:', error.stack);
            throw error;
        }
    }

    async downloadVanillaLibraries(minecraftVersion, onProgress) {
        const axios = require('axios');
        
        // Stáhnout version manifest
        const versionManifestUrl = `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`;
        const manifestResponse = await axios.get(versionManifestUrl);
        const versionInfo = manifestResponse.data.versions.find(v => v.id === minecraftVersion);
        
        if (!versionInfo) {
            console.log('[MINECRAFT] Verze', minecraftVersion, 'nenalezena v manifestu');
            return;
        }
        
        // Stáhnout version JSON
        const versionJsonResponse = await axios.get(versionInfo.url);
        const versionData = versionJsonResponse.data;
        
        // Stáhnout knihovny
        const librariesDir = path.join(this.gameDir, 'libraries');
        if (!fs.existsSync(librariesDir)) {
            fs.mkdirSync(librariesDir, { recursive: true });
        }
        
        console.log('[MINECRAFT] Stahuji', versionData.libraries.length, 'knihoven...');
        for (const lib of versionData.libraries) {
            if (lib.downloads && lib.downloads.artifact) {
                const libPath = path.join(librariesDir, lib.downloads.artifact.path);
                const libDir = path.dirname(libPath);
                
                if (!fs.existsSync(libPath)) {
                    if (!fs.existsSync(libDir)) {
                        fs.mkdirSync(libDir, { recursive: true });
                    }
                    
                    try {
                        const response = await axios.get(lib.downloads.artifact.url, { responseType: 'arraybuffer' });
                        fs.writeFileSync(libPath, Buffer.from(response.data));
                    } catch (e) {
                        console.error('[MINECRAFT] Chyba při stahování knihovny:', lib.name, e.message);
                    }
                }
            }
        }
        
        console.log('[MINECRAFT] Všechny knihovny staženy');
        
        // Stáhnout assets (zvuky, textury)
        await this.downloadAssets(versionData, onProgress);
    }
    
    async downloadAssets(versionData, onProgress) {
        const axios = require('axios');
        
        if (!versionData.assetIndex) {
            console.log('[MINECRAFT] Verze nemá assetIndex');
            return;
        }
        
        const assetsDir = path.join(this.gameDir, 'assets');
        const indexesDir = path.join(assetsDir, 'indexes');
        const objectsDir = path.join(assetsDir, 'objects');
        
        [indexesDir, objectsDir].forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
        
        // Stáhnout asset index
        const indexPath = path.join(indexesDir, `${versionData.assetIndex.id}.json`);
        if (!fs.existsSync(indexPath)) {
            console.log('[MINECRAFT] Stahuji asset index:', versionData.assetIndex.id);
            const indexResponse = await axios.get(versionData.assetIndex.url);
            fs.writeFileSync(indexPath, JSON.stringify(indexResponse.data, null, 2));
        }
        
        const assetIndex = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
        const assets = Object.values(assetIndex.objects);
        
        console.log('[MINECRAFT] Stahuji', assets.length, 'assets...');
        
        let downloaded = 0;
        for (const asset of assets) {
            const hash = asset.hash;
            const subPath = hash.substring(0, 2);
            const assetPath = path.join(objectsDir, subPath, hash);
            
            if (!fs.existsSync(assetPath)) {
                const assetDir = path.dirname(assetPath);
                if (!fs.existsSync(assetDir)) {
                    fs.mkdirSync(assetDir, { recursive: true });
                }
                
                try {
                    const assetUrl = `https://resources.download.minecraft.net/${subPath}/${hash}`;
                    const response = await axios.get(assetUrl, { responseType: 'arraybuffer' });
                    fs.writeFileSync(assetPath, Buffer.from(response.data));
                } catch (e) {
                    console.error('[MINECRAFT] Chyba při stahování assetu:', hash, e.message);
                }
            }
            
            downloaded++;
            if (downloaded % 100 === 0) {
                console.log(`[MINECRAFT] Assets: ${downloaded}/${assets.length}`);
            }
        }
        
        console.log('[MINECRAFT] Všechny assets staženy');
        console.log('[MINECRAFT] Assets umístění:', path.join(this.gameDir, 'assets'));
        console.log('[MINECRAFT] Assets index:', versionData.assetIndex.id);
    }
    
    getAuth(user) {
        if (user.type === 'warez') {
            return Authenticator.getAuth(user.username);
        } else {
            // Microsoft OAuth token
            return {
                access_token: user.accessToken,
                client_token: user.clientToken,
                uuid: user.uuid,
                name: user.username,
                user_properties: JSON.stringify({})
            };
        }
    }
}

module.exports = new MinecraftLauncher();
