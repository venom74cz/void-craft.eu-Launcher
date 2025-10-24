const microsoftAuth = require('../launcher/microsoft-auth');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { ipcRenderer } = require('electron');

let selectedType = null;

// Titlebar buttons
const { getCurrentWindow } = require('@electron/remote');
const win = getCurrentWindow();

document.addEventListener('DOMContentLoaded', () => {
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
});

function selectAccountType(type) {
    selectedType = type;
    
    // Skrýt krok 1
    document.getElementById('step1').classList.remove('active');
    
    // Zobrazit příslušný krok 2
    if (type === 'original') {
        document.getElementById('step2-microsoft').classList.add('active');
    } else {
        document.getElementById('step2-warez').classList.add('active');
    }
}

function goBack() {
    // Skrýt všechny kroky
    document.querySelectorAll('.login-step').forEach(step => {
        step.classList.remove('active');
    });
    
    // Zobrazit krok 1
    document.getElementById('step1').classList.add('active');
    selectedType = null;
}

async function loginMicrosoft() {
    const loadingDiv = document.getElementById('microsoft-loading');
    loadingDiv.style.display = 'block';
    
    try {
        const user = await microsoftAuth.login();
        saveAccount(user);
        goToMainApp();
    } catch (error) {
        loadingDiv.style.display = 'none';
        alert('Chyba při přihlášení: ' + error.message);
    }
}

function loginWarez() {
    const username = document.getElementById('warezUsername').value.trim();
    
    if (!username) {
        alert('Zadej prosím uživatelské jméno!');
        return;
    }
    
    if (username.length < 3 || username.length > 16) {
        alert('Uživatelské jméno musí mít 3-16 znaků!');
        return;
    }
    
    const user = {
        type: 'warez',
        username: username,
        uuid: generateOfflineUUID(username)
    };
    
    saveAccount(user);
    goToMainApp();
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

function goToMainApp() {
    window.location.href = 'index.html';
}
