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
                console.warn('[MC-DIRECT] Java na cestě neexistuje, zkouším znovu získat...');
                const javaManager = require('./java-manager');
                javaPath = await javaManager.getJavaPath();
                console.log('[MC-DIRECT] Nová Java cesta:', javaPath);
                if (!fs.existsSync(javaPath)) {
                    throw new Error(`Java nebyla nalezena ani po opětovném pokusu: ${javaPath}`);
                }
            }

            
            // 2. Logování RAM nastavení
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
                        const replaced = arg
                            .replace(/\$\{natives_directory\}/g, path.join(this.gameDir, 'natives', versionName))
                            .replace(/\$\{launcher_name\}/g, 'void-craft-launcher')
                            .replace(/\$\{launcher_version\}/g, '0.3.6')
                            .replace(/\$\{classpath\}/g, '')
                            .replace(/\$\{classpath_separator\}/g, path.delimiter)
                            .replace(/\$\{library_directory\}/g, path.join(this.gameDir, 'libraries'))
                            .replace(/\$\{version_name\}/g, versionName);
                        if (replaced.trim()) {
                            jvmArgs.push(replaced);
                        }
                    } else if (arg.rules) {
                        // Zpracovat podmíněné argumenty
                        let shouldAdd = true;
                        for (const rule of arg.rules) {
                            if (rule.os && rule.os.name === 'windows' && rule.action === 'allow') {
                                shouldAdd = true;
                            }
                        }
                        if (shouldAdd && arg.value) {
                            const values = Array.isArray(arg.value) ? arg.value : [arg.value];
                            for (const val of values) {
                                const replacedVal = val.replace(/\$\{classpath_separator\}/g, path.delimiter);
                                jvmArgs.push(replacedVal);
                            }
                        }
                    }
                }
            }
            
            // Přidat uživatelem požadované JVM flagy na konec JVM argumentů (bez duplikací)
            // Pokud chcete upravit seznam, měňte pouze pole extraJvmFlags.
            const extraJvmFlags = [
                '-XX:+UseG1GC',
                '-XX:+UnlockExperimentalVMOptions',
                '-XX:G1NewSizePercent=20',
                '-XX:G1ReservePercent=20',
                '-XX:MaxGCPauseMillis=100',
                '-XX:G1HeapRegionSize=32M',
                '-XX:InitiatingHeapOccupancyPercent=15',
                '-XX:+DisableExplicitGC',
                '-XX:MaxMetaspaceSize=1024m'
            ];

            for (const flag of extraJvmFlags) {
                if (!jvmArgs.includes(flag)) {
                    jvmArgs.push(flag);
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
        // Nahradit všechny ${classpath_separator} za správný delimiter
        const classpath = libraries.join(path.delimiter);
        return classpath.replace(/\$\{classpath_separator\}/g, path.delimiter);
    }
    
    buildArguments(versionData, user, versionName) {
        const args = [];
        
        // Získat správný asset index z version JSON
        let assetIndexId = '17';
        if (versionData.assetIndex && versionData.assetIndex.id) {
            assetIndexId = versionData.assetIndex.id;
        } else if (versionData.inheritsFrom) {
            // Zkusit načíst z parent verze
            const parentJsonPath = path.join(this.gameDir, 'versions', versionData.inheritsFrom, `${versionData.inheritsFrom}.json`);
            if (fs.existsSync(parentJsonPath)) {
                try {
                    const parentData = JSON.parse(fs.readFileSync(parentJsonPath, 'utf8'));
                    if (parentData.assetIndex && parentData.assetIndex.id) {
                        assetIndexId = parentData.assetIndex.id;
                    }
                } catch (e) {
                    console.error('[MC-DIRECT] Chyba při načítání parent JSON:', e);
                }
            }
        }
        
        console.log('[MC-DIRECT] Použit asset index:', assetIndexId);
        
        const replacements = {
            '${auth_player_name}': user.username,
            '${version_name}': versionName,
            '${game_directory}': this.gameDir,
            '${assets_root}': path.join(this.gameDir, 'assets'),
            '${game_assets}': path.join(this.gameDir, 'assets'),
            '${asset_index}': assetIndexId,
            '${assets_index_name}': assetIndexId,
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
            '${launcher_version}': '0.4.2',
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
                } else if (arg.rules) {
                    // Zpracovat podmíněné argumenty
                    let shouldAdd = true;
                    for (const rule of arg.rules) {
                        if (rule.action === 'disallow') {
                            shouldAdd = false;
                        }
                    }
                    if (shouldAdd && arg.value) {
                        const values = Array.isArray(arg.value) ? arg.value : [arg.value];
                        for (const val of values) {
                            args.push(replaceFunc(val));
                        }
                    }
                }
            }
        } else if (versionData.minecraftArguments) {
            const oldArgs = versionData.minecraftArguments.split(' ');
            for (const arg of oldArgs) {
                args.push(replaceFunc(arg));
            }
        }
        
        // Přidat povinné argumenty pokud chybí
        if (!args.includes('--username')) {
            args.push('--username', user.username);
        }
        if (!args.includes('--uuid')) {
            args.push('--uuid', user.uuid);
        }
        if (!args.includes('--accessToken')) {
            args.push('--accessToken', user.accessToken || 'null');
        }
        if (!args.includes('--version')) {
            args.push('--version', versionName);
        }
        if (!args.includes('--assetIndex')) {
            args.push('--assetIndex', assetIndexId);
        }
        if (!args.includes('--assetsDir')) {
            args.push('--assetsDir', path.join(this.gameDir, 'assets'));
        }
        
        console.log('[MC-DIRECT] Username argument:', user.username);
        
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