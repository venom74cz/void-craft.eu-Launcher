const axios = require('axios');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');

class ForgeInstaller {
    constructor() {
        this.minecraftDir = null; // Set dynamically per modpack
        this.forgeDir = null;
    }

    setModpackDir(modpackDir) {
        this.minecraftDir = modpackDir;
        this.forgeDir = path.join(this.minecraftDir, 'forge');
        this.ensureDirectories();
    }

    ensureDirectories() {
        if (this.forgeDir) {
            [this.forgeDir].forEach(dir => {
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
            });
        }
    }

    async installForge(minecraftVersion, forgeVersion, javaPath, onProgress) {
        try {
            onProgress(0, 'Načítám Forge...');

            // Vytvořit launcher_profiles.json pokud neexistuje
            this.createLauncherProfiles();

            // Forge verze formát: 1.20.1-47.2.0
            const fullVersion = `${minecraftVersion}-${forgeVersion}`;
            const forgeInstaller = `forge-${fullVersion}-installer.jar`;
            const installerPath = path.join(this.forgeDir, forgeInstaller);

            // Zkontrolovat, zda už není nainstalováno
            if (this.isForgeInstalled(minecraftVersion, forgeVersion)) {
                onProgress(100, 'Forge již nainstalováno');
                return true;
            }

            // Stáhnout Forge installer
            onProgress(20, 'Stahuji Forge installer...');
            const downloadUrl = `https://maven.minecraftforge.net/net/minecraftforge/forge/${fullVersion}/forge-${fullVersion}-installer.jar`;

            console.log('Stahuji Forge z:', downloadUrl);

            // Ujistit se, že složka existuje
            this.ensureDirectories();

            try {
                await this.downloadFile(downloadUrl, installerPath, (progress) => {
                    onProgress(20 + (progress * 0.3), `Stahování: ${progress}%`);
                });
            } catch (error) {
                console.error('Chyba při stahování Forge:', error);
                throw new Error('Forge installer nebyl nalezen. Zkontroluj verzi modpacku.');
            }

            // Spustit Forge installer
            onProgress(50, 'Instaluji Forge...');
            await this.runForgeInstaller(installerPath, javaPath);

            onProgress(100, 'Forge nainstalováno!');
            return true;
        } catch (error) {
            console.error('Chyba při instalaci Forge:', error);
            throw error;
        }
    }

    async installNeoForge(minecraftVersion, neoforgeVersion, javaPath, onProgress) {
        try {
            console.log('[NEOFORGE] ========== INSTALACE NEOFORGE ==========');
            console.log('[NEOFORGE] Minecraft verze:', minecraftVersion);
            console.log('[NEOFORGE] NeoForge verze:', neoforgeVersion);
            onProgress(0, 'Načítám NeoForge...');

            // Vytvořit launcher_profiles.json pokud neexistuje
            this.createLauncherProfiles();

            // NeoForge používá jen svoje číslo verze, ne Minecraft verzi
            const neoforgeInstaller = `neoforge-${neoforgeVersion}-installer.jar`;
            const installerPath = path.join(this.forgeDir, neoforgeInstaller);
            console.log('[NEOFORGE] Cesta k installeru:', installerPath);

            if (this.isNeoForgeInstalled(minecraftVersion, neoforgeVersion)) {
                console.log('[NEOFORGE] NeoForge již nainstalováno');
                onProgress(100, 'NeoForge již nainstalováno');
                return true;
            }

            onProgress(20, 'Stahuji NeoForge installer...');
            const downloadUrl = `https://maven.neoforged.net/releases/net/neoforged/neoforge/${neoforgeVersion}/neoforge-${neoforgeVersion}-installer.jar`;

            console.log('[NEOFORGE] Download URL:', downloadUrl);

            // Ujistit se, že složka existuje
            this.ensureDirectories();

            try {
                console.log('[NEOFORGE] Začínám stahování...');
                await this.downloadFile(downloadUrl, installerPath, (progress) => {
                    console.log(`[NEOFORGE] Stahování: ${progress}%`);
                    onProgress(20 + (progress * 0.3), `Stahování: ${progress}%`);
                });
                console.log('[NEOFORGE] Stahování dokončeno');
            } catch (error) {
                console.error('[NEOFORGE] ========== CHYBA STAHOVÁNÍ ==========');
                console.error('[NEOFORGE] URL:', downloadUrl);
                console.error('[NEOFORGE] Chyba:', error);
                console.error('[NEOFORGE] Stack:', error.stack);
                throw new Error('NeoForge installer nebyl nalezen. Zkontroluj verzi modpacku.');
            }

            console.log('[NEOFORGE] Spouštím NeoForge installer...');
            onProgress(50, 'Instaluji NeoForge...');
            await this.runForgeInstaller(installerPath, javaPath);

            console.log('[NEOFORGE] NeoForge úspěšně nainstalováno!');
            onProgress(100, 'NeoForge nainstalováno!');
            return true;
        } catch (error) {
            console.error('[NEOFORGE] ========== CHYBA INSTALACE ==========');
            console.error('[NEOFORGE]', error);
            throw error;
        }
    }

    async installFabric(minecraftVersion, fabricVersion, onProgress) {
        try {
            onProgress(0, 'Načítám Fabric...');

            // Zkontrolovat, zda už není nainstalováno
            if (this.isFabricInstalled(minecraftVersion, fabricVersion)) {
                onProgress(100, 'Fabric již nainstalováno');
                return true;
            }

            // Stáhnout Fabric loader
            onProgress(20, 'Stahuji Fabric loader...');
            const loaderUrl = `https://meta.fabricmc.net/v2/versions/loader/${minecraftVersion}/${fabricVersion}/profile/json`;

            const response = await axios.get(loaderUrl);
            const profilePath = path.join(this.minecraftDir, 'versions', `fabric-loader-${fabricVersion}-${minecraftVersion}`, `fabric-loader-${fabricVersion}-${minecraftVersion}.json`);

            const profileDir = path.dirname(profilePath);
            if (!fs.existsSync(profileDir)) {
                fs.mkdirSync(profileDir, { recursive: true });
            }

            fs.writeFileSync(profilePath, JSON.stringify(response.data, null, 2));

            onProgress(100, 'Fabric nainstalováno!');
            return true;
        } catch (error) {
            console.error('Chyba při instalaci Fabric:', error);
            throw error;
        }
    }

    async downloadFile(url, outputPath, onProgress) {
        const https = require('https');
        const http = require('http');
        const urlModule = require('url');

        return new Promise((resolve, reject) => {
            const doDownload = (url, redirectCount = 0) => {
                if (redirectCount > 5) {
                    reject(new Error('Příliš mnoho redirectů'));
                    return;
                }

                const parsedUrl = urlModule.parse(url);
                const protocol = parsedUrl.protocol === 'https:' ? https : http;

                const request = protocol.get(url, (response) => {
                    if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                        doDownload(response.headers.location, redirectCount + 1);
                        return;
                    }

                    if (response.statusCode !== 200) {
                        reject(new Error(`Chyba stahování: ${response.statusCode}`));
                        return;
                    }

                    const totalLength = parseInt(response.headers['content-length'], 10);
                    let downloaded = 0;

                    const writer = fs.createWriteStream(outputPath);

                    response.on('data', (chunk) => {
                        downloaded += chunk.length;
                        if (onProgress && totalLength) {
                            const progress = Math.round((downloaded * 100) / totalLength);
                            onProgress(progress);
                        }
                    });

                    response.pipe(writer);

                    writer.on('finish', () => {
                        writer.close();
                        resolve();
                    });

                    writer.on('error', (err) => {
                        fs.unlink(outputPath, () => { });
                        reject(err);
                    });
                });

                request.on('error', (err) => {
                    fs.unlink(outputPath, () => { });
                    reject(err);
                });
            };

            doDownload(url);
        });
    }

    async runForgeInstaller(installerPath, javaPath) {
        return new Promise((resolve, reject) => {
            console.log('[FORGE/NEOFORGE] Původní Java cesta:', javaPath);
            console.log('[FORGE/NEOFORGE] Installer cesta:', installerPath);
            console.log('[FORGE/NEOFORGE] Minecraft dir:', this.minecraftDir);

            const { spawn } = require('child_process');

            // Obalit všechny cesty do uvozovek pro shell
            const quotedJava = `"${javaPath}"`;
            const quotedInstaller = `"${installerPath}"`;
            const quotedMinecraftDir = `"${this.minecraftDir}"`;

            const args = ['-jar', quotedInstaller, '--installClient', quotedMinecraftDir];

            console.log('[FORGE/NEOFORGE] Spouštím:', quotedJava);
            console.log('[FORGE/NEOFORGE] Argumenty:', args.join(' '));

            // Použít shell: true pro správné zpracování cest s mezerami
            const installer = spawn(quotedJava, args, { shell: true });

            let output = '';
            let errorOutput = '';

            installer.stdout.on('data', (data) => {
                const text = data.toString();
                output += text;
                console.log('[FORGE/NEOFORGE]', text.trim());
            });

            installer.stderr.on('data', (data) => {
                const text = data.toString();
                errorOutput += text;
                console.error('[FORGE/NEOFORGE ERROR]', text.trim());
            });

            installer.on('close', (code) => {
                if (code === 0) {
                    console.log('[FORGE/NEOFORGE] Instalace dokončena úspěšně');
                    resolve(true);
                } else {
                    console.error('[FORGE/NEOFORGE] Instalace selhala s kódem:', code);
                    reject(new Error(`Forge installer selhal s kódem ${code}`));
                }
            });

            installer.on('error', (error) => {
                console.error('[FORGE/NEOFORGE] Chyba při spuštění:', error);
                reject(error);
            });
        });
    }

    isForgeInstalled(minecraftVersion, forgeVersion) {
        const forgePath = path.join(this.minecraftDir, 'versions', `${minecraftVersion}-forge-${forgeVersion}`);
        return fs.existsSync(forgePath);
    }

    isNeoForgeInstalled(minecraftVersion, neoforgeVersion) {
        // NeoForge vytváří složku s názvem "neoforge-{version}"
        const neoforgePath = path.join(this.minecraftDir, 'versions', `neoforge-${neoforgeVersion}`);
        const neoforgeJson = path.join(neoforgePath, `neoforge-${neoforgeVersion}.json`);

        const exists = fs.existsSync(neoforgeJson);

        // Kontrola existence libraries složky
        const libDir = path.join(this.minecraftDir, 'libraries');
        const libExists = fs.existsSync(libDir) && fs.readdirSync(libDir).length > 0;

        console.log('[NEOFORGE] Kontrola instalace:', neoforgeJson, '- JSON:', exists, '- Libs:', libExists);

        return exists && libExists;
    }

    isFabricInstalled(minecraftVersion, fabricVersion) {
        const fabricPath = path.join(this.minecraftDir, 'versions', `fabric-loader-${fabricVersion}-${minecraftVersion}`);
        return fs.existsSync(fabricPath);
    }

    createLauncherProfiles() {
        const profilesPath = path.join(this.minecraftDir, 'launcher_profiles.json');

        if (fs.existsSync(profilesPath)) {
            console.log('[FORGE/NEOFORGE] launcher_profiles.json již existuje');
            return;
        }

        console.log('[FORGE/NEOFORGE] Vytvářím launcher_profiles.json');

        const profiles = {
            "profiles": {
                "void-craft": {
                    "name": "Void-Craft",
                    "type": "custom",
                    "created": new Date().toISOString(),
                    "lastUsed": new Date().toISOString(),
                    "icon": "Furnace"
                }
            },
            "settings": {
                "enableSnapshots": false,
                "enableAdvanced": false
            },
            "version": 3
        };

        fs.writeFileSync(profilesPath, JSON.stringify(profiles, null, 2));
        console.log('[FORGE/NEOFORGE] launcher_profiles.json vytvořen');
    }

    async detectModLoader(manifest) {
        if (!manifest || !manifest.minecraft) {
            console.log('[MODLOADER] Manifest nebo minecraft sekce chybí');
            return null;
        }

        const modLoaders = manifest.minecraft.modLoaders || [];
        console.log('[MODLOADER] Nalezeno mod loaderů:', modLoaders.length);

        for (const loader of modLoaders) {
            console.log('[MODLOADER] Kontroluji loader:', loader.id);
            const loaderId = loader.id.toLowerCase();

            if (loaderId.includes('neoforge')) {
                const version = loader.id.replace(/neoforge-/i, '');
                console.log('[MODLOADER] Detekovan NeoForge, verze:', version);
                return {
                    type: 'neoforge',
                    version: version
                };
            }
            if (loaderId.includes('forge')) {
                const version = loader.id.replace(/forge-/i, '');
                console.log('[MODLOADER] Detekovan Forge, verze:', version);
                return {
                    type: 'forge',
                    version: version
                };
            }
            if (loaderId.includes('fabric')) {
                const version = loader.id.replace(/fabric-/i, '');
                console.log('[MODLOADER] Detekovan Fabric, verze:', version);
                return {
                    type: 'fabric',
                    version: version
                };
            }
        }

        console.log('[MODLOADER] Žádný mod loader nebyl detekovan');
        return null;
    }
}

module.exports = new ForgeInstaller();
