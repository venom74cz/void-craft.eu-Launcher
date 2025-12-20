const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const axios = require('axios');
const AdmZip = require('adm-zip');

class JavaManager {
    constructor() {
        this.javaDir = path.join(os.homedir(), '.void-craft-launcher', 'java');
        this.isWindows = process.platform === 'win32';
        this.isLinux = process.platform === 'linux';
        this.javaExecutable = this.isWindows ? 'java.exe' : 'java';
        this.ensureDirectories();
    }

    ensureDirectories() {
        if (!fs.existsSync(this.javaDir)) {
            fs.mkdirSync(this.javaDir, { recursive: true });
        }
    }

    async getJavaPath(progressCallback) {
        // 1. Zkusit manuální cestu z nastavení
        const manualJava = this.getManualJavaPath();
        if (manualJava) {
            const version = await this.checkJavaVersion(manualJava);
            if (version && version >= 21) {
                console.log('Použita manuální Java z nastavení:', manualJava, 'verze:', version);
                return manualJava;
            } else {
                console.warn('Manuální Java je neplatná nebo stará verze');
            }
        }

        // 2. Zkusit najít systémovou Javu
        const systemJava = await this.findSystemJava();
        if (systemJava) {
            const version = await this.checkJavaVersion(systemJava);
            if (version && version >= 21) {
                console.log('Nalezena systémová Java:', systemJava, 'verze:', version);
                return systemJava;
            } else {
                console.warn('Systémová Java je stará verze:', version);
            }
        }

        // 3. Zkusit launcher Javu
        const launcherJava = await this.findLauncherJava();
        if (launcherJava) {
            const version = await this.checkJavaVersion(launcherJava);
            if (version && version >= 21) {
                console.log('Nalezena launcher Java:', launcherJava, 'verze:', version);
                return launcherJava;
            } else {
                console.warn('Launcher Java je stará verze:', version);
            }
        }

        // 4. Stáhnout a nainstalovat Javu
        console.log('Java 21+ nenalezena, stahuji...');
        return await this.downloadJava(progressCallback);
    }

    getManualJavaPath() {
        try {
            const configPath = path.join(os.homedir(), '.void-craft-launcher', 'settings.json');
            if (fs.existsSync(configPath)) {
                const settings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                const javaPath = settings.javaPath;
                // Zkontrolovat zda soubor existuje
                if (javaPath && fs.existsSync(javaPath)) {
                    return javaPath;
                } else if (javaPath) {
                    console.warn('Manuální Java cesta neexistuje:', javaPath);
                }
            }
        } catch (error) {
            console.error('Chyba při načítání manuální Java cesty:', error);
        }
        return null;
    }

    async findSystemJava() {
        return new Promise((resolve) => {
            if (this.isWindows) {
                // Windows: použít where
                exec('where java', (err, out) => {
                    if (!err && out) {
                        const javaPath = out.trim().split('\n')[0].trim();
                        console.log('[JAVA] Nalezena Java přes where:', javaPath);
                        resolve(javaPath);
                    } else {
                        console.log('[JAVA] where java nenalezl nic, zkouším Adoptium složky...');
                        const javaPath = this.findJavaInProgramFiles();
                        resolve(javaPath);
                    }
                });
            } else if (this.isLinux) {
                // Linux: použít which
                exec('which java', (err, out) => {
                    if (!err && out) {
                        const javaPath = out.trim().split('\n')[0].trim();
                        console.log('[JAVA] Nalezena Java přes which:', javaPath);
                        resolve(javaPath);
                    } else {
                        console.log('[JAVA] which java nenalezl nic, zkouším standardní cesty...');
                        const javaPath = this.findJavaInLinuxPaths();
                        resolve(javaPath);
                    }
                });
            } else {
                resolve(null);
            }
        });
    }

    findJavaInProgramFiles() {
        const possiblePaths = [
            'C:\\Program Files\\Eclipse Adoptium',
            'C:\\Program Files (x86)\\Eclipse Adoptium'
        ];

        for (const basePath of possiblePaths) {
            if (!fs.existsSync(basePath)) continue;

            try {
                const dirs = fs.readdirSync(basePath);
                for (const dir of dirs) {
                    const javaExe = path.join(basePath, dir, 'bin', 'java.exe');
                    if (fs.existsSync(javaExe)) {
                        console.log('[JAVA] Nalezena Adoptium Java:', javaExe);
                        return javaExe;
                    }
                }
            } catch (e) {
                console.error('[JAVA] Chyba při prohledávání Adoptium:', basePath, e.message);
            }
        }

        return null;
    }

    findJavaInLinuxPaths() {
        const possiblePaths = [
            '/usr/lib/jvm',
            '/usr/java',
            '/opt/java',
            '/opt/jdk',
            path.join(os.homedir(), '.sdkman', 'candidates', 'java')
        ];

        for (const basePath of possiblePaths) {
            if (!fs.existsSync(basePath)) continue;

            try {
                const dirs = fs.readdirSync(basePath);
                // Preferovat novější verze (seřadit sestupně)
                dirs.sort().reverse();
                for (const dir of dirs) {
                    // Hledat Java 21+
                    if (dir.includes('21') || dir.includes('22') || dir.includes('23')) {
                        const javaExe = path.join(basePath, dir, 'bin', 'java');
                        if (fs.existsSync(javaExe)) {
                            console.log('[JAVA] Nalezena Java v Linux cestě:', javaExe);
                            return javaExe;
                        }
                    }
                }
                // Zkusit jakoukoliv Javu
                for (const dir of dirs) {
                    const javaExe = path.join(basePath, dir, 'bin', 'java');
                    if (fs.existsSync(javaExe)) {
                        console.log('[JAVA] Nalezena Java v Linux cestě:', javaExe);
                        return javaExe;
                    }
                }
            } catch (e) {
                console.error('[JAVA] Chyba při prohledávání:', basePath, e.message);
            }
        }

        return null;
    }

    async findLauncherJava() {
        const javaExe = path.join(this.javaDir, 'bin', this.javaExecutable);
        if (fs.existsSync(javaExe)) {
            return javaExe;
        }

        // Zkusit najít v podsložkách
        if (fs.existsSync(this.javaDir)) {
            const dirs = fs.readdirSync(this.javaDir);
            for (const dir of dirs) {
                const possiblePath = path.join(this.javaDir, dir, 'bin', this.javaExecutable);
                if (fs.existsSync(possiblePath)) {
                    return possiblePath;
                }
            }
        }

        return null;
    }

    async downloadJava(progressCallback) {
        const isLinux = this.isLinux;
        const archiveExt = isLinux ? '.tar.gz' : '.zip';
        const archivePath = path.join(this.javaDir, `java${archiveExt}`);

        try {
            // Adoptium (Eclipse Temurin) Java 21 LTS - platform-specific URL
            const platform = isLinux ? 'linux' : 'windows';
            const javaUrl = `https://api.adoptium.net/v3/binary/latest/21/ga/${platform}/x64/jdk/hotspot/normal/eclipse`;

            console.log(`Stahuji Java 21 (Adoptium) pro ${platform}...`);
            if (progressCallback) progressCallback(`Stahuji Java 21 (Adoptium) pro ${platform}...`);

            const response = await axios({
                method: 'GET',
                url: javaUrl,
                responseType: 'arraybuffer',
                timeout: 300000,
                maxRedirects: 5,
                onDownloadProgress: (progressEvent) => {
                    if (progressCallback && progressEvent.total) {
                        const percent = Math.round((progressEvent.loaded / progressEvent.total) * 100);
                        progressCallback(`Stahuji Java: ${percent}%`);
                    }
                }
            });

            console.log('Ukládám Javu...');
            fs.writeFileSync(archivePath, Buffer.from(response.data));

            console.log('Rozbaluji Javu...');
            if (progressCallback) progressCallback('Rozbaluji Javu...');

            if (isLinux) {
                // Linux: použít tar pro .tar.gz
                await this.extractTarGz(archivePath, this.javaDir);
            } else {
                // Windows: použít AdmZip pro .zip
                const zip = new AdmZip(archivePath);
                zip.extractAllTo(this.javaDir, true);
            }

            // Smazat archiv
            if (fs.existsSync(archivePath)) {
                fs.unlinkSync(archivePath);
            }

            const javaPath = await this.findLauncherJava();
            if (javaPath) {
                // Na Linuxu zajistit executable permission
                if (isLinux) {
                    try {
                        fs.chmodSync(javaPath, '755');
                    } catch (e) {
                        console.warn('[JAVA] Nelze nastavit executable permission:', e.message);
                    }
                }
                console.log('Java úspěšně nainstalována (Adoptium):', javaPath);
                return javaPath;
            }

            throw new Error('Java se nepodařilo nainstalovat - java nenalezena po extrakci');
        } catch (error) {
            console.error('Chyba při stahování Javy:', error.message);

            // Vymazat poškozený archiv pokud existuje
            if (fs.existsSync(archivePath)) {
                try {
                    fs.unlinkSync(archivePath);
                    console.log('[JAVA] Poškozený archiv smazán');
                } catch (e) {
                    console.error('[JAVA] Nelze smazat poškozený archiv:', e);
                }
            }

            const crashReporter = require('./crash-reporter');
            crashReporter.reportCrash(error, 'Stahování Java 21');

            let errorMsg = 'Nepodařilo se stáhnout Javu automaticky.\n\n';

            if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
                errorMsg += 'Důvod: Vypršel časový limit připojení.\n';
            } else if (error.code === 'ENOTFOUND') {
                errorMsg += 'Důvod: Nelze se připojit k serveru.\n';
            } else if (error.message && error.message.includes('arraybuffer')) {
                errorMsg += 'Důvod: Chyba při stahování souboru.\n';
            } else {
                errorMsg += `Důvod: ${error.message}\n`;
            }

            errorMsg += '\nStáhni a nainstaluj Java 21 manuálně:\n';
            errorMsg += 'https://adoptium.net/temurin/releases/?version=21\n\n';
            errorMsg += 'Nebo nastav cestu k existující Javě v Nastavení.';

            throw new Error(errorMsg);
        }
    }

    async extractTarGz(archivePath, destDir) {
        return new Promise((resolve, reject) => {
            const { exec } = require('child_process');
            exec(`tar -xzf "${archivePath}" -C "${destDir}"`, (error, stdout, stderr) => {
                if (error) {
                    console.error('[JAVA] Chyba při rozbalování tar.gz:', stderr);
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
    }

    async checkJavaVersion(javaPath) {
        return new Promise((resolve) => {
            exec(`"${javaPath}" -version`, (error, stdout, stderr) => {
                if (!error || stderr) {
                    // Kontrola zda je to Adoptium (Temurin) - ale povolit i jiné verze
                    const output = stderr || stdout;

                    const versionMatch = output.match(/version "(\d+)/);
                    if (versionMatch) {
                        const version = parseInt(versionMatch[1]);
                        // Logovat varování pokud není Temurin, ale akceptovat
                        if (!output.includes('Temurin')) {
                            console.warn('[JAVA] Není Adoptium/Temurin, ale akceptuji:', javaPath);
                        }
                        resolve(version);
                        return;
                    }
                }
                resolve(null);
            });
        });
    }
}

module.exports = new JavaManager();
