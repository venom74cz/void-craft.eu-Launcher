const path = require('path');
const os = require('os');
const fs = require('fs');

class StatsManager {
    constructor() {
        this.statsPath = path.join(os.homedir(), '.void-craft-launcher', 'stats.json');
        this.ensureStatsFile();
    }

    ensureStatsFile() {
        if (!fs.existsSync(this.statsPath)) {
            const defaultStats = {
                totalLaunches: 0,
                totalPlaytime: 0,
                lastPlayed: null,
                firstLaunch: new Date().toISOString()
            };
            fs.writeFileSync(this.statsPath, JSON.stringify(defaultStats, null, 2));
        }
    }

    getStats() {
        try {
            return JSON.parse(fs.readFileSync(this.statsPath, 'utf8'));
        } catch (error) {
            console.error('[STATS] Chyba při načítání statistik:', error);
            return { totalLaunches: 0, totalPlaytime: 0, lastPlayed: null };
        }
    }

    incrementLaunches() {
        const stats = this.getStats();
        stats.totalLaunches++;
        stats.lastPlayed = new Date().toISOString();
        fs.writeFileSync(this.statsPath, JSON.stringify(stats, null, 2));
    }

    startPlaytimeTracking() {
        this.sessionStart = Date.now();
    }

    stopPlaytimeTracking() {
        if (!this.sessionStart) return;
        
        const sessionTime = Math.floor((Date.now() - this.sessionStart) / 1000);
        const stats = this.getStats();
        stats.totalPlaytime += sessionTime;
        fs.writeFileSync(this.statsPath, JSON.stringify(stats, null, 2));
        this.sessionStart = null;
    }

    formatPlaytime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }
        return `${minutes}m`;
    }
}

module.exports = new StatsManager();
