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
        loadCustomModpacks();
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

            // Načíst ikonu modpacku z CurseForge
            const iconElement = modpackItem.querySelector('.modpack-icon');
            if (iconElement && modpack.logo && modpack.logo.url) {
                iconElement.innerHTML = `<img src="${modpack.logo.url}" alt="${modpack.name}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">`;
            }
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
    document.getElementById('addModpackBtn').addEventListener('click', openAddModpackModal);

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

    setupModpackListeners();
}

function openSettings() {
    const modal = document.getElementById('settingsModal');
    modal.style.display = 'flex';
    loadSettingsModal();
    setupSettingsModalListeners();
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

function loadSettingsModal() {
    const configPath = path.join(os.homedir(), '.void-craft-launcher', 'settings.json');
    const modpacksDir = path.join(os.homedir(), '.void-craft-launcher', 'modpacks');
    const logsDir = path.join(os.homedir(), '.void-craft-launcher', 'logs');

    document.getElementById('minecraftDir').value = modpacksDir;
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
    if (fs.existsSync(configPath)) {
        try {
            const settings = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            if (settings.ramAllocation) ramValue = Number(settings.ramAllocation);
            if (settings.resolution) document.getElementById('resolution').value = settings.resolution;
            if (settings.javaPath) document.getElementById('javaPath').value = settings.javaPath;
            document.getElementById('optimizedJvmArgs').checked = settings.optimizedJvmArgs !== false; // Default true
        } catch (e) {
            console.error('[SETTINGS] Chyba při načítání nastavení:', e);
        }
    } else {
        // Defaultní hodnoty pokud config neexistuje
        document.getElementById('optimizedJvmArgs').checked = true;
    }
    if (ramValue > ramSlider.max) ramValue = ramSlider.max;
    ramSlider.value = ramValue;
    ramInput.value = ramValue;
}

function saveSettingsModal() {
    const configPath = path.join(os.homedir(), '.void-craft-launcher', 'settings.json');
    const ramValue = document.getElementById('ramInput').value;
    const settings = {
        ramAllocation: ramValue,
        resolution: document.getElementById('resolution').value,
        javaPath: document.getElementById('javaPath').value,
        optimizedJvmArgs: document.getElementById('optimizedJvmArgs').checked
    };

    const configDir = path.dirname(configPath);
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
    closeSettingsModal();
    showToast('✅ Nastavení uloženo!');
}

function showToast(message) {
    // Jednoduchý toast notification
    const toast = document.createElement('div');
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(14, 116, 144, 0.9);
        color: white;
        padding: 12px 24px;
        border-radius: 8px;
        z-index: 2000;
        font-weight: bold;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 2000);
}

function setupSettingsModalListeners() {
    // Zavírací tlačítka
    const closeBtn = document.getElementById('closeSettingsModal');
    const cancelBtn = document.getElementById('cancelSettingsBtn');
    const saveBtn = document.getElementById('saveSettingsBtn');
    const modal = document.getElementById('settingsModal');

    // Odstranit staré listenery klonováním
    closeBtn.replaceWith(closeBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    saveBtn.replaceWith(saveBtn.cloneNode(true));

    document.getElementById('closeSettingsModal').addEventListener('click', closeSettingsModal);
    document.getElementById('cancelSettingsBtn').addEventListener('click', closeSettingsModal);
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettingsModal);

    // Zavřít kliknutím mimo modal
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeSettingsModal();
    });

    // RAM slider sync
    const ramSlider = document.getElementById('ramSlider');
    const ramInput = document.getElementById('ramInput');

    ramSlider.oninput = () => {
        ramInput.value = ramSlider.value;
    };
    ramInput.oninput = () => {
        let v = Number(ramInput.value);
        if (isNaN(v) || v < Number(ramInput.min)) v = Number(ramInput.min);
        if (v > Number(ramInput.max)) v = Number(ramInput.max);
        ramInput.value = v;
        ramSlider.value = v;
    };
}

// Add Modpack Modal
function openAddModpackModal() {
    const modal = document.getElementById('addModpackModal');
    modal.style.display = 'flex';
    document.getElementById('customModpackId').value = '';
    setupAddModpackListeners();
}

function closeAddModpackModal() {
    document.getElementById('addModpackModal').style.display = 'none';
}

function setupAddModpackListeners() {
    const closeBtn = document.getElementById('closeAddModpackModal');
    const cancelBtn = document.getElementById('cancelAddModpackBtn');
    const confirmBtn = document.getElementById('addModpackConfirmBtn');
    const modal = document.getElementById('addModpackModal');

    closeBtn.replaceWith(closeBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    confirmBtn.replaceWith(confirmBtn.cloneNode(true));

    document.getElementById('closeAddModpackModal').addEventListener('click', closeAddModpackModal);
    document.getElementById('cancelAddModpackBtn').addEventListener('click', closeAddModpackModal);
    document.getElementById('addModpackConfirmBtn').addEventListener('click', addCustomModpack);

    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeAddModpackModal();
    });
}

async function addCustomModpack() {
    const idInput = document.getElementById('customModpackId');
    const modpackId = idInput.value.trim();

    if (!modpackId || isNaN(modpackId)) {
        showToast('❌ Zadej platné Project ID (číslo)');
        return;
    }

    try {
        // Ověřit, že modpack existuje
        showToast('🔍 Ověřuji modpack...');
        const modpack = await curseforge.getModpack(modpackId);

        // Uložit do seznamu
        saveCustomModpack(modpackId, modpack.name);

        // Přidat do UI
        addModpackToList(modpackId, modpack.name, modpack.logo?.url);

        closeAddModpackModal();
        showToast(`✅ Modpack "${modpack.name}" přidán!`);
    } catch (error) {
        console.error('[LAUNCHER] Chyba při přidávání modpacku:', error);
        showToast('❌ Modpack nenalezen nebo chyba API');
    }
}

function saveCustomModpack(id, name) {
    const configPath = path.join(os.homedir(), '.void-craft-launcher', 'custom-modpacks.json');
    let modpacks = [];

    if (fs.existsSync(configPath)) {
        try {
            modpacks = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } catch (e) { }
    }

    // Nekontrolovat duplicity
    if (!modpacks.find(m => m.id === id)) {
        modpacks.push({ id, name });
        fs.writeFileSync(configPath, JSON.stringify(modpacks, null, 2));
    }
}

function loadCustomModpacks() {
    const configPath = path.join(os.homedir(), '.void-craft-launcher', 'custom-modpacks.json');

    if (fs.existsSync(configPath)) {
        try {
            const modpacks = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            modpacks.forEach(async (mp) => {
                try {
                    const modpack = await curseforge.getModpack(mp.id);
                    addModpackToList(mp.id, modpack.name, modpack.logo?.url, true);
                } catch (e) {
                    addModpackToList(mp.id, mp.name || `Modpack ${mp.id}`, null, true);
                }
            });
        } catch (e) {
            console.error('[LAUNCHER] Chyba při načítání custom modpacků:', e);
        }
    }
}

function addModpackToList(id, name, logoUrl, isCustom = false) {
    const list = document.getElementById('modpackList');

    // Kontrola duplicit
    if (list.querySelector(`[data-id="${id}"]`)) return;

    const item = document.createElement('div');
    item.className = 'modpack-item';
    item.dataset.id = id;
    item.innerHTML = `
        <div class="modpack-icon">${logoUrl ? `<img src="${logoUrl}" style="width: 40px; height: 40px; border-radius: 6px; object-fit: cover;">` : '📦'}</div>
        <div class="modpack-info">
            <div class="modpack-name">${name}</div>
            <div class="modpack-version">Klikni pro výběr</div>
        </div>
        ${isCustom ? '<button class="btn-remove-modpack" title="Odebrat">✕</button>' : ''}
    `;

    list.appendChild(item);
    setupModpackListeners();
}

function removeCustomModpack(id) {
    const registryPath = path.join(os.homedir(), '.void-craft-launcher', 'installed-modpacks.json');
    const configPath = path.join(os.homedir(), '.void-craft-launcher', 'custom-modpacks.json');

    // Zkontrolovat jestli je nainstalovaný
    let folderName = null;
    let isInstalled = false;
    if (fs.existsSync(registryPath)) {
        try {
            const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            if (registry[String(id)]) {
                folderName = registry[String(id)].folderName;
                isInstalled = true;
            }
        } catch (e) { }
    }

    // Zobrazit potvrzení podle stavu
    const message = isInstalled
        ? 'Opravdu chceš odebrat tento modpack?\n\nBudou smazány i všechny soubory modpacku (mody, config, světy...)!'
        : 'Opravdu chceš odebrat tento modpack ze seznamu?';

    if (!confirm(message)) {
        return;
    }

    // Smazat z registru a složku pokud existuje
    if (isInstalled && folderName) {
        try {
            const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
            delete registry[String(id)];
            fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
        } catch (e) { }

        const modpackDir = path.join(os.homedir(), '.void-craft-launcher', 'modpacks', folderName);
        if (fs.existsSync(modpackDir)) {
            try {
                fs.rmSync(modpackDir, { recursive: true, force: true });
                console.log('[LAUNCHER] Smazána složka modpacku:', modpackDir);
            } catch (e) {
                console.error('[LAUNCHER] Chyba při mazání složky:', e);
            }
        }
    }

    // Odebrat z custom-modpacks.json
    if (fs.existsSync(configPath)) {
        try {
            let modpacks = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            modpacks = modpacks.filter(m => m.id !== id);
            fs.writeFileSync(configPath, JSON.stringify(modpacks, null, 2));
        } catch (e) { }
    }

    // Odebrat z UI
    const item = document.querySelector(`.modpack-item[data-id="${id}"]`);
    if (item) item.remove();

    showToast(isInstalled ? '🗑️ Modpack a jeho soubory smazány' : '🗑️ Modpack odebrán ze seznamu');
}

function setupModpackListeners() {
    document.querySelectorAll('.modpack-item').forEach(item => {
        item.onclick = (e) => {
            if (e.target.classList.contains('btn-remove-modpack')) {
                removeCustomModpack(item.dataset.id);
                return;
            }

            document.querySelectorAll('.modpack-item').forEach(i => i.classList.remove('active'));
            item.classList.add('active');
            selectedModpack = item.dataset.id;
        };
    });
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
            const result = await modpackInstaller.installModpack(selectedModpack, (progress, text) => {
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
            manifest = result.manifest;
            console.log('[LAUNCHER] Modpack úspěšně nainstalován');
        } else {
            console.log('[LAUNCHER] Modpack nainstalován, kontroluji aktualizace...');
            updateProgress(5, '🔄 Kontroluji aktualizace modpacku...');

            // Vždy při spuštění zkontrolovat, zda není nová verze modpacku
            const updateResult = await modpackInstaller.checkForModpackUpdate(selectedModpack, (progress, text) => {
                console.log(`[LAUNCHER] Aktualizace: ${progress}% - ${text}`);
                let displayText = text;
                if (text.includes('Kontroluji')) displayText = '🔍 ' + text;
                else if (text.includes('Stahování') || text.includes('Stahuji')) displayText = '⬇️ ' + text;
                else if (text.includes('Rozbaluji')) displayText = '📦 ' + text;
                else if (text.includes('Aktualizuji')) displayText = '🔄 ' + text;
                else if (text.includes('Mod')) displayText = '🔧 ' + text;
                updateProgress(Math.round(progress * 0.5), displayText);
            });

            if (updateResult.needsUpdate) {
                console.log('[LAUNCHER] Modpack byl aktualizován na novou verzi');
                manifest = updateResult.manifest;
            } else {
                // Načíst manifest z modpack složky
                const manifestPath = require('path').join(
                    modpackInstaller.currentModpackDir,
                    'modpack-manifest.json'
                );
                if (require('fs').existsSync(manifestPath)) {
                    manifest = JSON.parse(require('fs').readFileSync(manifestPath, 'utf8'));
                }
                console.log('[LAUNCHER] Modpack je aktuální, používám stávající manifest');
            }
        }

        // Spuštění Minecraftu
        const mcVersion = manifest?.minecraft?.version || '1.20.1';
        console.log('[LAUNCHER] Minecraft verze:', mcVersion);
        console.log('[LAUNCHER] Spouštím Minecraft launcher...');

        // Nastavit modpack složku pro minecraft launcher
        const modpackDir = modpackInstaller.currentModpackDir;
        console.log('[LAUNCHER] Modpack složka:', modpackDir);
        minecraftLauncher.setModpackDir(modpackDir);

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

        const result = await modpackInstaller.installModpack(modpackId, (progress, text) => {
            console.log(`[LAUNCHER] Instalace: ${progress}% - ${text}`);
            let displayText = text;
            if (text.includes('Načítám')) displayText = '🔍 ' + text;
            else if (text.includes('Stahování') || text.includes('Stahuji')) displayText = '⬇️ ' + text;
            else if (text.includes('Rozbaluji')) displayText = '📦 ' + text;
            else if (text.includes('Mod')) displayText = '🔧 ' + text;
            else if (text.includes('Hotovo') || text.includes('dokončena')) displayText = '✅ ' + text;
            updateProgress(progress, displayText);
        });

        modpackInstaller.markAsInstalled(modpackId, result.manifest, result.fileId);
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
