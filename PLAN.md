# Void-Craft.eu Launcher - Plán

## 🎯 Cíl
Minecraft launcher pro server void-craft.eu podporující:
- ✅ Originální Minecraft účty (Microsoft/Mojang)
- ✅ Warez účty (offline režim)
- ✅ Stahování modpacků z CurseForge
- ✅ Webový obsah (70% plochy) + výběr modpacků (30% vlevo)

## 🏗️ Architektura

### Technologie
- **Frontend**: Electron (HTML/CSS/JavaScript)
- **Backend**: Node.js
- **UI Framework**: React nebo čisté HTML/CSS/JS
- **API**: CurseForge API pro modpacky

### Struktura aplikace
```
void-craft.eu-Launcher/
├── src/
│   ├── main/           # Electron main process
│   ├── renderer/       # UI (HTML/CSS/JS)
│   ├── launcher/       # Minecraft launcher logika
│   └── api/            # CurseForge API integrace
├── assets/             # Obrázky, ikony
├── config/             # Konfigurace modpacků
└── package.json
```

## 📋 Implementační kroky

### 1. Základní struktura (Electron app)
- Inicializace Electron projektu
- Základní okno aplikace
- Layout: 30% sidebar (vlevo) + 70% webview (vpravo)

### 2. UI komponenty
- **Sidebar (vlevo 30%)**:
  - Logo serveru
  - Seznam modpacků (scrollable)
  - Tlačítko "Spustit"
  - Výběr účtu (Original/Warez)
  
- **Hlavní oblast (vpravo 70%)**:
  - Webview s obsahem z void-craft.eu
  - Téma: "EXPLORERS OF THE VOID"
  - Novinky, informace o serveru

### 3. Autentizace
- **Original**: Microsoft OAuth 2.0 (nový Minecraft login)
- **Warez**: Lokální offline účet (username only)
- Uložení přihlašovacích údajů

### 4. CurseForge integrace
- API klíč konfigurace
- Stahování modpack manifestů
- Download modů a závislostí
- Instalace do Minecraft složky

### 5. Minecraft launcher
- Stahování Minecraft verze (Vanilla/Forge/Fabric)
- Instalace modloaderu
- Spuštění hry s parametry
- Správa Java runtime

### 6. Konfigurace modpacků
- JSON soubor s definicí modpacků:
  ```json
  {
    "modpacks": [
      {
        "id": "modpack-1",
        "name": "Void Survival",
        "curseforge_id": 123456,
        "version": "1.20.1",
        "icon": "url"
      }
    ]
  }
  ```

### 7. Finální úpravy
- Design (barvy serveru, logo)
- Progress bary pro stahování
- Error handling
- Auto-update launcheru

## 🔧 Potřebné informace od tebe

1. **CurseForge API klíč** - pro stahování modpacků
2. **CurseForge Project IDs** - ID jednotlivých modpacků
3. **Design** - barvy, logo, fonty pro launcher
4. **Webový obsah** - URL nebo HTML obsah pro hlavní sekci
5. **Server IP** - pro automatické připojení po spuštění

## 📦 Výstupy

- Spustitelný launcher (.exe pro Windows)
- Automatická instalace modpacků
- Jednoduchá správa účtů
- Integrace s void-craft.eu obsahem

---

**Další krok**: Začneme s bodem 1 - základní Electron struktura?
