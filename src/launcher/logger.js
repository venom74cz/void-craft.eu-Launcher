const fs = require('fs');
const path = require('path');
const os = require('os');
const util = require('util');

class Logger {
    constructor() {
        this.baseDir = path.join(os.homedir(), '.void-craft-launcher');
        this.logDir = path.join(this.baseDir, 'logs');

        const date = new Date();
        const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
        this.logFile = path.join(this.logDir, `launcher-${dateStr}.log`);

        this.ensureLogDir();
        // this.clearLog(); // Disabled to allow appending for the whole day
        this.log('\n\n=== LAUNCHER SESSION START ===\n');
    }

    clearLog() {
        try {
            fs.writeFileSync(this.logFile, '', 'utf8');
        } catch (e) {
            console.error('[LOGGER] Failed to clear log file:', e);
        }
    }

    ensureLogDir() {
        if (!fs.existsSync(this.logDir)) {
            try {
                fs.mkdirSync(this.logDir, { recursive: true });
            } catch (e) {
                console.error('[LOGGER] Failed to create log directory:', e);
            }
        }
    }

    formatMessage(level, args) {
        const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];
        const message = util.format(...args);
        return `[${timestamp}] [${level}] ${message}`;
    }

    write(text) {
        try {
            fs.appendFileSync(this.logFile, text + '\n', 'utf8');
        } catch (e) {
            // If we can't write to file, at least we printed to console
            console.error('[LOGGER] Failed to write to log file:', e);
        }
    }

    log(...args) {
        const text = this.formatMessage('INFO', args);
        console.log(text);
        this.write(text);
    }

    warn(...args) {
        const text = this.formatMessage('WARN', args);
        console.warn(text);
        this.write(text);
    }

    error(...args) {
        const text = this.formatMessage('ERROR', args);
        console.error(text);
        this.write(text);
    }

    debug(...args) {
        // Optional: only log debug if enabled
        const text = this.formatMessage('DEBUG', args);
        console.log(text);
        this.write(text);
    }
}

module.exports = new Logger();
