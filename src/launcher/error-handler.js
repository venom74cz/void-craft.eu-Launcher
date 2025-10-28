const fs = require('fs');
const path = require('path');
const os = require('os');

class ErrorHandler {
    constructor() {
        this.logDir = path.join(os.homedir(), '.void-craft-launcher', 'logs');
        this.ensureLogDirectory();
    }

    ensureLogDirectory() {
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    log(level, message, error = null) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
        
        // Log to console
        const consoleLog = console[level.toLowerCase()] || console.log;
        consoleLog(logMessage);
        if (error) {
            consoleLog(error);
        }

        // Write to file
        const logFile = path.join(this.logDir, `launcher-${this.getDateString()}.log`);
        const fullMessage = error ? `${logMessage}\n${error.stack || error.message}\n` : `${logMessage}\n`;
        
        fs.appendFileSync(logFile, fullMessage);
    }

    getDateString() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    info(message) {
        this.log('info', message);
    }

    warn(message, error = null) {
        this.log('warn', message, error);
    }

    error(message, error = null) {
        this.log('error', message, error);
    }

    /**
     * Přeloží technickou chybu na srozumitelnou hlášku pro uživatele.
     * @param {Error} error Objekt chyby
     * @returns {string} Srozumitelná chybová hláška
     */
    getUserFriendlyError(error) {
        let friendlyMessage = 'Došlo k neznámé chybě.';
        const errorMessage = error.message || '';

        if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNRESET')) {
            friendlyMessage = 'Chyba sítě. Zkontrolujte své připojení k internetu.';
        }
        else if (errorMessage.includes('EACCES') || errorMessage.includes('EPERM')) {
            friendlyMessage = 'Chyba oprávnění. Zkuste spustit launcher jako administrátor.';
        }
        else if (errorMessage.includes('Java nebyla nalezena')) {
            friendlyMessage = `Java nebyla nalezena. Launcher se ji pokusí stáhnout, nebo můžete nastavit cestu manuálně v nastavení.`;
        }
        else if (errorMessage.includes('Minecraft byl neočekávaně ukončen')) {
            friendlyMessage = 'Minecraft se neočekávaně ukončil. Zkontrolujte logy pro více informací.';
        }
        else if (errorMessage.includes('authentication') || errorMessage.includes('login')) {
            friendlyMessage = 'Chyba přihlášení. Zkuste se odhlásit a znovu přihlásit.';
        }
        else if (errorMessage.includes('Failed to download') || errorMessage.includes('nepodařilo stáhnout')) {
            friendlyMessage = 'Nepodařilo se stáhnout potřebné soubory. Zkontrolujte připojení k internetu a zkuste to znovu.';
        }
        else {
            // Fallback na obecnou zprávu, pokud není chyba rozpoznána
            friendlyMessage = `Došlo k chybě: ${errorMessage}`;
        }

        // Přidat odkaz na logy
        return `${friendlyMessage}\n\nPro více detailů zkontrolujte logy ve složce:\n${this.getLogPath()}`;
    }

    getLogPath() {
        return this.logDir;
    }
}

module.exports = new ErrorHandler();