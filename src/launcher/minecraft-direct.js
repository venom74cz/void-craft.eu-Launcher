const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

class MinecraftDirect {
    constructor(gameDir) {
        this.gameDir = gameDir;
        this.minecraftProcess = null;
    }
    
    isRunning() {
        return this.minecraftProcess !== null && !this.minecraftProcess.killed;
    }
    
    kill() {
        if (this.minecraftProcess) {
            this.minecraftProcess.kill();
            this.minecraftProcess = null;
            return true;
        }
        return false;
    }

    async launch(user, versionName, javaPath, onProgress, ramAllocation = 12) {
        try {
            console.log('[MC-DIRECT] ========== SPOUŠTĚNÍ MINECRAFTU =========');
            console.log('[MC-DIRECT] Verze:', versionName);
            console.log('[MC-DIRECT] Uživatel:', user.username, 'UUID:', user.uuid);

            // 1. Kontrola existence Java před spuštěním
            console.log('[MC-DIRECT] Kontroluji Javu na cestě:', javaPath);
            if (!javaPath || !fs.existsSync(javaPath)) {
                throw new Error(`Java nebyla nalezena na zadané cestě: ${javaPath}`);
            }
            console.log('[MC-DIRECT] Java nalezena.');

            // Načíst version JSON
            const versionJsonPath = path.join(this.gameDir, 'versions', versionName, `${versionName}.json`);
            console.log('[MC-DIRECT] Načítám JSON:', versionJsonPath);
            
            if (!fs.existsSync(versionJsonPath)) {
                throw new Error(`Version JSON nenalezen: ${versionJsonPath}`);
            }
            
            const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
            console.log('[MC-DIRECT] JSON načten, mainClass:', versionData.mainClass);
            
            if (onProgress) onProgress(40, 'Připravuji classpath...');
            
            // Sestavit classpath
            const classpath = this.buildClasspath(versionData, versionName);
            const classpathItems = classpath.split(path.delimiter);
            console.log('[MC-DIRECT] Classpath má', classpathItems.length, 'položek');
            
            if (onProgress) onProgress(60, 'Připravuji argumenty...');
            
            // Sestavit argumenty
            const args = this.buildArguments(versionData, user, versionName);
            console.log('[MC-DIRECT] Argumentů:', args.length);
            
            if (onProgress) onProgress(70, 'Extrahuji natives...');
            
            // Extrahovat natives
            await this.extractNatives(versionData, versionName);
            
            if (onProgress) onProgress(80, 'Spouštím hru...');
            
            // Přidat JVM argumenty z JSON
            const jvmArgs = [];
            if (versionData.arguments && versionData.arguments.jvm) {
                for (const arg of versionData.arguments.jvm) {
                    if (typeof arg === 'string') {
                        jvmArgs.push(this.replaceVariables(arg, user, versionName));
                    }
                }
            }
            
            // 2. Logování RAM nastavení
            let maxRam = Math.max(2, Number(ramAllocation) || 4);
            let minRam = Math.max(1, Math.floor(maxRam / 2));
            if (minRam > maxRam) minRam = maxRam;
            console.log(`[MC-DIRECT] Alokace RAM: -Xms${minRam}G -Xmx${maxRam}G`);

            const javaArgs = [
                `-Xmx${maxRam}G`,
                `-Xms${minRam}G`,
                ...jvmArgs,
                `-Djava.library.path=${path.join(this.gameDir, 'natives', versionName)}`,
                '-cp',
                classpath,
                versionData.mainClass,
                ...args
            ];
            
            const classpathFile = path.join(this.gameDir, 'classpath.txt');
            fs.writeFileSync(classpathFile, classpath);
            
            const cpIndex = javaArgs.indexOf('-cp');
            if (cpIndex !== -1) {
                javaArgs[cpIndex + 1] = `@${classpathFile}`;
            }
            
            console.log('[MC-DIRECT] Spouštím proces:', javaPath);
            
            // 3. Zachycení chyb při spouštění procesu
            try {
                const minecraft = spawn(`"${javaPath}"`, javaArgs, {
                    cwd: this.gameDir,
                    shell: true,
                    windowsHide: false,
                    detached: false,
                    stdio: ['ignore', 'pipe', 'pipe']
                });

                this.minecraftProcess = minecraft;

                minecraft.on('error', (err) => {
                    console.error('[MC-DIRECT] Chyba při spouštění procesu Minecraft:', err);
                    this.minecraftProcess = null;
                    throw new Error('Nepodařilo se spustit proces Minecraftu.');
                });

                minecraft.stdout.on('data', (data) => {
                    const lines = data.toString().split('\n');
                    lines.forEach(line => {
                        if (line.trim()) console.log('[MINECRAFT]', line.trim());
                    });
                });
                
                minecraft.stderr.on('data', (data) => {
                    const lines = data.toString().split('\n');
                    lines.forEach(line => {
                        if (line.trim()) console.error('[MINECRAFT ERROR]', line.trim());
                    });
                });
                
                // 4. Detekce chybových kódů při ukončení
                minecraft.on('close', (code) => {
                    if (code !== 0) {
                        console.error(`[MC-DIRECT] Minecraft byl neočekávaně ukončen s chybovým kódem: ${code}`);
                    } else {
                        console.log('[MC-DIRECT] Minecraft byl úspěšně ukončen.');
                    }
                    this.minecraftProcess = null;
                });

            } catch (spawnError) {
                console.error('[MC-DIRECT] Kritická chyba při volání spawn:', spawnError);
                throw spawnError;
            }
            
            if (onProgress) onProgress(100, 'Minecraft spuštěn!');
            
            return true;
        } catch (error) {
            console.error('[MC-DIRECT] Během spouštění Minecraftu došlo k chybě:', error);
            throw error;
        }
    }
    
    buildClasspath(versionData, versionName) {
        const libraries = [];
        let vanillaVersion = versionData.inheritsFrom || versionName.split('-')[0];
        
        console.log('[MC-DIRECT] Vanilla verze pro classpath:', vanillaVersion);
        
        const processLibraries = (libs) => {
            if (!libs) return;
            for (const lib of libs) {
                if (lib.downloads && lib.downloads.artifact) {
                    const libPath = path.join(this.gameDir, 'libraries', lib.downloads.artifact.path);
                    if (fs.existsSync(libPath) && !libraries.includes(libPath)) {
                        libraries.push(libPath);
                    }
                }
            }
        };

        // Načíst vanilla knihovny, pokud existují
        const vanillaJsonPath = path.join(this.gameDir, 'versions', vanillaVersion, `${vanillaVersion}.json`);
        if (fs.existsSync(vanillaJsonPath)) {
            try {
                const vanillaData = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf8'));
                processLibraries(vanillaData.libraries);
            } catch (e) {
                console.error('[MC-DIRECT] Chyba při načítání vanilla JSON:', e);
            }
        }

        // Přidat modloader knihovny
        processLibraries(versionData.libraries);
        
        console.log('[MC-DIRECT] Celkem knihoven v classpath:', libraries.length);
        return libraries.join(path.delimiter);
    }
    
    buildArguments(versionData, user, versionName) {
        const args = [];
        const replacements = {
            '${auth_player_name}': user.username,
            '${version_name}': versionName,
            '${game_directory}': this.gameDir,
            '${assets_root}': path.join(this.gameDir, 'assets'),
            '${asset_index}': this.getAssetsIndex(versionName),
            '${assets_index_name}': this.getAssetsIndex(versionName),
            '${auth_uuid}': user.uuid,
            '${auth_access_token}': user.accessToken || 'null',
            '${user_type}': user.type === 'original' ? 'msa' : 'legacy',
            '${version_type}': 'release',
            '${resolution_width}': '1920',
            '${resolution_height}': '1080',
            '${library_directory}': path.join(this.gameDir, 'libraries'),
            '${classpath_separator}': path.delimiter,
            '${natives_directory}': path.join(this.gameDir, 'natives', versionName),
            '${launcher_name}': 'void-craft-launcher',
            '${launcher_version}': '0.2.2',
            '${clientid}': 'void-craft',
            '${user_properties}': '{}'
        };

        const replaceFunc = (arg) => {
            let result = arg;
            for (const [key, value] of Object.entries(replacements)) {
                result = result.replace(new RegExp(key.replace(/\$/g, '\\$'), 'g'), value);
            }
            return result;
        };

        if (versionData.arguments && versionData.arguments.game) {
            for (const arg of versionData.arguments.game) {
                if (typeof arg === 'string') {
                    args.push(replaceFunc(arg));
                }
            }
        } else if (versionData.minecraftArguments) {
            const oldArgs = versionData.minecraftArguments.split(' ');
            for (const arg of oldArgs) {
                args.push(replaceFunc(arg));
            }
        }
        
        return args;
    }
    
    async extractNatives(versionData, versionName) {
        const AdmZip = require('adm-zip');
        const nativesDir = path.join(this.gameDir, 'natives', versionName);
        
        if (fs.existsSync(nativesDir)) {
            // Předpokládáme, že natives jsou již extrahovány
            return;
        }
        fs.mkdirSync(nativesDir, { recursive: true });
        
        if (versionData.libraries) {
            for (const lib of versionData.libraries) {
                const osName = os.platform() === 'win32' ? 'windows' : (os.platform() === 'darwin' ? 'osx' : 'linux');
                const nativeKey = lib.natives ? lib.natives[osName] : undefined;
                const classifier = lib.downloads?.classifiers?.[nativeKey];

                if (classifier) {
                    const nativePath = path.join(this.gameDir, 'libraries', classifier.path);
                    if (fs.existsSync(nativePath)) {
                        try {
                            console.log(`[MC-DIRECT] Extrahuji natives z: ${path.basename(nativePath)}`);
                            const zip = new AdmZip(nativePath);
                            zip.extractAllTo(nativesDir, true);
                        } catch (e) {
                            console.error(`[MC-DIRECT] Chyba při extrakci natives z ${nativePath}:`, e);
                        }
                    }
                }
            }
        }
    }
    
    getAssetsIndex(versionName) {
        let vanillaVersion = versionName.split('-')[0];
        if (versionName.startsWith('neoforge')) {
            // Příklad: neoforge-47.1.85-1.20.1 -> 1.20.1
            const parts = versionName.split('-');
            vanillaVersion = parts.length > 2 ? parts.pop() : '1.20.1';
        }
        return this.getVanillaAssetsIndex(vanillaVersion);
    }
    
    getVanillaAssetsIndex(version) {
        if (version.startsWith('1.21')) return '17';
        if (version.startsWith('1.20')) return '16';
        if (version.startsWith('1.19')) return '9';
        if (version.startsWith('1.18')) return '3';
        if (version.startsWith('1.17')) return '2';
        if (version.startsWith('1.16')) return '1';
        return version; // Fallback
    }
}

module.exports = MinecraftDirect;