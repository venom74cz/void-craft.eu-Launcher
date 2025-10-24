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
        // Zkusit najít systémovou Javu
        const systemJava = await this.findSystemJava();
        if (systemJava) {
            console.log('Nalezena systémová Java:', systemJava);
            return systemJava;
        }

        // Zkusit launcher Javu
        const launcherJava = await this.findLauncherJava();
        if (launcherJava) {
            console.log('Nalezena launcher Java:', launcherJava);
            return launcherJava;
        }

        // Stáhnout a nainstalovat Javu
        console.log('Java nenalezena, stahuji...');
        return await this.downloadJava();
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
            // Adoptium (Eclipse Temurin) Java 17 pro Windows x64
            const javaUrl = 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jre/hotspot/normal/eclipse';
            const zipPath = path.join(this.javaDir, 'java.zip');

            console.log('Stahuji Java 17...');
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
            throw new Error('Nepodařilo se stáhnout Javu. Nainstaluj prosím Java 17 manuálně.');
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
