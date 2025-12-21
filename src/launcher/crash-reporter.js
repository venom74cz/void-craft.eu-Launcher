const axios = require('axios');
const os = require('os');
const fs = require('fs');
const path = require('path');

class CrashReporter {
    constructor() {
        this.webhookUrl = 'https://discord.com/api/webhooks/1449123709003632791/Yf3bHPWvLshCo1H7KCV3dTZpM0DNJoOPgFG67CRYuWLKFTMkU5Q394-yuSM-7dIn5BWZ';
    }

    async reportCrash(error, context = '') {
        try {
            const crashData = {
                error: error.message || String(error),
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

            await axios.post(this.webhookUrl, {
                embeds: [embed]
            });

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
                footer: { text: 'Void-Craft Launcher v0.2.2' }
            };

            await axios.post(this.webhookUrl, { embeds: [embed] });
        } catch (err) {
            console.error('[CRASH-REPORTER] Chyba při odesílání start reportu:', err);
        }
    }
}

module.exports = new CrashReporter();
