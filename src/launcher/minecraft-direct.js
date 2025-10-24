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

    async launch(user, versionName, javaPath, onProgress) {
        try {
            console.log('[MC-DIRECT] Spouštím Minecraft přímo...');
            console.log('[MC-DIRECT] Verze:', versionName);
            console.log('[MC-DIRECT] Java:', javaPath);
            
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
            console.log('[MC-DIRECT] LWJGL v classpath:', classpathItems.filter(p => p.includes('lwjgl')).length, 'knihoven');
            
            if (onProgress) onProgress(60, 'Připravuji argumenty...');
            
            // Sestavit argumenty
            const args = this.buildArguments(versionData, user, versionName);
            console.log('[MC-DIRECT] Argumentů:', args.length);
            
            if (onProgress) onProgress(70, 'Extrahuj natives...');
            
            // Extrahovat natives
            await this.extractNatives(versionData, versionName);
            
            if (onProgress) onProgress(80, 'Spouštím hru...');
            
            // Přidat JVM argumenty z JSON (pro NeoForge)
            const jvmArgs = [];
            if (versionData.arguments && versionData.arguments.jvm) {
                for (const arg of versionData.arguments.jvm) {
                    if (typeof arg === 'string') {
                        jvmArgs.push(this.replaceVariables(arg, user, versionName));
                    }
                }
            }
            
            console.log('[MC-DIRECT] JVM argumenty z JSON:', jvmArgs.length);
            
            // Spustit Minecraft (Prism přístup - vše v classpath)
            const javaArgs = [
                `-Xmx8G`,
                `-Xms4G`,
                ...jvmArgs,
                `-Djava.library.path=${path.join(this.gameDir, 'natives', versionName)}`,
                `-cp`,
                classpath,
                versionData.mainClass,
                ...args
            ];
            
            // Na Windows použít classpath file kvůli limitu délky příkazové řádky
            const classpathFile = path.join(this.gameDir, 'classpath.txt');
            fs.writeFileSync(classpathFile, classpath);
            
            // Nahradit -cp classpath za -cp @file
            const cpIndex = javaArgs.indexOf('-cp');
            if (cpIndex !== -1) {
                javaArgs[cpIndex + 1] = `@${classpathFile}`;
            }
            
            console.log('[MC-DIRECT] Spouštím:', javaPath);
            console.log('[MC-DIRECT] První argumenty:', javaArgs.slice(0, 5).join(' '));
            console.log('[MC-DIRECT] Použit classpath file:', classpathFile);
            
            const minecraft = spawn(`"${javaPath}"`, javaArgs, {
                cwd: this.gameDir,
                shell: true,
                windowsHide: false,
                detached: false,
                stdio: ['ignore', 'pipe', 'pipe']
            });
            
            // Uložit proces pro pozdější ukončení
            this.minecraftProcess = minecraft;
            
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
            
            minecraft.on('close', (code) => {
                console.log('[MC-DIRECT] Minecraft ukončen s kódem:', code);
                this.minecraftProcess = null;
            });
            
            if (onProgress) onProgress(100, 'Minecraft spuštěn!');
            
            return true;
        } catch (error) {
            console.error('[MC-DIRECT] Chyba:', error);
            throw error;
        }
    }
    
    buildClasspath(versionData, versionName) {
        const libraries = [];
        
        // Extrahovat vanilla verzi z názvu
        let vanillaVersion = null;
        if (versionName.startsWith('neoforge-')) {
            // neoforge-21.1.205 -> načíst z inheritsFrom
            vanillaVersion = versionData.inheritsFrom || '1.21.1';
        } else if (versionName.includes('-')) {
            vanillaVersion = versionName.split('-')[0];
        } else {
            vanillaVersion = versionName;
        }
        
        console.log('[MC-DIRECT] Vanilla verze:', vanillaVersion);
        
        // Načíst vanilla knihovny
        if (vanillaVersion) {
            const vanillaJsonPath = path.join(this.gameDir, 'versions', vanillaVersion, `${vanillaVersion}.json`);
            console.log('[MC-DIRECT] Hledám vanilla JSON:', vanillaJsonPath, 'Existuje:', fs.existsSync(vanillaJsonPath));
            
            if (fs.existsSync(vanillaJsonPath)) {
                try {
                    const vanillaData = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf8'));
                    console.log('[MC-DIRECT] Vanilla knihoven:', vanillaData.libraries?.length || 0);
                    
                    if (vanillaData.libraries) {
                        for (const lib of vanillaData.libraries) {
                            if (lib.downloads && lib.downloads.artifact) {
                                const libPath = path.join(this.gameDir, 'libraries', lib.downloads.artifact.path);
                                if (fs.existsSync(libPath)) {
                                    libraries.push(libPath);
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error('[MC-DIRECT] Chyba při načítání vanilla JSON:', e);
                }
            }
        }
        
        // Přidat NeoForge knihovny
        if (versionData.libraries) {
            for (const lib of versionData.libraries) {
                if (lib.downloads && lib.downloads.artifact) {
                    const libPath = path.join(this.gameDir, 'libraries', lib.downloads.artifact.path);
                    if (fs.existsSync(libPath) && !libraries.includes(libPath)) {
                        libraries.push(libPath);
                    }
                }
            }
        }
        
        // NEPOŘÍDAT vanilla client jar - NeoForge už obsahuje Minecraft kód
        // (Prism to tak dělá - používá jen knihovny, ne jar)
        
        console.log('[MC-DIRECT] Celkem knihoven v classpath:', libraries.length);
        return libraries.join(path.delimiter);
    }
    
    buildArguments(versionData, user, versionName) {
        const args = [];
        
        // Game arguments
        if (versionData.arguments && versionData.arguments.game) {
            for (const arg of versionData.arguments.game) {
                if (typeof arg === 'string') {
                    args.push(this.replaceVariables(arg, user, versionName));
                }
            }
        } else if (versionData.minecraftArguments) {
            // Starší formát
            const oldArgs = versionData.minecraftArguments.split(' ');
            for (const arg of oldArgs) {
                args.push(this.replaceVariables(arg, user, versionName));
            }
        }
        
        // Přidat povinné argumenty
        if (!args.includes('--accessToken')) {
            args.push('--accessToken', user.accessToken || 'null');
        }
        if (!args.includes('--version')) {
            args.push('--version', versionName);
        }
        
        return args;
    }
    
    async extractNatives(versionData, versionName) {
        const AdmZip = require('adm-zip');
        const nativesDir = path.join(this.gameDir, 'natives', versionName);
        
        if (!fs.existsSync(nativesDir)) {
            fs.mkdirSync(nativesDir, { recursive: true });
        }
        
        if (versionData.libraries) {
            for (const lib of versionData.libraries) {
                if (lib.natives && lib.downloads && lib.downloads.classifiers) {
                    const osName = os.platform() === 'win32' ? 'windows' : (os.platform() === 'darwin' ? 'osx' : 'linux');
                    const nativeKey = lib.natives[osName];
                    
                    if (nativeKey && lib.downloads.classifiers[nativeKey]) {
                        const nativePath = path.join(this.gameDir, 'libraries', lib.downloads.classifiers[nativeKey].path);
                        
                        if (fs.existsSync(nativePath)) {
                            try {
                                const zip = new AdmZip(nativePath);
                                zip.extractAllTo(nativesDir, true);
                            } catch (e) {
                                console.error('[MC-DIRECT] Chyba při extrakci natives:', e);
                            }
                        }
                    }
                }
            }
        }
    }
    
    replaceVariables(arg, user, versionName) {
        return arg
            .replace(/\$\{auth_player_name\}/g, user.username)
            .replace(/\$\{version_name\}/g, versionName)
            .replace(/\$\{game_directory\}/g, this.gameDir)
            .replace(/\$\{assets_root\}/g, path.join(this.gameDir, 'assets'))
            .replace(/\$\{assets_index_name\}/g, versionName)
            .replace(/\$\{auth_uuid\}/g, user.uuid)
            .replace(/\$\{auth_access_token\}/g, user.accessToken || 'null')
            .replace(/\$\{user_type\}/g, user.type === 'original' ? 'msa' : 'legacy')
            .replace(/\$\{version_type\}/g, 'release')
            .replace(/\$\{resolution_width\}/g, '1920')
            .replace(/\$\{resolution_height\}/g, '1080')
            .replace(/\$\{library_directory\}/g, path.join(this.gameDir, 'libraries'))
            .replace(/\$\{classpath_separator\}/g, path.delimiter)
            .replace(/\$\{natives_directory\}/g, path.join(this.gameDir, 'natives', versionName))
            .replace(/\$\{launcher_name\}/g, 'void-craft-launcher')
            .replace(/\$\{launcher_version\}/g, '1.0.0')
            .replace(/\$\{clientid\}/g, 'void-craft')
            .replace(/\$\{user_properties\}/g, '{}');
    }
}

module.exports = MinecraftDirect;
