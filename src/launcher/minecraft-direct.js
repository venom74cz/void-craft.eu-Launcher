const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const logger = require('./logger');

class MinecraftDirect {
    constructor(gameDir) {
        this.gameDir = gameDir;
        this.minecraftProcess = null;
    }

    isRunning() {
        if (!this.minecraftProcess) return false;
        try {
            // Zkontrolovat zda proces stále běží pomocí PID
            process.kill(this.minecraftProcess.pid, 0);
            return true;
        } catch (e) {
            // Proces neběží
            this.minecraftProcess = null;
            return false;
        }
    }

    kill() {
        if (this.minecraftProcess) {
            try {
                logger.log('[MC-DIRECT] Ukončuji Minecraft proces PID:', this.minecraftProcess.pid);
                this.minecraftProcess.kill('SIGTERM');
                setTimeout(() => {
                    if (this.minecraftProcess) {
                        logger.log('[MC-DIRECT] Vynucené ukončení...');
                        this.minecraftProcess.kill('SIGKILL');
                    }
                }, 5000);
                this.minecraftProcess = null;
                return true;
            } catch (e) {
                logger.error('[MC-DIRECT] Chyba při ukončování:', e);
                this.minecraftProcess = null;
                return false;
            }
        }
        return false;
    }

    // === Helper methods pro správnou detekci OS a architektury (jako PrismLauncher) ===

    getOsName() {
        const platform = os.platform();
        if (platform === 'win32') return 'windows';
        if (platform === 'darwin') return 'osx';
        return 'linux';
    }

    getArchName() {
        const arch = os.arch();
        // Node.js: 'x64', 'ia32', 'arm64', 'arm'
        // Minecraft expects: 'x86_64', 'x86', 'arm64', 'arm32'
        if (arch === 'x64') return 'x86_64';
        if (arch === 'ia32') return 'x86';
        if (arch === 'arm64') return 'arm64';
        if (arch === 'arm') return 'arm32';
        return arch;
    }

    getOsClassifier() {
        // Vrací classifier ve formátu "windows-x86_64" pro natives lookup
        return `${this.getOsName()}-${this.getArchName()}`;
    }

    matchesOS(osRule) {
        if (!osRule) return true;

        const currentOs = this.getOsName();
        const currentArch = this.getArchName();

        // Kontrola OS name
        if (osRule.name && osRule.name !== currentOs) {
            return false;
        }

        // Kontrola architektury
        if (osRule.arch) {
            const archMatch = osRule.arch === 'x86' ? (currentArch === 'x86' || currentArch === 'ia32') :
                osRule.arch === 'x64' ? (currentArch === 'x86_64' || currentArch === 'x64') :
                    osRule.arch === currentArch;
            if (!archMatch) return false;
        }

        // Kontrola verze OS (regex pattern)
        if (osRule.version) {
            const osVersion = os.release();
            try {
                const regex = new RegExp(osRule.version);
                if (!regex.test(osVersion)) return false;
            } catch (e) {
                logger.warn('[MC-DIRECT] Neplatný regex pro OS verzi:', osRule.version);
            }
        }

        return true;
    }

    isLibraryAllowed(lib) {
        // Pokud knihovna nemá rules, je povolena
        if (!lib.rules || lib.rules.length === 0) {
            logger.debug(`[LIB-CHECK] ${lib.name} -> ALLOWED (no rules)`);
            return true;
        }

        // Zpracování rules podle Mojang specifikace
        let allowed = false; // Výchozí stav je "disallow" pokud existují rules

        logger.debug(`[LIB-CHECK] Checking rules for ${lib.name}:`);

        for (const rule of lib.rules) {
            const action = rule.action === 'allow';
            let ruleMatches = false;

            // Pokud rule nemá podmínky, aplikuje se vždy
            if (!rule.os) {
                allowed = action;
                ruleMatches = true;
                logger.debug(`  - Rule (no os constraint) -> action: ${rule.action}, result: ${allowed}`);
                continue;
            }

            // Pokud má OS podmínku, zkontrolovat shodu
            if (this.matchesOS(rule.os)) {
                allowed = action;
                ruleMatches = true;
                logger.debug(`  - Rule (os matched: ${JSON.stringify(rule.os)}) -> action: ${rule.action}, result: ${allowed}`);
            } else {
                logger.debug(`  - Rule (os mismatch: ${JSON.stringify(rule.os)}) -> skipped`);
            }
        }

        logger.debug(`[LIB-CHECK] Final decision for ${lib.name}: ${allowed ? 'ALLOWED' : 'DISALLOWED'}`);
        return allowed;
    }

    async launch(user, versionName, javaPath, onProgress, ramAllocation = 12) {
        try {
            logger.log('[MC-DIRECT] ========== SPOUŠTĚNÍ MINECRAFTU =========');
            logger.log('[MC-DIRECT] Verze:', versionName);
            logger.log('[MC-DIRECT] Uživatel:', user.username, 'UUID:', user.uuid);

            // 1. Kontrola existence Java před spuštěním
            logger.log('[MC-DIRECT] Kontroluji Javu na cestě:', javaPath);
            if (!javaPath || !fs.existsSync(javaPath)) {
                logger.warn('[MC-DIRECT] Java na cestě neexistuje, zkouším znovu získat...');
                const javaManager = require('./java-manager');
                javaPath = await javaManager.getJavaPath();
                logger.log('[MC-DIRECT] Nová Java cesta:', javaPath);
                if (!fs.existsSync(javaPath)) {
                    throw new Error(`Java nebyla nalezena ani po opětovném pokusu: ${javaPath}`);
                }
            }


            // 2. Logování RAM nastavení
            logger.log('[MC-DIRECT] Java nalezena.');

            // Načíst version JSON
            const versionJsonPath = path.join(this.gameDir, 'versions', versionName, `${versionName}.json`);
            logger.log('[MC-DIRECT] Načítám JSON:', versionJsonPath);

            if (!fs.existsSync(versionJsonPath)) {
                throw new Error(`Version JSON nenalezen: ${versionJsonPath}`);
            }

            const versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
            logger.log('[MC-DIRECT] JSON načten, mainClass:', versionData.mainClass);

            if (onProgress) onProgress(40, 'Připravuji classpath...');

            // Sestavit classpath
            const classpath = this.buildClasspath(versionData, versionName);
            const classpathItems = classpath.split(path.delimiter);
            logger.log('[MC-DIRECT] Classpath má', classpathItems.length, 'položek');

            if (onProgress) onProgress(60, 'Připravuji argumenty...');

            // Sestavit argumenty
            const args = this.buildArguments(versionData, user, versionName);
            logger.log('[MC-DIRECT] Argumentů:', args.length);

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
                            .replace(/\$\{launcher_version\}/g, '2.5.5')
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

            // Optimalizované JVM flagy pro Minecraft (Java 21+ s G1GC)
            // Načíst nastavení
            let useOptimizedArgs = true;
            try {
                const configPath = path.join(os.homedir(), '.void-craft-launcher', 'settings.json');
                if (fs.existsSync(configPath)) {
                    const settings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                    if (settings.optimizedJvmArgs === false) {
                        useOptimizedArgs = false;
                        logger.log('[MC-DIRECT] Uživatelské nastavení: Optimalizace JVM vypnuty');
                    }
                }
            } catch (e) {
                logger.warn('[MC-DIRECT] Nepodařilo se načíst nastavení JVM:', e);
            }

            if (useOptimizedArgs) {
                logger.log('[MC-DIRECT] Aplikuji optimalizované JVM flagy...');
                const extraJvmFlags = [
                    '-XX:+UnlockExperimentalVMOptions',
                    '-XX:+UnlockDiagnosticVMOptions',
                    '-XX:+AlwaysActAsServerClassMachine',
                    '-XX:+AlwaysPreTouch',
                    '-XX:+DisableExplicitGC',
                    '-XX:NmethodSweepActivity=1',
                    '-XX:ReservedCodeCacheSize=400M',
                    '-XX:NonNMethodCodeHeapSize=12M',
                    '-XX:ProfiledCodeHeapSize=194M',
                    '-XX:NonProfiledCodeHeapSize=194M',
                    '-XX:-DontCompileHugeMethods',
                    '-XX:+PerfDisableSharedMem',
                    '-XX:+UseFastUnorderedTimeStamps',
                    '-XX:+UseG1GC',
                    '-XX:MaxGCPauseMillis=50',
                    '-XX:G1HeapRegionSize=16M',
                    '-XX:G1NewSizePercent=23',
                    '-XX:G1ReservePercent=20',
                    '-XX:SurvivorRatio=32',
                    '-XX:G1MixedGCCountTarget=3',
                    '-XX:G1HeapWastePercent=20',
                    '-XX:InitiatingHeapOccupancyPercent=10',
                    '-XX:G1RSetUpdatingPauseTimePercent=0',
                    '-XX:MaxTenuringThreshold=1'
                ];

                for (const flag of extraJvmFlags) {
                    if (!jvmArgs.includes(flag)) {
                        jvmArgs.push(flag);
                    }
                }
            }

            // === FIX #6: Windows Intel driver workaround (z PrismLauncher) ===
            // HACK: Stupid hack for Intel drivers. See: https://mojang.atlassian.net/browse/MCL-767
            if (os.platform() === 'win32') {
                jvmArgs.push('-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump');
            }

            // MacOS specific argument
            if (os.platform() === 'darwin') {
                jvmArgs.push('-XstartOnFirstThread');
            }

            // 2. Logování RAM nastavení
            // Zaokrouhlit na celá čísla - Java nepřijímá desetinná čísla v -Xmx/-Xms
            let maxRam = Math.max(2, Math.round(Number(ramAllocation) || 4));
            let minRam = Math.max(1, Math.floor(maxRam / 2));
            if (minRam > maxRam) minRam = maxRam;
            logger.log(`[MC-DIRECT] Alokace RAM: -Xms${minRam}G -Xmx${maxRam}G`);

            const nativesDir = path.join(this.gameDir, 'natives', versionName);
            const javaArgs = [
                `-Xmx${maxRam}G`,
                `-Xms${minRam}G`,
                ...jvmArgs,
                `-Djava.library.path=${nativesDir}`,
                `-Djna.tmpdir=${nativesDir}`,
                `-Dorg.lwjgl.system.SharedLibraryExtractPath=${nativesDir}`,
                `-Dio.netty.native.workdir=${nativesDir}`,
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

            logger.log('[MC-DIRECT] Spouštím proces:', javaPath);
            logger.debug('[MC-DIRECT] Full Java Arguments:\n' + javaArgs.join('\n'));
            logger.debug('[MC-DIRECT] CWD:', this.gameDir);

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
                    logger.error('[MC-DIRECT] Chyba při spouštění procesu Minecraft:', err);
                    this.minecraftProcess = null;
                    throw new Error('Nepodařilo se spustit proces Minecraftu.');
                });

                let stderrBuffer = [];

                const logsDir = path.join(this.gameDir, 'logs');
                if (!fs.existsSync(logsDir)) {
                    fs.mkdirSync(logsDir, { recursive: true });
                }
                const logStream = fs.createWriteStream(path.join(logsDir, 'latest.log'), { flags: 'w' });

                minecraft.stdout.on('data', (data) => {
                    logStream.write(data);
                    const lines = data.toString().split('\n');
                    lines.forEach(line => {
                        if (line.trim()) logger.log('[MINECRAFT]', line.trim());
                    });
                });

                minecraft.stderr.on('data', (data) => {
                    logStream.write(data);
                    const lines = data.toString().split('\n');
                    lines.forEach(line => {
                        if (line.trim()) {
                            logger.error('[MINECRAFT ERROR]', line.trim());
                            stderrBuffer.push(line.trim());
                            if (stderrBuffer.length > 50) stderrBuffer.shift();
                        }
                    });
                });

                // 4. Detekce chybových kódů při ukončení
                minecraft.on('close', (code) => {
                    if (logStream) logStream.end();

                    if (code !== 0) {
                        logger.error(`[MC-DIRECT] Minecraft byl neočekávaně ukončen s chybovým kódem: ${code}`);
                        const crashReporter = require('./crash-reporter');
                        // Použít novou metodu, která odesílá crash reporty a logy jako soubory
                        crashReporter.reportGameCrash(code, stderrBuffer, this.gameDir);
                    } else {
                        logger.log('[MC-DIRECT] Minecraft byl úspěšně ukončen.');
                    }
                    this.minecraftProcess = null;
                });

            } catch (spawnError) {
                logger.error('[MC-DIRECT] Kritická chyba při volání spawn:', spawnError);
                throw spawnError;
            }

            if (onProgress) onProgress(100, 'Minecraft spuštěn!');

            return true;
        } catch (error) {
            logger.error('[MC-DIRECT] Během spouštění Minecraftu došlo k chybě:', error);
            throw error;
        }
    }

    buildClasspath(versionData, versionName) {
        const libraries = [];
        const missingLibraries = [];
        let vanillaVersion = versionData.inheritsFrom || versionName.split('-')[0];

        console.log('[MC-DIRECT] Vanilla verze pro classpath:', vanillaVersion);
        console.log('[MC-DIRECT] OS classifier:', this.getOsClassifier());

        const processLibraries = (libs) => {
            if (!libs) return;
            for (const lib of libs) {
                logger.debug(`[CLASSPATH] Processing library: ${lib.name}`);

                // === FIX #1: Kontrola library rules (jako PrismLauncher) ===
                if (!this.isLibraryAllowed(lib)) {
                    logger.log(`[MC-DIRECT] Přeskakuji knihovnu (rules): ${lib.name}`);
                    logger.debug(`[CLASSPATH] Skipped ${lib.name} due to rules.`);
                    continue;
                }

                // Přeskočit native knihovny - ty se zpracovávají v extractNatives
                if (lib.natives) {
                    logger.debug(`[CLASSPATH] Skipped ${lib.name} (is native).`);
                    continue;
                }

                let libPath = null;

                if (lib.downloads && lib.downloads.artifact) {
                    libPath = path.join(this.gameDir, 'libraries', lib.downloads.artifact.path);
                } else if (lib.name) {
                    // Fallback: Construct path from Maven coordinate
                    // Format: Group:Artifact:Version[:Classifier]
                    const parts = lib.name.split(':');
                    if (parts.length >= 3) {
                        const groupId = parts[0].replace(/\./g, path.sep);
                        const artifactId = parts[1];
                        const version = parts[2];
                        let classifier = '';
                        if (parts.length > 3) {
                            classifier = `-${parts[3]}`;
                        }

                        const jarName = `${artifactId}-${version}${classifier}.jar`;
                        libPath = path.join(this.gameDir, 'libraries', groupId, artifactId, version, jarName);
                    }
                }

                if (libPath) {
                    if (fs.existsSync(libPath)) {
                        if (!libraries.includes(libPath)) {
                            libraries.push(libPath);
                            logger.debug(`[CLASSPATH] Added: ${libPath}`);
                        } else {
                            logger.debug(`[CLASSPATH] Already included: ${libPath}`);
                        }
                    } else {
                        // === FIX #5: Logovat chybějící soubory ===
                        missingLibraries.push(libPath);
                        logger.warn(`[MC-DIRECT] VAROVÁNÍ: Chybí knihovna: ${path.basename(libPath)}`);
                        logger.debug(`[CLASSPATH] MISSING FILE: ${libPath}`);
                    }
                } else {
                    logger.debug(`[CLASSPATH] Failed to resolve path for ${lib.name}`);
                }
            }
        };

        // Načíst vanilla knihovny, pokud existují
        const vanillaJsonPath = path.join(this.gameDir, 'versions', vanillaVersion, `${vanillaVersion}.json`);
        let vanillaData = null;
        if (fs.existsSync(vanillaJsonPath)) {
            try {
                vanillaData = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf8'));
                processLibraries(vanillaData.libraries);
            } catch (e) {
                logger.error('[MC-DIRECT] Chyba při načítání vanilla JSON:', e);
            }
        }

        // Přidat modloader knihovny
        processLibraries(versionData.libraries);

        // === FIX #4: Přidat client JAR do classpath (JEN POKUD TO NENÍ BOOTSTRAPLAUNCHER) ===
        // Pro moderní NeoForge/Forge (BootstrapLauncher) nepřidávat client.jar do classpath,
        // protože to způsobuje konflikt modulů (ResolutionException).
        const isBootstrapLauncher = versionData.mainClass && versionData.mainClass.includes('cpw.mods.bootstraplauncher.BootstrapLauncher');

        if (!isBootstrapLauncher) {
            const clientJarPath = path.join(this.gameDir, 'versions', vanillaVersion, `${vanillaVersion}.jar`);
            if (fs.existsSync(clientJarPath)) {
                if (!libraries.includes(clientJarPath)) {
                    libraries.push(clientJarPath);
                    logger.log('[MC-DIRECT] Přidán client JAR:', path.basename(clientJarPath));
                }
            } else {
                logger.warn('[MC-DIRECT] VAROVÁNÍ: Client JAR nenalezen:', clientJarPath);
                missingLibraries.push(clientJarPath);
            }
        } else {
            logger.log('[MC-DIRECT] Detekován BootstrapLauncher, přeskakuji explicitní přidání client.jar do classpath.');
        }

        // Report missing libraries
        if (missingLibraries.length > 0) {
            logger.warn(`[MC-DIRECT] Celkem chybí ${missingLibraries.length} knihoven!`);
        }

        logger.log('[MC-DIRECT] Celkem knihoven v classpath:', libraries.length);
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
                    logger.error('[MC-DIRECT] Chyba při načítání parent JSON:', e);
                }
            }
        }

        logger.log('[MC-DIRECT] Použit asset index:', assetIndexId);

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
            '${launcher_version}': '2.5.5',
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

        logger.log('[MC-DIRECT] Username argument:', user.username);

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

        const osName = this.getOsName();
        const archName = this.getArchName();
        const osClassifier = this.getOsClassifier();

        console.log(`[MC-DIRECT] Extrakce natives pro: ${osClassifier}`);

        // Zpracovat i vanilla libraries pokud existuje inheritsFrom
        const allLibraries = [...(versionData.libraries || [])];
        if (versionData.inheritsFrom) {
            const vanillaJsonPath = path.join(this.gameDir, 'versions', versionData.inheritsFrom, `${versionData.inheritsFrom}.json`);
            if (fs.existsSync(vanillaJsonPath)) {
                try {
                    const vanillaData = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf8'));
                    if (vanillaData.libraries) {
                        allLibraries.push(...vanillaData.libraries);
                    }
                } catch (e) {
                    logger.error('[MC-DIRECT] Chyba při načítání vanilla JSON pro natives:', e);
                }
            }
        }

        for (const lib of allLibraries) {
            if (!lib.natives) continue;

            // Kontrola rules
            if (!this.isLibraryAllowed(lib)) {
                continue;
            }

            // === FIX #2 & #3: Správná detekce native key s architekturou ===
            let nativeKey = lib.natives[osName];

            // Zkusit přesnější classifier s architekturou
            if (lib.natives[osClassifier]) {
                nativeKey = lib.natives[osClassifier];
            } else if (lib.natives[`${osName}-${archName}`]) {
                nativeKey = lib.natives[`${osName}-${archName}`];
            }

            if (!nativeKey) {
                logger.debug(`[NATIVES] No mapping for ${lib.name} on ${osClassifier} / ${osName}-${archName}`);
                continue;
            }

            // === FIX #3: Nahradit ${arch} placeholder ===
            if (nativeKey.includes('${arch}')) {
                const archBits = archName === 'x86_64' ? '64' :
                    archName === 'x86' ? '32' :
                        archName === 'arm64' ? '64' : '32';
                nativeKey = nativeKey.replace(/\$\{arch\}/g, archBits);
            }

            const classifier = lib.downloads?.classifiers?.[nativeKey];

            if (classifier) {
                const nativePath = path.join(this.gameDir, 'libraries', classifier.path);
                if (fs.existsSync(nativePath)) {
                    try {
                        logger.log(`[MC-DIRECT] Extrahuji natives z: ${path.basename(nativePath)}`);
                        const zip = new AdmZip(nativePath);
                        zip.extractAllTo(nativesDir, true);
                    } catch (e) {
                        logger.error(`[MC-DIRECT] Chyba při extrakci natives z ${nativePath}:`, e);
                    }
                } else {
                    logger.warn(`[MC-DIRECT] VAROVÁNÍ: Native knihovna nenalezena: ${nativePath}`);
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
        // Fallback tabulka pouze pro starší verze, kde se ID liší od názvu verze
        if (version.startsWith('1.7.')) return '1.7.10';

        // Moderní verze (1.13+) obvykle používají index shodný s názvem verze (např. "1.19")
        // nebo dědí z JSONu.
        return version;
    }
}

module.exports = MinecraftDirect;