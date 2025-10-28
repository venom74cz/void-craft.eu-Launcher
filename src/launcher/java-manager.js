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
            exec('java -version', (error, stdout, stderr) => {
                if (!error || stderr.includes('version')) {
                    exec('where java', (err, out) => {
                        if (!err && out) {
                            resolve(out.trim().split('\n')[0]);
                        } else {
                            resolve(null);
                        }
                    });
                } else {
                    resolve(null);
                }
            });
        });
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

    async downloadJava() {
        try {
            // Adoptium (Eclipse Temurin) Java 21 pro Windows x64
            const javaUrl = 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jre/hotspot/normal/eclipse';
            const zipPath = path.join(this.javaDir, 'java.zip');

            console.log('Stahuji Java 21...');
            const response = await axios({
                method: 'GET',
                url: javaUrl,
                responseType: 'stream'
            });

            const writer = fs.createWriteStream(zipPath);
            response.data.pipe(writer);

            await new Promise((resolve, reject) => {
                writer.on('finish', resolve);
                writer.on('error', reject);
            });

            console.log('Rozbaluji Javu...');
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(this.javaDir, true);

            // Smazat zip
            fs.unlinkSync(zipPath);

            // Najít java.exe
            const javaPath = await this.findLauncherJava();
            if (javaPath) {
                console.log('Java úspěšně nainstalována:', javaPath);
                return javaPath;
            }

            throw new Error('Java se nepodařilo nainstalovat');
        } catch (error) {
            console.error('Chyba při stahování Javy:', error);
            throw new Error('Nepodařilo se stáhnout Javu. Nainstaluj prosím Java 21 manuálně.');
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
