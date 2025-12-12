const axios = require('axios');
const os = require('os');
const fs = require('fs');
const path = require('path');

class CrashReporter {
    constructor() {
        this._e = null;
    }

    _d(s) { return Buffer.from(s, 'base64').toString('utf8'); }
    _x(s, k) { return s.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ k.charCodeAt(i % k.length))).join(''); }
    _r(s) { return s.split('').reverse().join(''); }

    _getEndpoint() {
        if (this._e) return this._e;
        const _p1 = 'aHR0cHM6Ly9kaXNjb3JkLmNvbS9hcGk=';
        const _p2 = 'L3dlYmhvb2tzLw==';
        const _p3 = 'MTQ0OTEyMzcwOTAwMzYzMjc5MQ==';
        const _p4 = 'WWYzYkhQV3ZMc2hDbzFIN0tDVjNkVFpwTTBETkpvT1BnRkc2N0NSWXVXTEtGVE1rVTVRMzk0LXl1U00tN2RJbjVCV1o=';
        const _a = this._d(_p1);
        const _b = this._d(_p2);
        const _c = this._d(_p3);
        const _t = this._d(_p4);
        this._e = _a + _b + _c + '/' + _t;
        return this._e;
    }

    get webhookUrl() {
        return this._getEndpoint();
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
                footer: { text: 'Void-Craft Launcher v2.0.0' }
            };

            await axios.post(this.webhookUrl, { embeds: [embed] });
        } catch (err) {
            console.error('[CRASH-REPORTER] Chyba při odesílání start reportu:', err);
        }
    }
}

module.exports = new CrashReporter();
