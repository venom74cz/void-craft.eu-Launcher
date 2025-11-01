const { exec } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const axios = require('axios');
const AdmZip = require('adm-zip');

class JavaManager {
    constructor() {
        this.javaDir = path.join(os.homedir(), '.void-craft-launcher', 'java');
        this.ensureDirectories();
    }

    ensureDirectories() {
        if (!fs.existsSync(this.javaDir)) {
            fs.mkdirSync(this.javaDir, { recursive: true });
        }
    }

    async getJavaPath() {
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
        return await this.downloadJava();
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
            // Použít where java přímo
            exec('where java', (err, out) => {
                if (!err && out) {
                    const javaPath = out.trim().split('\n')[0].trim();
                    console.log('[JAVA] Nalezena systémová Java přes where:', javaPath);
                    resolve(javaPath);
                } else {
                    console.log('[JAVA] where java nenalezl nic, zkouším Program Files...');
                    const javaPath = this.findJavaInProgramFiles();
                    resolve(javaPath);
                }
            });
        });
    }
    
    findJavaInProgramFiles() {
        const possiblePaths = [
            'C:\\Program Files\\Java',
            'C:\\Program Files\\Microsoft',
            'C:\\Program Files (x86)\\Java',
            'C:\\Program Files (x86)\\Microsoft'
        ];
        
        for (const basePath of possiblePaths) {
            if (!fs.existsSync(basePath)) continue;
            
            try {
                const dirs = fs.readdirSync(basePath);
                for (const dir of dirs) {
                    if (dir.includes('jdk') || dir.includes('java')) {
                        const javaExe = path.join(basePath, dir, 'bin', 'java.exe');
                        if (fs.existsSync(javaExe)) {
                            console.log('[JAVA] Nalezena Java v Program Files:', javaExe);
                            return javaExe;
                        }
                    }
                }
            } catch (e) {
                console.error('[JAVA] Chyba při prohledávání:', basePath, e.message);
            }
        }
        
        return null;
    }

    async findLauncherJava() {
        const javaExe = path.join(this.javaDir, 'bin', 'java.exe');
        if (fs.existsSync(javaExe)) {
            return javaExe;
        }

        // Zkusit najít v podsložkách
        if (fs.existsSync(this.javaDir)) {
            const dirs = fs.readdirSync(this.javaDir);
            for (const dir of dirs) {
                const possiblePath = path.join(this.javaDir, dir, 'bin', 'java.exe');
                if (fs.existsSync(possiblePath)) {
                    return possiblePath;
                }
            }
        }

        return null;
    }

    async downloadJava(progressCallback) {
        const zipPath = path.join(this.javaDir, 'java.zip');
        
        try {
            const javaUrl = 'https://download.oracle.com/java/21/archive/jdk-21.0.8_windows-x64_bin.zip';

            console.log('Stahuji Java 21...');
            if (progressCallback) progressCallback('Stahuji Java 21...');

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
            fs.writeFileSync(zipPath, Buffer.from(response.data));

            console.log('Rozbaluji Javu...');
            if (progressCallback) progressCallback('Rozbaluji Javu...');
            
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(this.javaDir, true);

            // Smazat zip soubor
            if (fs.existsSync(zipPath)) {
                fs.unlinkSync(zipPath);
            }

            const javaPath = await this.findLauncherJava();
            if (javaPath) {
                console.log('Java úspěšně nainstalována:', javaPath);
                return javaPath;
            }

            throw new Error('Java se nepodařilo nainstalovat - java.exe nenalezena po extrakci');
        } catch (error) {
            console.error('Chyba při stahování Javy:', error.message);
            
            // Vymazat poškozený zip pokud existuje
            if (fs.existsSync(zipPath)) {
                try {
                    fs.unlinkSync(zipPath);
                    console.log('[JAVA] Poškozený zip smazán');
                } catch (e) {
                    console.error('[JAVA] Nelze smazat poškozený zip:', e);
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
            errorMsg += 'https://download.oracle.com/java/21/archive/jdk-21.0.8_windows-x64_bin.exe\n\n';
            errorMsg += 'Nebo nastav cestu k existující Javě v Nastavení.';
            
            throw new Error(errorMsg);
        }
    }

    async checkJavaVersion(javaPath) {
        return new Promise((resolve) => {
            exec(`"${javaPath}" -version`, (error, stdout, stderr) => {
                if (!error || stderr) {
                    const versionMatch = stderr.match(/version "(\d+)/);
                    if (versionMatch) {
                        resolve(parseInt(versionMatch[1]));
                    }
                }
                resolve(null);
            });
        });
    }
}

module.exports = new JavaManager();
