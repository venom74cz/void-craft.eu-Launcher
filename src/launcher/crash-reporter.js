const axios = require('axios');
const os = require('os');
const fs = require('fs');
const path = require('path');

class CrashReporter {
    constructor() {
        this.webhookUrl = 'https://discord.com/api/webhooks/1449123709003632791/Yf3bHPWvLshCo1H7KCV3dTZpM0DNJoOPgFG67CRYuWLKFTMkU5Q394-yuSM-7dIn5BWZ';
    }

    async reportCrash(error, context = '', forceReport = false) {
        try {
            const errorMessage = error.message || String(error);

            // 1. Filtrace ignorovaných chyb (pokud není vynuceno)
            if (!forceReport) {
                const ignoredPatterns = [
                    'ENOTFOUND',
                    'ETIMEDOUT',
                    'ECONNRESET',
                    'EACCES',
                    'EPERM',
                    'net::ERR_INTERNET_DISCONNECTED',
                    'net::ERR_CONNECTION_RESET',
                    'User cancelled',
                    'zrušeno uživatelem',
                    'Unexpected token', // Často API chyby
                    '401 Unauthorized',
                    '503 Service Unavailable'
                ];

                if (ignoredPatterns.some(pattern => errorMessage.includes(pattern))) {
                    console.log('[CRASH-REPORTER] Chyba ignorována (běžná chyba):', errorMessage);
                    return;
                }
            }

            const crashData = {
                error: errorMessage,
                stack: error.stack || '',
                context: context,
                timestamp: new Date().toISOString(),
                system: {
                    platform: os.platform(),
                    arch: os.arch(),
                    release: os.release(),
                    memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`
                }
            };

            // Načíst info o uživateli
            try {
                const accountPath = path.join(os.homedir(), '.void-craft-launcher', 'account.json');
                if (fs.existsSync(accountPath)) {
                    const account = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
                    crashData.user = account.username;
                }
            } catch (e) { }

            const embed = {
                title: '🔴 Launcher Crash Report',
                color: 0xdc2626,
                fields: [
                    { name: '❌ Chyba', value: `\`\`\`${crashData.error.substring(0, 1000)}\`\`\``, inline: false },
                    { name: '📍 Kontext', value: context || 'N/A', inline: true },
                    { name: '👤 Uživatel', value: crashData.user || 'Neznámý', inline: true },
                    { name: '💻 Systém', value: `${crashData.system.platform} ${crashData.system.arch}`, inline: true },
                    { name: '🕐 Čas', value: new Date().toLocaleString('cs-CZ'), inline: false }
                ],
                footer: { text: 'Void-Craft Launcher' }
            };

            if (crashData.stack) {
                embed.fields.push({
                    name: '📋 Stack Trace',
                    value: `\`\`\`${crashData.stack.substring(0, 1000)}\`\`\``,
                    inline: false
                });
            }

            // 2. Připojení log souboru
            let logContent = null;
            let logName = 'launcher-log.txt';
            try {
                const date = new Date();
                const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                const logPath = path.join(os.homedir(), '.void-craft-launcher', 'logs', `launcher-${dateStr}.log`);

                if (fs.existsSync(logPath)) {
                    logContent = fs.readFileSync(logPath, 'utf8');
                    embed.fields.push({
                        name: '📎 Příloha',
                        value: `📄 Přiložen log: ${path.basename(logPath)}`,
                        inline: false
                    });
                }
            } catch (e) {
                console.error('[CRASH-REPORTER] Nepodařilo se načíst log:', e);
            }

            // Odeslání (Nativní FormData pro Electron renderer)
            if (logContent) {
                const form = new FormData();
                form.append('payload_json', JSON.stringify({ embeds: [embed] }));

                const blob = new Blob([logContent], { type: 'text/plain' });
                form.append('file', blob, 'launcher.log');

                await axios.post(this.webhookUrl, form);
            } else {
                await axios.post(this.webhookUrl, {
                    embeds: [embed]
                });
            }

            console.log('[CRASH-REPORTER] Crash report odeslán');
        } catch (err) {
            console.error('[CRASH-REPORTER] Chyba při odesílání crash reportu:', err);
        }
    }

    async reportLauncherStart() {
        try {
            const embed = {
                title: '✅ Launcher spuštěn',
                color: 0x7c3aed,
                fields: [
                    { name: '💻 Systém', value: `${os.platform()} ${os.arch()}`, inline: true },
                    { name: '🕐 Čas', value: new Date().toLocaleString('cs-CZ'), inline: true }
                ],
                footer: { text: 'Void-Craft Launcher v2.4.12' }
            };

            await axios.post(this.webhookUrl, { embeds: [embed] });
        } catch (err) {
            console.error('[CRASH-REPORTER] Chyba při odesílání start reportu:', err);
        }
    }

    async reportGameCrash(exitCode, stderrOutput, gameDir) {
        // Ignorovat známé "neškodné" exit kódy
        // 3221226505 (0xC0000409) - STATUS_STACK_BUFFER_OVERRUN (často při ukončování hry/OpenAL)
        // -1073740791 - Signed verze téhož
        // 1 - Generic error (občas při násilném ukončení)
        if (exitCode === 1 || exitCode === 3221226505 || exitCode === -1073740791) {
            console.log('[CRASH-REPORTER] Ignoruji exit code (známý shutdown problém):', exitCode);
            return;
        }

        try {
            // Použít nativní FormData
            const form = new FormData();

            // Načíst info o uživateli
            let username = 'Neznámý';
            try {
                const accountPath = path.join(os.homedir(), '.void-craft-launcher', 'account.json');
                if (fs.existsSync(accountPath)) {
                    const account = JSON.parse(fs.readFileSync(accountPath, 'utf8'));
                    username = account.username;
                }
            } catch (e) { }

            // Najít nejnovější crash report
            let crashReportContent = null;
            let crashReportName = null;
            const crashReportsDir = path.join(gameDir, 'crash-reports');
            if (fs.existsSync(crashReportsDir)) {
                const crashFiles = fs.readdirSync(crashReportsDir)
                    .filter(f => f.endsWith('.txt'))
                    .map(f => ({
                        name: f,
                        path: path.join(crashReportsDir, f),
                        time: fs.statSync(path.join(crashReportsDir, f)).mtime
                    }))
                    .sort((a, b) => b.time - a.time);

                if (crashFiles.length > 0) {
                    const latestCrash = crashFiles[0];
                    // Pouze crash reporty z posledních 2 minut
                    if (Date.now() - latestCrash.time.getTime() < 120000) {
                        crashReportContent = fs.readFileSync(latestCrash.path, 'utf8');
                        crashReportName = latestCrash.name;
                    }
                }
            }

            // Načíst latest.log (posledních 200 řádků)
            let latestLogContent = null;
            const latestLogPath = path.join(gameDir, 'logs', 'latest.log');
            if (fs.existsSync(latestLogPath)) {
                const fullLog = fs.readFileSync(latestLogPath, 'utf8');
                const lines = fullLog.split('\n');
                latestLogContent = lines.slice(-200).join('\n');
            }

            // Vytvořit embed
            const embed = {
                title: '🎮 Minecraft Crash Report',
                color: 0xdc2626,
                fields: [
                    { name: '❌ Exit Code', value: `\`${exitCode}\``, inline: true },
                    { name: '👤 Uživatel', value: username, inline: true },
                    { name: '💻 Systém', value: `${os.platform()} ${os.arch()}`, inline: true },
                    { name: '🕐 Čas', value: new Date().toLocaleString('cs-CZ'), inline: false }
                ],
                footer: { text: 'Void-Craft Launcher' }
            };

            // Přidat stderr output pokud existuje
            if (stderrOutput && stderrOutput.length > 0) {
                const stderrText = Array.isArray(stderrOutput) ? stderrOutput.join('\n') : stderrOutput;
                embed.fields.push({
                    name: '📋 Poslední chyby (stderr)',
                    value: `\`\`\`${stderrText.substring(0, 800)}\`\`\``,
                    inline: false
                });
            }

            // Přidat informaci o přiložených souborech
            const attachedFiles = [];
            if (crashReportContent) attachedFiles.push(`📄 ${crashReportName}`);
            if (latestLogContent) attachedFiles.push('📄 latest.log');

            if (attachedFiles.length > 0) {
                embed.fields.push({
                    name: '📎 Přiložené soubory',
                    value: attachedFiles.join('\n'),
                    inline: false
                });
            }

            // Odeslat s přílohami
            const payload = { embeds: [embed] };
            form.append('payload_json', JSON.stringify(payload));

            // Přidat crash report jako soubor
            if (crashReportContent) {
                const blob = new Blob([crashReportContent], { type: 'text/plain' });
                form.append('file1', blob, crashReportName);
            }

            // Přidat latest.log jako soubor
            if (latestLogContent) {
                const blob = new Blob([latestLogContent], { type: 'text/plain' });
                form.append('file2', blob, 'latest.log');
            }

            await axios.post(this.webhookUrl, form);

            console.log('[CRASH-REPORTER] Game crash report odeslán s přílohami');
        } catch (err) {
            console.error('[CRASH-REPORTER] Chyba při odesílání game crash reportu:', err);
            // Fallback na standardní report bez příloh
            await this.reportCrash(
                new Error(`Minecraft crash - Exit code: ${exitCode}\n\nCrash Reporter Failure: ${err.message}`),
                'Game Crash (Reporter Failed)',
                true // Force report
            );
        }
    }
}

module.exports = new CrashReporter();
