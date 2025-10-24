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
        const logMessage = `[${timestamp}] [${level}] ${message}`;
        
        console.log(logMessage);
        
        if (error) {
            console.error(error);
        }

        // Zapsat do souboru
        const logFile = path.join(this.logDir, `launcher-${this.getDateString()}.log`);
        const fullMessage = error ? `${logMessage}\n${error.stack}\n` : `${logMessage}\n`;
        
        fs.appendFileSync(logFile, fullMessage);
    }

    getDateString() {
        const date = new Date();
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    }

    info(message) {
        this.log('INFO', message);
    }

    warn(message, error = null) {
        this.log('WARN', message, error);
    }

    error(message, error = null) {
        this.log('ERROR', message, error);
    }

    getUserFriendlyError(error) {
        if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
            return 'Chyba připojení k internetu. Zkontroluj své připojení.';
        }
        
        if (error.message.includes('EACCES') || error.message.includes('EPERM')) {
            return 'Nedostatečná oprávnění. Spusť launcher jako administrátor.';
        }

        if (error.message.includes('Java')) {
            return 'Problém s Javou. Zkus restartovat launcher.';
        }

        if (error.message.includes('authentication') || error.message.includes('login')) {
            return 'Chyba přihlášení. Zkus se přihlásit znovu.';
        }

        return error.message || 'Neznámá chyba. Zkontroluj logy.';
    }

    getLogPath() {
        return this.logDir;
    }
}

module.exports = new ErrorHandler();
