const curseforge = require('../api/curseforge');
const minecraftLauncher = require('../launcher/minecraft');
const modpackInstaller = require('../launcher/modpack-installer');
const microsoftAuth = require('../launcher/microsoft-auth');
const errorHandler = require('../launcher/error-handler');
const crashReporter = require('../launcher/crash-reporter');
const path = require('path');
const os = require('os');
const fs = require('fs');

let currentUser = null;
let selectedModpack = '1402056';
let isLaunching = false;

// Inicializace
document.addEventListener('DOMContentLoaded', async () => {
    try {
        loadSavedAccount();
        await loadModpackInfo();
        setupEventListeners();
        loadVersion();
    } catch (error) {
        crashReporter.reportCrash(error, 'Inicializace launcheru');
        console.error('[LAUNCHER] Chyba při inicializaci:', error);
        alert('❌ Chyba při spuštění launcheru\n\n📨 Crash report byl odeslán adminům. Podíváme se na to!');
    }
});

function loadVersion() {
    const version = require('../../package.json').version;
    document.getElementById('versionInfo').textContent = `v${version}`;
}

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
    document.getElementById('diagnosticsBtn').addEventListener('click', runDiagnostics);
    document.getElementById('checkUpdateBtn').addEventListener('click', checkForUpdates);

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
        item.addEventListener('click', (e) => {
            // Ignorovat klik na tlačítko stažení
            if (e.target.classList.contains('btn-download-modpack')) return;

            document.querySelectorAll('.modpack-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            selectedModpack = item.dataset.id;
        });
    });

    // Přidat event listenery pro tlačítka stažení
    document.querySelectorAll('.btn-download-modpack').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleDownloadModpack(btn.dataset.id);
        });
    });
}

function openSettings() {
    const { BrowserWindow } = require('@electron/remote');
    const settingsWindow = new BrowserWindow({
        width: 700,
        height: 850,
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

    // Načíst nastavení RAM
    let ramAllocation = 12;
    try {
        const configPath = path.join(os.homedir(), '.void-craft-launcher', 'settings.json');
        if (fs.existsSync(configPath)) {
            const settings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (settings.ramAllocation) ramAllocation = Number(settings.ramAllocation);
        }
    } catch (e) {
        console.warn('Nepodařilo se načíst nastavení RAM:', e);
    }

    const launchBtn = document.getElementById('launchBtn');
    const progressBar = document.getElementById('progressBar');

    launchBtn.disabled = true;
    progressBar.style.display = 'block';

    try {
        let manifest = null;
        // Kontrola, zda je modpack nainstalován
        if (!modpackInstaller.isModpackInstalled(selectedModpack)) {
            console.log('[LAUNCHER] Modpack není nainstalován, začínám instalaci...');
            updateProgress(0, '🔍 Načítám informace o modpacku...');
            manifest = await modpackInstaller.installModpack(selectedModpack, (progress, text) => {
                console.log(`[LAUNCHER] Instalace: ${progress}% - ${text}`);
                // Přidání emoji pro lepší vizualizaci
                let displayText = text;
                if (text.includes('Načítám')) displayText = '🔍 ' + text;
                else if (text.includes('Stahování') || text.includes('Stahuji')) displayText = '⬇️ ' + text;
                else if (text.includes('Rozbaluji')) displayText = '📦 ' + text;
                else if (text.includes('Mod')) displayText = '🔧 ' + text;
                else if (text.includes('Hotovo') || text.includes('dokončena')) displayText = '✅ ' + text;
                updateProgress(Math.round(progress * 0.5), displayText);
            });
            modpackInstaller.markAsInstalled(selectedModpack, manifest);
            console.log('[LAUNCHER] Modpack úspěšně nainstalován');
        } else {
            console.log('[LAUNCHER] Modpack již nainstalován, načítám manifest...');
            updateProgress(5, '✅ Modpack již nainstalován');
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
                // Mody se stahují pouze při instalaci, ne při každém spuštění
                console.log('[LAUNCHER] Manifest načten, přeskakuji stahování modů (již nainstalováno)');
            }
        }

        // Spuštění Minecraftu
        const mcVersion = manifest?.minecraft?.version || '1.20.1';
        console.log('[LAUNCHER] Minecraft verze:', mcVersion);
        console.log('[LAUNCHER] Spouštím Minecraft launcher...');
        updateProgress(50, '🎮 Připravuji Minecraft...');
        await minecraftLauncher.launch(currentUser, mcVersion, manifest, (progress, type) => {
            console.log(`[LAUNCHER] Minecraft: ${progress}% - ${type}`);
            // Přidání emoji pro lepší vizualizaci
            let displayText = type || 'Připravuji hru...';
            if (displayText.includes('Java')) displayText = '☕ ' + displayText;
            else if (displayText.includes('forge') || displayText.includes('Fabric') || displayText.includes('NeoForge')) displayText = '🔨 ' + displayText;
            else if (displayText.includes('knihovny') || displayText.includes('libraries')) displayText = '📚 ' + displayText;
            else if (displayText.includes('Spouštím')) displayText = '🚀 ' + displayText;
            else if (displayText.includes('assets')) displayText = '🎨 ' + displayText;
            else displayText = '⚙️ ' + displayText;
            updateProgress(50 + Math.round(progress * 0.5), displayText);
        }, ramAllocation);

        updateProgress(100, 'Hra spuštěna!');
        setTimeout(() => {
            progressBar.style.display = 'none';
        }, 2000);

        // Počkat chvíli než se proces spustí
        setTimeout(async () => {
            const running = await minecraftLauncher.isRunning();
            if (running) {
                launchBtn.textContent = 'Ukončit hru';
            }
        }, 3000);

        // Kontrolovat stav každých 3 sekundy
        const checkInterval = setInterval(async () => {
            const running = await minecraftLauncher.isRunning();
            if (running) {
                launchBtn.textContent = 'Ukončit hru';
            } else {
                launchBtn.textContent = 'Spustit hru';
                clearInterval(checkInterval);
            }
        }, 3000);

    } catch (error) {
        console.error('[LAUNCHER] ========== CHYBA ==========');
        console.error('[LAUNCHER] Chyba při spouštění:', error);
        console.error('[LAUNCHER] Stack trace:', error.stack);
        errorHandler.error('Chyba při spouštění', error);
        crashReporter.reportCrash(error, 'Spouštění hry');
        alert('❌ Chyba při spouštění hry\n\n' + errorHandler.getUserFriendlyError(error) + '\n\n📨 Crash report byl odeslán adminům. Podíváme se na to!');
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
            loadSkinDisplay(currentUser);
        } else {
            // Pokud není přihlášen, přesměrovat na login
            window.location.href = 'login.html';
        }
    } catch (error) {
        errorHandler.warn('Chyba při načítání uloženého účtu', error);
        window.location.href = 'login.html';
    }
}

async function runDiagnostics() {
    const btn = document.getElementById('diagnosticsBtn');
    const progressBar = document.getElementById('progressBar');

    btn.disabled = true;
    btn.textContent = '⏳ Testuji...';
    progressBar.style.display = 'block';

    try {
        const diagnostics = require('../launcher/diagnostics');
        const results = await diagnostics.runFullDiagnostics(selectedModpack, (text) => {
            updateProgress(50, text);
        });

        updateProgress(100, 'Test dokončen!');

        let message = '🔍 Diagnostický test dokončen:\n\n';
        let hasError = false;

        for (const [key, result] of Object.entries(results)) {
            let icon = '✅';
            if (result.status === 'error') {
                icon = '❌';
                hasError = true;
            } else if (result.status === 'warning') {
                icon = '⚠️';
            }

            if (result.autoFixed) {
                icon = '🔧';
            }

            message += `${icon} ${key.toUpperCase()}: ${result.message}\n`;
        }

        if (hasError) {
            message += '\n\n⚠️ Byly nalezeny problémy. Zkuste spustit hru znovu.';
        }

        alert(message);

        setTimeout(() => {
            progressBar.style.display = 'none';
        }, 2000);
    } catch (error) {
        console.error('[LAUNCHER] Chyba při diagnostice:', error);
        alert('❌ Chyba při diagnostickém testu\n\n' + error.message);
        progressBar.style.display = 'none';
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Test spuštění';
    }
}

async function handleDownloadModpack(modpackId) {
    const btn = document.querySelector(`.btn-download-modpack[data-id="${modpackId}"]`);
    const progressBar = document.getElementById('progressBar');

    if (modpackInstaller.isModpackInstalled(modpackId)) {
        alert('✅ Modpack je již stažen!');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳';
    progressBar.style.display = 'block';

    try {
        console.log('[LAUNCHER] Stahuji modpack ID:', modpackId);
        updateProgress(0, '🔍 Načítám informace o modpacku...');

        const manifest = await modpackInstaller.installModpack(modpackId, (progress, text) => {
            console.log(`[LAUNCHER] Instalace: ${progress}% - ${text}`);
            let displayText = text;
            if (text.includes('Načítám')) displayText = '🔍 ' + text;
            else if (text.includes('Stahování') || text.includes('Stahuji')) displayText = '⬇️ ' + text;
            else if (text.includes('Rozbaluji')) displayText = '📦 ' + text;
            else if (text.includes('Mod')) displayText = '🔧 ' + text;
            else if (text.includes('Hotovo') || text.includes('dokončena')) displayText = '✅ ' + text;
            updateProgress(progress, displayText);
        });

        modpackInstaller.markAsInstalled(modpackId, manifest);
        console.log('[LAUNCHER] Modpack úspěšně stažen');

        updateProgress(100, '✅ Modpack stažen!');
        alert('✅ Modpack byl úspěšně stažen!\n\nNyní můžeš spustit hru.');

        setTimeout(() => {
            progressBar.style.display = 'none';
        }, 2000);
    } catch (error) {
        console.error('[LAUNCHER] Chyba při stahování modpacku:', error);
        errorHandler.error('Chyba při stahování modpacku', error);
        crashReporter.reportCrash(error, 'Stahování modpacku');
        alert('❌ Chyba při stahování modpacku\n\n' + errorHandler.getUserFriendlyError(error));
        progressBar.style.display = 'none';
    } finally {
        btn.disabled = false;
        btn.textContent = '⬇️';
    }
}

function checkForUpdates() {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('check-for-updates');
    const btn = document.getElementById('checkUpdateBtn');
    btn.textContent = 'Kontroluji...';
    btn.disabled = true;
    setTimeout(() => {
        btn.textContent = 'Zkontrolovat aktualizace';
        btn.disabled = false;
    }, 3000);
}

function loadSkinDisplay(user) {
    const canvas = document.getElementById('skinViewer');
    const ctx = canvas.getContext('2d');
    const timestamp = Date.now();

    // UUID bez pomlček pro některé API
    const uuidNoDashes = user.uuid ? user.uuid.replace(/-/g, '') : '';
    const uuid = user.uuid || '';
    const username = user.username || '';

    // Seznam skin API zdrojů s fallback - zkouší postupně dokud některé nezfunguje
    const skinSources = [
        // MC-Heads - velmi spolehlivé, podporuje UUID i username
        `https://mc-heads.net/body/${username}/100`,
        // Crafatar - populární, podporuje UUID s pomlčkami
        `https://crafatar.com/renders/body/${uuid}?overlay&scale=4&t=${timestamp}`,
        // Visage - plný render těla
        `https://visage.surgeplay.com/full/100/${uuidNoDashes}`,
        // Minotar - jednoduchý ale spolehlivý
        `https://minotar.net/body/${username}/100`,
        // Cravatar avatars jako fallback
        `https://cravatar.eu/helmavatar/${username}/100`,
        // MC-Heads avatar jako poslední záloha
        `https://mc-heads.net/avatar/${username}/100`
    ];

    let currentSourceIndex = 0;

    function tryLoadSkin() {
        if (currentSourceIndex >= skinSources.length) {
            // Všechny zdroje selhaly, použít výchozí ikonu
            console.warn('[LAUNCHER] Všechny skin zdroje selhaly, používám výchozí ikonu');
            showDefaultSkin();
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        const sourceUrl = skinSources[currentSourceIndex];

        console.log(`[LAUNCHER] Zkouším načíst skin z: ${sourceUrl.split('?')[0]}...`);

        img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const maxHeight = canvas.height - 10;
            const maxWidth = canvas.width - 10;
            const scaleHeight = maxHeight / img.height;
            const scaleWidth = maxWidth / img.width;
            const scale = Math.min(scaleHeight, scaleWidth);
            const imgWidth = img.width * scale;
            const imgHeight = img.height * scale;
            const x = (canvas.width - imgWidth) / 2;
            const y = (canvas.height - imgHeight) / 2;

            ctx.drawImage(img, x, y, imgWidth, imgHeight);
            console.log(`[LAUNCHER] ✅ Skin úspěšně načten pro: ${user.username} (zdroj #${currentSourceIndex + 1})`);
        };

        img.onerror = () => {
            console.warn(`[LAUNCHER] ⚠️ Skin zdroj #${currentSourceIndex + 1} selhal, zkouším další...`);
            currentSourceIndex++;
            tryLoadSkin();
        };

        // Timeout pro případ, že server neodpovídá
        setTimeout(() => {
            if (!img.complete || img.naturalHeight === 0) {
                console.warn(`[LAUNCHER] ⏱️ Timeout pro skin zdroj #${currentSourceIndex + 1}`);
                img.src = ''; // Zrušit načítání
                currentSourceIndex++;
                tryLoadSkin();
            }
        }, 5000);

        img.src = sourceUrl;
    }

    function showDefaultSkin() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Nakreslit gradient pozadí
        const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        gradient.addColorStop(0, '#1e1b4b');
        gradient.addColorStop(1, '#0f172a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Nakreslit výchozí siluetu
        ctx.fillStyle = '#a78bfa';
        ctx.font = '40px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('👤', canvas.width / 2, canvas.height / 2);

        // Přidat jméno pod ikonou
        ctx.fillStyle = '#64748b';
        ctx.font = '10px Arial';
        ctx.fillText(user.username || 'Hráč', canvas.width / 2, canvas.height - 10);
    }

    // Začít načítání skinů
    tryLoadSkin();
}
