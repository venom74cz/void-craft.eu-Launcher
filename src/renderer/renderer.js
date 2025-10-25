const curseforge = require('../api/curseforge');
const minecraftLauncher = require('../launcher/minecraft');
const modpackInstaller = require('../launcher/modpack-installer');
const microsoftAuth = require('../launcher/microsoft-auth');
const errorHandler = require('../launcher/error-handler');
const path = require('path');
const os = require('os');
const fs = require('fs');

let currentUser = null;
let selectedModpack = '1221931';
let isLaunching = false;

// Inicializace
document.addEventListener('DOMContentLoaded', async () => {
    loadSavedAccount();
    await loadModpackInfo();
    setupEventListeners();
});

// Načtení informací o modpacku z CurseForge
async function loadModpackInfo() {
    try {
        console.log('[LAUNCHER] Načítám info o modpacku ID:', selectedModpack);
        const modpack = await curseforge.getModpack(selectedModpack);
        console.log('[LAUNCHER] Modpack načten:', modpack.name);
        const latestFile = await curseforge.getLatestFile(selectedModpack);
        console.log('[LAUNCHER] Nejnovější soubor:', latestFile.displayName || latestFile.fileName);
        
        const modpackItem = document.querySelector('.modpack-item');
        if (modpackItem) {
            modpackItem.querySelector('.modpack-name').textContent = modpack.name;
            modpackItem.querySelector('.modpack-version').textContent = 
                `v${latestFile.displayName || latestFile.fileName}`;
        }
    } catch (error) {
        errorHandler.error('Chyba při načítání modpacku', error);
        const modpackItem = document.querySelector('.modpack-item');
        if (modpackItem) {
            modpackItem.querySelector('.modpack-version').textContent = 'Chyba načítání';
        }
    }
}

// Event listenery
function setupEventListeners() {
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    document.getElementById('launchBtn').addEventListener('click', handleLaunch);
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    
    // Titlebar buttons
    const { getCurrentWindow } = require('@electron/remote');
    const win = getCurrentWindow();
    
    document.getElementById('minimizeBtn').addEventListener('click', () => {
        win.minimize();
    });
    
    document.getElementById('maximizeBtn').addEventListener('click', () => {
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
    });
    
    document.getElementById('closeBtn').addEventListener('click', () => {
        win.close();
    });
    
    document.querySelectorAll('.modpack-item').forEach(item => {
        item.addEventListener('click', () => {
            document.querySelectorAll('.modpack-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            selectedModpack = item.dataset.id;
        });
    });
}

function openSettings() {
    const { BrowserWindow } = require('@electron/remote');
    const settingsWindow = new BrowserWindow({
        width: 700,
        height: 600,
        parent: require('@electron/remote').getCurrentWindow(),
        modal: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
}

// Odhlášení
function handleLogout() {
    if (confirm('Opravdu se chcete odhlásit?')) {
        const configPath = path.join(os.homedir(), '.void-craft-launcher', 'account.json');
        if (fs.existsSync(configPath)) {
            fs.unlinkSync(configPath);
        }
        window.location.href = 'login.html';
    }
}

// Spuštění hry
async function handleLaunch() {
    if (!currentUser) {
        alert('Nejdřív se přihlas!');
        return;
    }
    
    // Pokud Minecraft běží, ukončit ho
    const isRunning = await minecraftLauncher.isRunning();
    if (isRunning) {
        if (confirm('Minecraft běží. Chcete ho ukončit?')) {
            await minecraftLauncher.kill();
            document.getElementById('launchBtn').textContent = 'Spustit hru';
        }
        return;
    }

    if (isLaunching) return;
    isLaunching = true;

    console.log('[LAUNCHER] ========== SPOUŠTĚNÍ HRY ==========');
    console.log('[LAUNCHER] Uživatel:', currentUser.username, '(' + currentUser.type + ')');
    console.log('[LAUNCHER] Modpack ID:', selectedModpack);

    const launchBtn = document.getElementById('launchBtn');
    const progressBar = document.getElementById('progressBar');
    
    launchBtn.disabled = true;
    progressBar.style.display = 'block';

    try {
        let manifest = null;
        
        // Kontrola, zda je modpack nainstalován
        if (!modpackInstaller.isModpackInstalled(selectedModpack)) {
            console.log('[LAUNCHER] Modpack není nainstalován, začínám instalaci...');
            updateProgress(0, 'Instaluji modpack...');
            manifest = await modpackInstaller.installModpack(selectedModpack, (progress, text) => {
                console.log(`[LAUNCHER] Instalace: ${progress}% - ${text}`);
                updateProgress(Math.round(progress * 0.5), text);
            });
            modpackInstaller.markAsInstalled(selectedModpack, manifest);
            console.log('[LAUNCHER] Modpack úspěšně nainstalován');
        } else {
            console.log('[LAUNCHER] Modpack již nainstalován, načítám manifest...');
            // Načíst manifest z instalovaného modpacku
            const installedPath = require('path').join(
                require('os').homedir(),
                '.void-craft-launcher',
                'minecraft',
                '.installed',
                `${selectedModpack}.json`
            );
            if (require('fs').existsSync(installedPath)) {
                const installed = JSON.parse(require('fs').readFileSync(installedPath, 'utf8'));
                manifest = installed.manifest;
                
                // Zkontrolovat a doinstalovat chybějící mody
                console.log('[LAUNCHER] Kontroluji chybějící mody...');
                await modpackInstaller.downloadMods(manifest, (progress, text) => {
                    console.log(`[LAUNCHER] Mody: ${progress}% - ${text}`);
                    updateProgress(Math.round(progress * 0.3), text);
                });
            }
        }

        // Spuštění Minecraftu
        const mcVersion = manifest?.minecraft?.version || '1.20.1';
        console.log('[LAUNCHER] Minecraft verze:', mcVersion);
        console.log('[LAUNCHER] Spouštím Minecraft launcher...');
        await minecraftLauncher.launch(currentUser, mcVersion, manifest, (progress, type) => {
            console.log(`[LAUNCHER] Minecraft: ${progress}% - ${type}`);
            updateProgress(50 + Math.round(progress * 0.5), type || 'Připravuji hru...');
        });
        
        updateProgress(100, 'Hra spuštěna!');
        launchBtn.textContent = 'Ukončit hru';
        setTimeout(() => {
            progressBar.style.display = 'none';
        }, 2000);
        
        // Kontrolovat stav každých 5 sekund
        const checkInterval = setInterval(async () => {
            const running = await minecraftLauncher.isRunning();
            if (!running) {
                launchBtn.textContent = 'Spustit hru';
                clearInterval(checkInterval);
            }
        }, 5000);
        
    } catch (error) {
        console.error('[LAUNCHER] ========== CHYBA ==========');
        console.error('[LAUNCHER] Chyba při spouštění:', error);
        console.error('[LAUNCHER] Stack trace:', error.stack);
        errorHandler.error('Chyba při spouštění', error);
        alert('Chyba při spouštění hry: ' + errorHandler.getUserFriendlyError(error));
        progressBar.style.display = 'none';
    } finally {
        launchBtn.disabled = false;
        isLaunching = false;
    }
}

// Pomocné funkce
function updateProgress(percent, text) {
    const fill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    fill.style.width = percent + '%';
    progressText.textContent = text || percent + '%';
}

function generateOfflineUUID(username) {
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update('OfflinePlayer:' + username).digest('hex');
    return hash.substring(0, 8) + '-' + hash.substring(8, 12) + '-' + 
           hash.substring(12, 16) + '-' + hash.substring(16, 20) + '-' + hash.substring(20, 32);
}

function saveAccount(account) {
    const configPath = path.join(os.homedir(), '.void-craft-launcher');
    if (!fs.existsSync(configPath)) {
        fs.mkdirSync(configPath, { recursive: true });
    }
    fs.writeFileSync(
        path.join(configPath, 'account.json'),
        JSON.stringify(account, null, 2)
    );
}

function loadSavedAccount() {
    try {
        const configPath = path.join(os.homedir(), '.void-craft-launcher', 'account.json');
        if (fs.existsSync(configPath)) {
            currentUser = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            
            // Opravit UUID formát pro staré účty (přidat pomlčky)
            if (currentUser.uuid && !currentUser.uuid.includes('-')) {
                console.log('[LAUNCHER] Opravuji UUID formát...');
                const uuid = currentUser.uuid;
                currentUser.uuid = `${uuid.substring(0, 8)}-${uuid.substring(8, 12)}-${uuid.substring(12, 16)}-${uuid.substring(16, 20)}-${uuid.substring(20, 32)}`;
                saveAccount(currentUser);
                console.log('[LAUNCHER] UUID opraveno:', currentUser.uuid);
            }
            
            document.getElementById('currentUsername').textContent = currentUser.username;
        } else {
            // Pokud není přihlášen, přesměrovat na login
            window.location.href = 'login.html';
        }
    } catch (error) {
        errorHandler.warn('Chyba při načítání uloženého účtu', error);
        window.location.href = 'login.html';
    }
}
