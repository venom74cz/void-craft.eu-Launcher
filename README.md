# Void-Craft.eu Launcher

Minecraft launcher pro server **void-craft.eu** s podporou Original i Warez účtů.

## 🚀 Instalace

```bash
# Nainstaluj závislosti
npm install

# Spusť launcher
npm start

# Build pro Windows
npm run build
```

## ✨ Funkce

- ✅ Podpora Original (Microsoft) i Warez (offline) účtů
- ✅ Automatické stahování modpacků z CurseForge
- ✅ Integrovaný webview s void-craft.eu obsahem
- ✅ Moderní UI s fialovým designem
- ✅ Progress bar pro stahování
- ✅ Automatické ukládání přihlášení
- ✅ Java auto-detection a instalace
- ✅ Forge/Fabric loader podpora
- ✅ Auto-update systém
- ✅ Nastavení (RAM, rozlišení, Java)

## 📦 Struktura

```
void-craft.eu-Launcher/
├── src/
│   ├── main/           # Electron main process
│   ├── renderer/       # UI (HTML/CSS/JS)
│   ├── launcher/       # Minecraft launcher logika
│   └── api/            # CurseForge API
├── assets/             # Ikony a obrázky
├── config/             # Konfigurace modpacků
└── package.json
```

## 🔧 Konfigurace

### CurseForge API
- API klíč: `$2a$10$u61J7NMsbxMK38t0PNiwo.qOQt.vu7zUS1u.l0U8Cz4aFLnCv8DNa`
- Modpack ID: `1221931`

### Modpacky
Upravit v `config/modpacks.json`

## 📝 Implementováno (100% FUNKČNÍ)

- [x] Microsoft OAuth přihlášení (Original účty)
- [x] Warez (offline) přihlášení
- [x] Minecraft launcher core integrace
- [x] Automatické stahování modpacků z CurseForge
- [x] Instalace modů
- [x] Progress tracking
- [x] Ukládání přihlášení
- [x] Java runtime auto-detection/instalace
- [x] Forge/Fabric loader automatická instalace
- [x] Auto-update launcheru
- [x] Error handling a logování
- [x] Nastavení (RAM, rozlišení, Java cesta)
- [x] User-friendly chybové hlášky

## 🔧 Možná rozšíření

- [ ] Více modpacků (přidat do config/modpacks.json)
- [ ] Skin manager
- [ ] Server status monitor
- [ ] Screenshot galerie

## 🎨 Design

Design inspirovaný void-craft.eu:
- Barvy: Fialová (#7c3aed, #a78bfa)
- Tmavé pozadí (#0a0a0a, #1a1a2e)
- Moderní gradient efekty

## ⚡ Funkce v detailu

### Automatická Java
- Detekuje systémovou Javu
- Automaticky stahuje Java 17 pokud není nalezena
- Možnost ručního nastavení cesty

### Mod Loadery
- Automatická detekce Forge/Fabric z modpacku
- Instalace správné verze loaderu
- Podpora všech Minecraft verzí

### Chybové hlášení
- User-friendly chybové zprávy
- Automatické logování do souborů
- Detailní diagnostika problémů

### Nastavení
- Alokace RAM (2-16 GB)
- Rozlišení okna
- Vlastní Java cesta
- Přístup k logům

## 📄 Licence

MIT
