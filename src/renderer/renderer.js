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
let currentModpackId = null;

const configPath = path.join(os.homedir(), '.void-craft-launcher', 'settings.json');
const minecraftDir = path.join(os.homedir(), '.void-craft-launcher', 'minecraft');
const logsDir = path.join(os.homedir(), '.void-craft-launcher', 'logs');
const modsDir = path.join(minecraftDir, 'mods');

// ==========================================
// TOAST NOTIFICATIONS
// ==========================================

function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const titles = {
        success: 'Úspěch',
        error: 'Chyba',
        warning: 'Upozornění',
        info: 'Info'
    };

    toast.innerHTML = `
        <div class="toast-icon">${icons[type]}</div>
        <div class="toast-content">
            <div class="toast-title">${titles[type]}</div>
            <div class="toast-message">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => {
            if (toast.parentElement) {
                toast.parentElement.removeChild(toast);
            }
        }, 300);
    }, duration);
}

// ==========================================
// CONFIRMATION MODAL
// ==========================================

function showConfirmModal(message, callback, title = 'Potvrzení') {
    const modal = document.getElementById('confirmModal');
    const messageEl = document.getElementById('confirmMessage');
    const titleEl = document.getElementById('confirmTitle');
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.style.display = 'flex';

    const cleanup = () => {
        modal.style.display = 'none';
        yesBtn.onclick = null;
        noBtn.onclick = null;
    };

    yesBtn.onclick = () => {
        cleanup();
        callback(true);
    };

    noBtn.onclick = () => {
        cleanup();
        callback(false);
    };
}

// ==========================================
// SETTINGS MODAL
// ==========================================

function openSettings() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'flex';
    loadSettingsValues();
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

function loadSettingsValues() {
    document.getElementById('minecraftDir').value = minecraftDir;
    document.getElementById('logsDir').value = logsDir;

    // Detekce maximální RAM
    const totalGB = Math.floor(os.totalmem() / (1024 * 1024 * 1024));
    const ramSlider = document.getElementById('ramSlider');
    const ramInput = document.getElementById('ramInput');
    const ramMaxInfo = document.getElementById('ramMaxInfo');
    ramSlider.max = Math.max(2, totalGB);
    ramInput.max = Math.max(2, totalGB);
    ramMaxInfo.textContent = `(Max: ${totalGB} GB)`;

    let ramValue = 12;
    let resolution = '1920x1080';
    let javaPath = '';
    let customMinecraftDir = minecraftDir;

    if (fs.existsSync(configPath)) {
        try {
            const settings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (settings.ramAllocation) ramValue = Number(settings.ramAllocation);
            if (settings.resolution) resolution = settings.resolution;
            if (settings.javaPath) javaPath = settings.javaPath;
            if (settings.minecraftDir) customMinecraftDir = settings.minecraftDir;
        } catch (e) {
            console.error('Chyba při načítání nastavení:', e);
        }
    }

    if (ramValue > ramSlider.max) ramValue = ramSlider.max;
    ramSlider.value = ramValue;
    ramInput.value = ramValue;
    document.getElementById('resolution').value = resolution;
    document.getElementById('javaPath').value = javaPath;
    document.getElementById('minecraftDir').value = customMinecraftDir;
}

function saveSettings() {
    const ramValue = document.getElementById('ramInput').value;
    const settings = {
        ramAllocation: ramValue,
        resolution: document.getElementById('resolution').value,
        javaPath: document.getElementById('javaPath').value,
        minecraftDir: document.getElementById('minecraftDir').value
    };

    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
    showToast('Nastavení bylo uloženo', 'success');
    closeSettingsModal();
}

// ==========================================
// MOD MANAGEMENT MODAL
// ==========================================

function openModSettings(modpackId) {
    currentModpackId = modpackId;
    const modal = document.getElementById('modSettingsModal');
    modal.style.display = 'flex';
    loadModList();

    // Clear search
    document.getElementById('modSearchInput').value = '';
}

function closeModSettingsModal() {
    document.getElementById('modSettingsModal').style.display = 'none';
    currentModpackId = null;
}

function loadModList(filter = '') {
    const modListEl = document.getElementById('modList');
    modListEl.innerHTML = '';

    if (!fs.existsSync(modsDir)) {
        modListEl.innerHTML = '<div style="text-align: center; color: var(--void-400); padding: 20px;">Žádné mody nenalezeny. Nejprve spusť hru pro stažení modpacku.</div>';
        return;
    }

    try {
        const files = fs.readdirSync(modsDir);
        const mods = files.filter(f => f.endsWith('.jar') || f.endsWith('.jar.disabled'));

        if (mods.length === 0) {
            modListEl.innerHTML = '<div style="text-align: center; color: var(--void-400); padding: 20px;">Žádné mody nenalezeny. Nejprve spusť hru pro stažení modpacku.</div>';
            return;
        }

        // Seřadit podle názvu
        mods.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

        for (const mod of mods) {
            const isDisabled = mod.endsWith('.jar.disabled');
            const displayName = mod.replace('.jar.disabled', '.jar').replace('.jar', '');

            // Filter
            if (filter && !displayName.toLowerCase().includes(filter.toLowerCase())) {
                continue;
            }

            const modItem = document.createElement('div');
            modItem.className = `mod-item${isDisabled ? ' disabled' : ''}`;
            modItem.innerHTML = `
                <div class="mod-info">
                    <div class="mod-name">${displayName}</div>
                    <div class="mod-filename">${mod}</div>
                </div>
                <label class="toggle-switch">
                    <input type="checkbox" ${!isDisabled ? 'checked' : ''} data-mod="${mod}">
                    <span class="toggle-slider"></span>
                </label>
            `;

            const checkbox = modItem.querySelector('input[type="checkbox"]');
            checkbox.addEventListener('change', (e) => toggleMod(mod, e.target.checked));

            modListEl.appendChild(modItem);
        }
    } catch (error) {
        console.error('Chyba při načítání modů:', error);
        modListEl.innerHTML = '<div style="text-align: center; color: var(--danger); padding: 20px;">Chyba při načítání modů</div>';
    }
}

function toggleMod(filename, enable) {
    try {
        const isCurrentlyDisabled = filename.endsWith('.jar.disabled');
        const baseName = filename.replace('.jar.disabled', '.jar');

        const oldPath = path.join(modsDir, filename);
        let newPath;

        if (enable) {
            // Enable: remove .disabled suffix
            newPath = path.join(modsDir, baseName);
        } else {
            // Disable: add .disabled suffix
            newPath = path.join(modsDir, baseName + '.disabled');
        }

        if (oldPath !== newPath && fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
            console.log(`[MODS] ${enable ? 'Povolen' : 'Zakázán'} mod: ${baseName}`);
            showToast(`Mod ${enable ? 'povolen' : 'zakázán'}: ${baseName.replace('.jar', '')}`, enable ? 'success' : 'warning', 2000);

            // Refresh list
            const filter = document.getElementById('modSearchInput').value;
            loadModList(filter);
        }
    } catch (error) {
        console.error('Chyba při přepínání modu:', error);
        showToast('Chyba při změně stavu modu', 'error');
    }
}

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        loadSavedAccount();
        await loadModpackInfo();
        setupEventListeners();
        loadVersion();
    } catch (error) {
        crashReporter.reportCrash(error, 'Inicializace launcheru');
        console.error('[LAUNCHER] Chyba při inicializaci:', error);
        showToast('Chyba při spuštění launcheru. Crash report byl odeslán.', 'error', 6000);
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
    const logoutBtn = document.getElementById('logoutBtn');
    console.log('[LAUNCHER] logoutBtn element:', logoutBtn);
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
        console.log('[LAUNCHER] Event listener pro logoutBtn zaregistrován');
    } else {
        console.error('[LAUNCHER] CHYBA: logoutBtn element nebyl nalezen!');
    }
    document.getElementById('launchBtn').addEventListener('click', handleLaunch);
    document.getElementById('settingsBtn').addEventListener('click', openSettings);
    document.getElementById('diagnosticsBtn').addEventListener('click', runDiagnostics);
    document.getElementById('checkUpdateBtn').addEventListener('click', checkForUpdates);

    // Settings modal
    document.getElementById('settingsModalClose').addEventListener('click', closeSettingsModal);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);

    // RAM slider sync
    const ramSlider = document.getElementById('ramSlider');
    const ramInput = document.getElementById('ramInput');
    ramSlider.addEventListener('input', () => {
        ramInput.value = ramSlider.value;
    });
    ramInput.addEventListener('input', () => {
        let v = Number(ramInput.value);
        if (isNaN(v) || v < Number(ramInput.min)) v = Number(ramInput.min);
        if (v > Number(ramInput.max)) v = Number(ramInput.max);
        ramInput.value = v;
        ramSlider.value = v;
    });

    // Mod settings modal
    document.getElementById('modSettingsModalClose').addEventListener('click', closeModSettingsModal);
    document.getElementById('modSearchInput').addEventListener('input', (e) => {
        loadModList(e.target.value);
    });

    // Close modals on overlay click
    document.getElementById('settingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'settingsModal') closeSettingsModal();
    });
    document.getElementById('modSettingsModal').addEventListener('click', (e) => {
        if (e.target.id === 'modSettingsModal') closeModSettingsModal();
    });
    document.getElementById('confirmModal').addEventListener('click', (e) => {
        if (e.target.id === 'confirmModal') {
            document.getElementById('confirmModal').style.display = 'none';
        }
    });

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
            // Ignorovat klik na tlačítko nastavení
            if (e.target.classList.contains('btn-modpack-settings')) return;

            document.querySelectorAll('.modpack-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            selectedModpack = item.dataset.id;
        });
    });

    // Modpack settings buttons (gear icon)
    document.querySelectorAll('.btn-modpack-settings').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openModSettings(btn.dataset.id);
        });
    });
}

// Odhlášení
function handleLogout() {
    console.log('[LAUNCHER] handleLogout byl zavolán');
    showConfirmModal('Opravdu se chcete odhlásit?', (confirmed) => {
        if (confirmed) {
            console.log('[LAUNCHER] Uživatel potvrdil odhlášení');
            const accountPath = path.join(os.homedir(), '.void-craft-launcher', 'account.json');
            console.log('[LAUNCHER] Config path:', accountPath);
            if (fs.existsSync(accountPath)) {
                fs.unlinkSync(accountPath);
                console.log('[LAUNCHER] Account.json smazán');
            }
            console.log('[LAUNCHER] Přesměrovávám na login.html');
            window.location.href = 'login.html';
        } else {
            console.log('[LAUNCHER] Uživatel zrušil odhlášení');
        }
    });
}

// Spuštění hry
async function handleLaunch() {
    if (!currentUser) {
        showToast('Nejdřív se přihlas!', 'warning');
        return;
    }

    // Pokud Minecraft běží, ukončit ho
    const isRunning = await minecraftLauncher.isRunning();
    if (isRunning) {
        showConfirmModal('Minecraft běží. Chcete ho ukončit?', async (confirmed) => {
            if (confirmed) {
                await minecraftLauncher.kill();
                document.getElementById('launchBtn').textContent = 'Spustit hru';
            }
        });
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
        showToast('Minecraft byl spuštěn!', 'success');
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
        showToast('Chyba při spouštění hry. Crash report byl odeslán.', 'error', 6000);
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
    const accountDir = path.join(os.homedir(), '.void-craft-launcher');
    if (!fs.existsSync(accountDir)) {
        fs.mkdirSync(accountDir, { recursive: true });
    }
    fs.writeFileSync(
        path.join(accountDir, 'account.json'),
        JSON.stringify(account, null, 2)
    );
}

function loadSavedAccount() {
    try {
        const accountPath = path.join(os.homedir(), '.void-craft-launcher', 'account.json');
        if (fs.existsSync(accountPath)) {
            currentUser = JSON.parse(fs.readFileSync(accountPath, 'utf8'));

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

        let hasError = false;
        let hasFixed = false;
        let resultMessages = [];

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
                hasFixed = true;
            }
            resultMessages.push(`${icon} ${key.toUpperCase()}: ${result.message}`);
        }

        if (hasError) {
            showToast('Diagnostika dokončena s problémy. Zkuste spustit hru znovu.', 'warning', 5000);
        } else if (hasFixed) {
            showToast('Diagnostika dokončena. Některé problémy byly automaticky opraveny.', 'success', 5000);
        } else {
            showToast('Diagnostika dokončena. Vše je v pořádku!', 'success');
        }

        // Log results to console
        console.log('[DIAGNOSTICS] Výsledky:', resultMessages.join('\n'));

        setTimeout(() => {
            progressBar.style.display = 'none';
        }, 2000);
    } catch (error) {
        console.error('[LAUNCHER] Chyba při diagnostice:', error);
        showToast('Chyba při diagnostickém testu: ' + error.message, 'error');
        progressBar.style.display = 'none';
    } finally {
        btn.disabled = false;
        btn.textContent = '🔍 Test spuštění';
    }
}

function checkForUpdates() {
    const { ipcRenderer } = require('electron');
    ipcRenderer.send('check-for-updates');
    const btn = document.getElementById('checkUpdateBtn');
    btn.textContent = 'Kontroluji...';
    btn.disabled = true;
    showToast('Kontroluji aktualizace...', 'info', 2000);
    setTimeout(() => {
        btn.textContent = 'Zkontrolovat aktualizace';
        btn.disabled = false;
    }, 3000);
}

function loadSkinDisplay(user) {
    const canvas = document.getElementById('skinViewer');
    const ctx = canvas.getContext('2d');

    // UUID bez pomlček pro některé API
    const uuidClean = user.uuid ? user.uuid.replace(/-/g, '') : '';
    const timestamp = Date.now();

    // Seznam skin API s fallbacky (pokud jedno nefunguje, zkusí další)
    const skinApis = [
        `https://mc-heads.net/body/${uuidClean}/100`,
        `https://visage.surgeplay.com/bust/100/${uuidClean}`,
        `https://crafatar.com/renders/body/${user.uuid}?overlay&t=${timestamp}`,
        `https://minotar.net/armor/body/${user.username}/100.png`
    ];

    let currentApiIndex = 0;

    function tryLoadSkin() {
        if (currentApiIndex >= skinApis.length) {
            // Všechny API selhaly, zobrazit výchozí ikonu
            console.warn('[LAUNCHER] Nepodařilo se načíst skin ze žádného API, používám výchozí');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#a78bfa';
            ctx.font = '48px Arial';
            ctx.textAlign = 'center';
            ctx.fillText('👤', canvas.width / 2, canvas.height / 2 + 15);
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = skinApis[currentApiIndex];

        console.log(`[LAUNCHER] Zkouším načíst skin z: ${skinApis[currentApiIndex]}`);

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
            console.log('[LAUNCHER] Skin načten pro:', user.username);
        };

        img.onerror = () => {
            console.warn(`[LAUNCHER] Skin API #${currentApiIndex + 1} selhalo, zkouším další...`);
            currentApiIndex++;
            tryLoadSkin();
        };
    }

    tryLoadSkin();
}
