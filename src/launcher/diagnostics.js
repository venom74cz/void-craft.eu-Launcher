const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const crashReporter = require('./crash-reporter');
const javaManager = require('./java-manager');

class Diagnostics {
    constructor() {
        this.baseDir = path.join(os.homedir(), '.void-craft-launcher');
        this.gameDir = null; // Set per modpack
    }

    setModpackDir(modpackDir) {
        this.gameDir = modpackDir;
    }

    async runFullDiagnostics(modpackId, onProgress) {
        const results = {
            java: { status: 'pending', message: '', autoFixed: false },
            ram: { status: 'pending', message: '', autoFixed: false },
            files: { status: 'pending', message: '', autoFixed: false },
            network: { status: 'pending', message: '', autoFixed: false }
        };

        try {
            // 1. Test Java
            if (onProgress) onProgress('Kontroluji Javu...');
            results.java = await this.checkJava();

            // 2. Test RAM
            if (onProgress) onProgress('Kontroluji RAM...');
            results.ram = await this.checkRAM();

            // 3. Test souborů
            if (onProgress) onProgress('Kontroluji soubory...');
            results.files = await this.checkFiles(modpackId);

            // 4. Test sítě
            if (onProgress) onProgress('Kontroluji síť...');
            results.network = await this.checkNetwork();

            // Odeslat výsledky na Discord
            await this.reportDiagnostics(results);

            return results;
        } catch (error) {
            console.error('[DIAGNOSTICS] Chyba při diagnostice:', error);
            crashReporter.reportCrash(error, 'Diagnostický test');
            throw error;
        }
    }

    async checkJava() {
        try {
            const javaPath = await javaManager.getJavaPath();

            if (!javaPath) {
                return {
                    status: 'error',
                    message: 'Java nebyla nalezena ani stažena',
                    autoFixed: false
                };
            }

            const version = await javaManager.checkJavaVersion(javaPath);

            if (version && version >= 21) {
                return {
                    status: 'ok',
                    message: `Java ${version} nalezena`,
                    autoFixed: false
                };
            } else if (version) {
                return {
                    status: 'warning',
                    message: `Java ${version} je stará (požadováno 21+)`,
                    autoFixed: false
                };
            } else {
                return {
                    status: 'error',
                    message: 'Java nebyla nalezena',
                    autoFixed: false
                };
            }
        } catch (error) {
            return {
                status: 'error',
                message: `Chyba: ${error.message}`,
                autoFixed: false
            };
        }
    }

    async checkRAM() {
        try {
            const totalRAM = Math.round(os.totalmem() / 1024 / 1024 / 1024);
            const freeRAM = Math.round(os.freemem() / 1024 / 1024 / 1024);

            if (totalRAM < 4) {
                return {
                    status: 'warning',
                    message: `Málo RAM: ${totalRAM}GB celkem, ${freeRAM}GB volné (doporučeno min. 4GB)`,
                    autoFixed: false
                };
            } else if (freeRAM < 2) {
                return {
                    status: 'warning',
                    message: `Málo volné RAM: ${freeRAM}GB (doporučeno min. 2GB volné)`,
                    autoFixed: false
                };
            } else {
                return {
                    status: 'ok',
                    message: `RAM: ${totalRAM}GB celkem, ${freeRAM}GB volné`,
                    autoFixed: false
                };
            }
        } catch (error) {
            return {
                status: 'error',
                message: `Chyba: ${error.message}`,
                autoFixed: false
            };
        }
    }

    async checkFiles(modpackId) {
        try {
            const installedPath = path.join(this.gameDir, '.installed', `${modpackId}.json`);

            if (!fs.existsSync(installedPath)) {
                return {
                    status: 'warning',
                    message: 'Modpack není nainstalován',
                    autoFixed: false
                };
            }

            const installed = JSON.parse(fs.readFileSync(installedPath, 'utf8'));
            const manifest = installed.manifest;

            if (!manifest) {
                return {
                    status: 'error',
                    message: 'Chybí manifest modpacku',
                    autoFixed: false
                };
            }

            // Zkontrolovat verzi JSON
            const versionName = manifest.minecraft?.version || '1.20.1';
            const versionJsonPath = path.join(this.gameDir, 'versions', versionName, `${versionName}.json`);

            let missingFiles = [];
            if (!fs.existsSync(versionJsonPath)) {
                missingFiles.push(`Version JSON: ${versionName}`);
            }

            // Zkontrolovat assets
            const assetsDir = path.join(this.gameDir, 'assets');
            if (!fs.existsSync(assetsDir)) {
                missingFiles.push('Assets');
            }

            if (missingFiles.length > 0) {
                // Pokusit se opravit - smazat .installed a vynutit reinstalaci
                console.log('[DIAGNOSTICS] Chybějící soubory, označuji pro reinstalaci...');
                fs.unlinkSync(installedPath);

                return {
                    status: 'ok',
                    message: `Chyběly soubory (${missingFiles.join(', ')}), označeno pro reinstalaci`,
                    autoFixed: true
                };
            }

            return {
                status: 'ok',
                message: 'Všechny soubory v pořádku',
                autoFixed: false
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Chyba: ${error.message}`,
                autoFixed: false
            };
        }
    }

    async checkNetwork() {
        try {
            const axios = require('axios');

            // Test připojení k Mojang
            const startTime = Date.now();
            await axios.get('https://launchermeta.mojang.com/mc/game/version_manifest.json', { timeout: 5000 });
            const mojangPing = Date.now() - startTime;

            // Test připojení k CurseForge
            const startTime2 = Date.now();
            await axios.get('https://api.curseforge.com', { timeout: 5000 });
            const curseforgePing = Date.now() - startTime2;

            return {
                status: 'ok',
                message: `Síť OK (Mojang: ${mojangPing}ms, CurseForge: ${curseforgePing}ms)`,
                autoFixed: false
            };
        } catch (error) {
            return {
                status: 'error',
                message: `Chyba připojení: ${error.message}`,
                autoFixed: false
            };
        }
    }

    async reportDiagnostics(results) {
        try {
            const axios = require('axios');
            const webhookUrl = 'https://discord.com/api/webhooks/1449123709003632791/Yf3bHPWvLshCo1H7KCV3dTZpM0DNJoOPgFG67CRYuWLKFTMkU5Q394-yuSM-7dIn5BWZ';

            const fields = [];
            let color = 0x7c3aed; // Fialová (vše OK)
            let hasError = false;
            let hasWarning = false;

            for (const [key, result] of Object.entries(results)) {
                let emoji = '✅';
                if (result.status === 'error') {
                    emoji = '❌';
                    hasError = true;
                } else if (result.status === 'warning') {
                    emoji = '⚠️';
                    hasWarning = true;
                }

                if (result.autoFixed) {
                    emoji += ' 🔧';
                }

                fields.push({
                    name: `${emoji} ${key.toUpperCase()}`,
                    value: result.message,
                    inline: false
                });
            }

            if (hasError) color = 0xdc2626; // Červená
            else if (hasWarning) color = 0xf59e0b; // Oranžová

            // Načíst uživatele
            let username = 'Neznámý';
            try {
                const accountPath = path.join(os.homedir(), '.void-craft-launcher', 'account.json');
                if (fs.existsSync(accountPath)) {
                    const account = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
                    username = account.username;
                }
            } catch (e) { }

            const embed = {
                title: '🔍 Diagnostický test',
                color: color,
                fields: fields,
                footer: {
                    text: `Uživatel: ${username} | ${os.platform()} ${os.arch()}`
                },
                timestamp: new Date().toISOString()
            };

            await axios.post(webhookUrl, { embeds: [embed] });
            console.log('[DIAGNOSTICS] Výsledky odeslány na Discord');
        } catch (error) {
            console.error('[DIAGNOSTICS] Chyba při odesílání výsledků:', error);
        }
    }
}

module.exports = new Diagnostics();
