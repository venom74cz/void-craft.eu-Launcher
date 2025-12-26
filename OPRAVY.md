# Opravy - Void-Craft.eu Launcher

## ✅ Opravené problémy

### 1. Java 21 místo Java 17
**Problém:** Launcher stahoval Java 17, ale modpack potřebuje Java 21.

**Oprava:**
- `src/launcher/java-manager.js` - změněna URL pro stahování z Java 17 na Java 21
- Adoptium API endpoint změněn z `/latest/17/` na `/latest/21/`

### 2. Mody se stahují dokola při každém spuštění
**Problém:** Při každém spuštění hry se stahovalo 9 modů znovu, i když už byly nainstalovány.

**Oprava:**
- `src/renderer/renderer.js` - odstraněno zbytečné volání `downloadMods()` při každém spuštění
- Nyní se mody stahují pouze při první instalaci modpacku
- Přidáno logování pro lepší diagnostiku

**Před:**
```javascript
// Kontrolovat a doinstalovat chybějící mody
await modpackInstaller.downloadMods(manifest, ...);
```

**Po:**
```javascript
// Mody se stahují pouze při instalaci, ne při každém spuštění
console.log('[LAUNCHER] Manifest načten, přeskakuji stahování modů (již nainstalováno)');
```

### 3. Resource packy a shadery nejdou do správné složky
**Problém:** Overrides (resourcepacks, shaderpacks, config) se nekopírovaly správně.

**Oprava:**
- `src/launcher/modpack-installer.js` - vylepšena funkce `copyRecursive()`
- Přidáno detailní logování kopírování souborů
- Overrides se nyní správně kopírují včetně všech podsložek:
  - `resourcepacks/` → `.void-craft-launcher/minecraft/resourcepacks/`
  - `shaderpacks/` → `.void-craft-launcher/minecraft/shaderpacks/`
  - `config/` → `.void-craft-launcher/minecraft/config/`

### 4. Lepší error handling pro diagnostiku problémů
**Problém:** Když se MC nespustilo, nebylo jasné proč.

**Oprava:**
- `src/launcher/minecraft-direct.js` - přidáno více logování
- Kontrola existence Java před spuštěním
- Logování RAM nastavení
- Zachycení chyb při spouštění procesu
- Detekce chybových kódů při ukončení

- `src/launcher/error-handler.js` - vylepšené chybové hlášky
- Specifické hlášky pro různé typy chyb
- Odkaz na složku s logy pro diagnostiku

### 5. Oprava kopírování config a options souborů
**Problém:** Při čisté instalaci se nezkopírovaly soubory ze složky `config` a `options.txt`.

**Oprava:**
- `src/launcher/modpack-installer.js` - opravena logika kontroly existence souborů v `copyRecursive()`
- Nyní se správně kontroluje existence konkrétního souboru, ne celé složky
- Umožňuje to správné zkopírování výchozí konfigurace při zachování uživatelských změn

## 🔍 Diagnostika problémů

Pokud se hra nespustí, zkontroluj logy:
- Windows: `C:\Users\<username>\.void-craft-launcher\logs\`
- Logy obsahují detailní informace o spuštění

### Časté problémy a řešení:

1. **Java nenalezena**
   - Launcher automaticky stáhne Java 21
   - Nebo nastav cestu manuálně v nastavení

2. **Chybí soubory hry**
   - Smaž složku `.void-craft-launcher` a spusť znovu
   - Launcher vše stáhne znovu

3. **Nedostatečná RAM**
   - Nastav více RAM v nastavení (doporučeno 6-8 GB)

4. **Minecraft spadne při spuštění**
   - Zkontroluj logy v `.void-craft-launcher/logs/`
   - Může chybět Java 21 nebo jsou poškozené soubory

## 📝 Testování

Pro otestování oprav:
1. Smaž složku `.void-craft-launcher` (čistá instalace)
2. Spusť launcher
3. Přihlaš se
4. Klikni "Spustit hru"
5. Sleduj konzoli - měly by se stáhnout mody pouze jednou
6. Zkontroluj složky:
   - `.void-craft-launcher/minecraft/mods/` - mody
   - `.void-craft-launcher/minecraft/resourcepacks/` - resource packy
   - `.void-craft-launcher/minecraft/shaderpacks/` - shadery
7. Zavři hru a spusť znovu - mody by se neměly stahovat znovu
