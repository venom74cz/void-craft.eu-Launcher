const axios = require('axios');

const API_KEY = '$2a$10$u61J7NMsbxMK38t0PNiwo.qOQt.vu7zUS1u.l0U8Cz4aFLnCv8DNa';
const BASE_URL = 'https://api.curseforge.com/v1';

class CurseForgeAPI {
    constructor() {
        this.client = axios.create({
            baseURL: BASE_URL,
            headers: {
                'x-api-key': API_KEY,
                'Accept': 'application/json'
            }
        });
    }

    async getModpack(modpackId) {
        try {
            const response = await this.client.get(`/mods/${modpackId}`);
            return response.data.data;
        } catch (error) {
            console.error('Chyba při načítání modpacku:', error);
            throw error;
        }
    }

    async getModpackFiles(modpackId) {
        try {
            const response = await this.client.get(`/mods/${modpackId}/files`);
            return response.data.data;
        } catch (error) {
            console.error('Chyba při načítání souborů modpacku:', error);
            throw error;
        }
    }

    async getLatestFile(modpackId) {
        try {
            const files = await this.getModpackFiles(modpackId);
            return files.sort((a, b) => new Date(b.fileDate) - new Date(a.fileDate))[0];
        } catch (error) {
            console.error('Chyba při načítání nejnovějšího souboru:', error);
            throw error;
        }
    }

    async getModFile(modId, fileId) {
        try {
            const response = await this.client.get(`/mods/${modId}/files/${fileId}`);
            return response.data.data;
        } catch (error) {
            console.error('Chyba při načítání mod souboru:', error);
            throw error;
        }
    }

    async downloadFile(downloadUrl, outputPath, onProgress) {
        try {
            const fs = require('fs');
            const https = require('https');
            const http = require('http');
            const url = require('url');
            
            return new Promise((resolve, reject) => {
                const doDownload = (downloadUrl, redirectCount = 0) => {
                    if (redirectCount > 5) {
                        reject(new Error('Příliš mnoho redirectů'));
                        return;
                    }
                    
                    const parsedUrl = url.parse(downloadUrl);
                    const protocol = parsedUrl.protocol === 'https:' ? https : http;
                    
                    const request = protocol.get(downloadUrl, (response) => {
                        // Následovat redirecty
                        if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                            doDownload(response.headers.location, redirectCount + 1);
                            return;
                        }
                        
                        if (response.statusCode !== 200) {
                            reject(new Error(`Chyba stahování: ${response.statusCode}`));
                            return;
                        }
                    
                        const totalLength = parseInt(response.headers['content-length'], 10);
                        let downloaded = 0;
                        const startTime = Date.now();
                        
                        const writer = fs.createWriteStream(outputPath);
                        
                        response.on('data', (chunk) => {
                            downloaded += chunk.length;
                            if (onProgress && totalLength) {
                                const progress = Math.round((downloaded * 100) / totalLength);
                                const elapsed = (Date.now() - startTime) / 1000;
                                const speed = downloaded / elapsed / 1024 / 1024;
                                onProgress(progress, speed, downloaded, totalLength);
                            }
                        });
                        
                        response.pipe(writer);
                        
                        writer.on('finish', () => {
                            writer.close();
                            resolve();
                        });
                        
                        writer.on('error', (err) => {
                            fs.unlink(outputPath, () => {});
                            reject(err);
                        });
                    });
                    
                    request.on('error', (err) => {
                        fs.unlink(outputPath, () => {});
                        reject(err);
                    });
                };
                
                doDownload(downloadUrl);
            });
        } catch (error) {
            console.error('Chyba při stahování souboru:', error);
            throw error;
        }
    }
}

module.exports = new CurseForgeAPI();
