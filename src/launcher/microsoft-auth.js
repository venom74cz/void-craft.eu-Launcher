const axios = require('axios');

class MicrosoftAuth {
    constructor() {
        this.clientId = '00000000402b5328'; // Minecraft client ID
        this.redirectUri = 'https://login.live.com/oauth20_desktop.srf';
    }

    async login() {
        try {
            const authCode = await this.getAuthCode();
            const msToken = await this.getMicrosoftToken(authCode);
            const xblToken = await this.getXBLToken(msToken.access_token);
            const xstsToken = await this.getXSTSToken(xblToken.Token);
            const mcToken = await this.getMinecraftToken(xstsToken.Token, xblToken.DisplayClaims.xui[0].uhs);
            const profile = await this.getMinecraftProfile(mcToken.access_token);

            return {
                type: 'original',
                username: profile.name,
                uuid: profile.id,
                accessToken: mcToken.access_token,
                clientToken: mcToken.access_token
            };
        } catch (error) {
            console.error('Chyba při Microsoft přihlášení:', error);
            throw error;
        }
    }

    async getAuthCode() {
        return new Promise((resolve, reject) => {
            const { BrowserWindow } = require('@electron/remote');
            const authWindow = new BrowserWindow({
                width: 500,
                height: 700,
                show: true,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    webSecurity: true
                }
            });

            const authUrl = `https://login.live.com/oauth20_authorize.srf?client_id=${this.clientId}&response_type=code&redirect_uri=${encodeURIComponent(this.redirectUri)}&scope=XboxLive.signin%20offline_access`;

            authWindow.loadURL(authUrl).catch(err => {
                console.error('Chyba při načítání auth URL:', err);
                reject(new Error('Nepodařilo se načíst přihlašovací stránku'));
            });

            authWindow.webContents.on('will-redirect', (event, url) => {
                if (url.startsWith(this.redirectUri)) {
                    const code = new URL(url).searchParams.get('code');
                    authWindow.close();
                    if (code) {
                        resolve(code);
                    } else {
                        reject(new Error('Nepodařilo se získat autorizační kód'));
                    }
                }
            });

            authWindow.on('closed', () => {
                reject(new Error('Přihlášení bylo zrušeno'));
            });
        });
    }

    async getMicrosoftToken(authCode) {
        const response = await axios.post('https://login.live.com/oauth20_token.srf', new URLSearchParams({
            client_id: this.clientId,
            code: authCode,
            grant_type: 'authorization_code',
            redirect_uri: this.redirectUri
        }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        return response.data;
    }

    async getXBLToken(msAccessToken) {
        const response = await axios.post('https://user.auth.xboxlive.com/user/authenticate', {
            Properties: {
                AuthMethod: 'RPS',
                SiteName: 'user.auth.xboxlive.com',
                RpsTicket: `d=${msAccessToken}`
            },
            RelyingParty: 'http://auth.xboxlive.com',
            TokenType: 'JWT'
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    }

    async getXSTSToken(xblToken) {
        const response = await axios.post('https://xsts.auth.xboxlive.com/xsts/authorize', {
            Properties: {
                SandboxId: 'RETAIL',
                UserTokens: [xblToken]
            },
            RelyingParty: 'rp://api.minecraftservices.com/',
            TokenType: 'JWT'
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    }

    async getMinecraftToken(xstsToken, uhs) {
        const response = await axios.post('https://api.minecraftservices.com/authentication/login_with_xbox', {
            identityToken: `XBL3.0 x=${uhs};${xstsToken}`
        }, {
            headers: { 'Content-Type': 'application/json' }
        });
        return response.data;
    }

    async getMinecraftProfile(mcAccessToken) {
        const response = await axios.get('https://api.minecraftservices.com/minecraft/profile', {
            headers: { 'Authorization': `Bearer ${mcAccessToken}` }
        });
        return response.data;
    }
}

module.exports = new MicrosoftAuth();
