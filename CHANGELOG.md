# Changelog

## [2.5.2] - 2025-12-27
### Fixed
- **Heap Corruption Fix (Exit Code 0xC0000374):** Odstraněny agresivní JVM optimalizace (`UseNUMA`, `UseCriticalJavaThreadPriority`, atd.), které způsobovaly pády hry na moderních grafických kartách při použití Iris/Sodium shaderů. Launcher nyní používá standardní, stabilní nastavení (stejné jako CurseForge).

## [2.5.1] - 2025-12-27
### Fixed
- **Module Conflict Error (ResolutionException):** Opravena kritická chyba při spouštění NeoForge 1.21.1 a novějších, která způsobovala crash hry (konflikt modulů `minecraft` a vanilla verze). Oprava spočívá v tom, že launcher již nepřidává `client.jar` do classpath, pokud je detekován `BootstrapLauncher`.
- **Modpack Installer EPERM:** Opravena chyba `EPERM` při instalaci/aktualizaci modpacku (přesun shaderpacků), kdy instalátor mohl selhat, pokud cílový soubor již existoval. Nyní se cílový soubor bezpečně smaže.
- **Modpack Installer Logging:** Přidáno podrobné logování do `modpack-installer.js`. Všechny akce instalátoru se nyní zapisují do `latest.log`.

## [2.5.0] - 2025-12-27

### ⚡ Critical Stability Update (PrismLauncher Parity)
Tato aktualizace přináší kompletní přepracování spouštěcí logiky podle standardů PrismLauncheru. Cílem je odstranit crashe a nekompatibilitu na různých systémech.

### ✨ Novinky a Opravy
- **Intel Driver Fix (Windows):** Přidán workaround pro známý crash na Intel grafikách (`HeapDumpPath` hack).
- **MacOS Podpora:** Přidán `-XstartOnFirstThread` pro správný běh na Apple Silicon (M1/M2/M3).
- **Oprava Library Rules:** Launcher nyní správně filtruje knihovny podle OS (nepokouší se načítat Linux knihovny na Windows).
- **Architektura Natives:** Opravena detekce 32/64-bit natives knihoven.
- **Client JAR:** Opravena chyba, kdy v classpath mohl chybět samotný soubor hry.
- **Logování chyb:** Launcher nyní upozorní na chybějící soubory v konzoli místo tichého pádu.

### 🔧 Technické Změny
- Synchronizováno s logikou `LaunchTask` z PrismLauncheru.
- Vylepšená detekce `1.19+` Asset Indexů.
- Optimalizované JVM argumenty zůstávají zachovány.

> **Poznámka:** Tato verze by měla vyřešit většinu "náhodných" pádů při startu hry.

## [2.4.20] - 2025-12-27
### Changed
- Oprava Role ID pro Discord notifikace.

## [2.4.19] - 2025-12-27
### Changed
- Oprava notifikace: Použití Role ID s spoiler tagem.

## [2.4.18] - 2025-12-27
### Changed
- Úprava formátu notifikace: ||@VERIFIED|| (spoiler tag).

## [2.4.17] - 2025-12-27
### Changed
- Test funkčnosti Discord notifikací s @VERIFIED tagem.

## [2.4.16] - 2025-12-27
### Changed
- Test funkčnosti Discord notifikací (Role Mention).

## [2.4.15] - 2025-12-27
### Added
- Testovací vydání pro ověření Discord notifikací.

## [2.4.13] - 2025-12-27
### Changed
- Vylepšen vzhled nastavení: Možnost pro vypnutí optimalizací JVM je nyní moderní přepínač (switch) místo obyčejného zaškrtávacího políčka.
- Zajištěno, že optimalizace jsou zapnuté (ON) i v případě, že uživatel nemá vytvořený `settings.json` (čistá instalace).

## [2.4.12] - 2025-12-27
### Added
- Přidána možnost vypnout "Optimalizace JVM" v nastavení launcheru. Toto je doporučeno pouze pro uživatele, kterým hra padá ihned při spuštění kvůli problémům s pamětí nebo specifickým HW. Defaultně je tato možnost ZAPNUTA.

## [2.4.11] - 2025-12-27
### Fixed
- Oprava diagnostického nástroje (tlačítko "Test spuštění"). Nástroj nyní správně hledá soubory hry ve složce modpacku, nikoliv v hlavní složce launcheru, což dříve způsobovalo falešné hlášení o chybějících souborech.

## [2.4.10] - 2025-12-27
### Reverted
- Vrácena změna filrtování knihovny `sponge-mixin`. Ukázalo se, že Sinytra Connector tuto knihovnu vyžaduje ke své funkci, a její smazání způsobilo okamžitý pád (chyba při načítání modů). Detekce `libraries` složky zůstává aktivní.

## [2.4.9] - 2025-12-27
### Fixed
- Oprava detekce chybějících knihoven. Pokud chybí složka `libraries`, launcher nyní automaticky spustí opravnou instalaci.

## [2.4.8] - 2025-12-27
### Fixed
- Oprava pádu hry na Java 21 kvůli nekompatibilní knihovně `sponge-mixin` (verze 0.8.7). Launcher nyní tuto knihovnu ignoruje a nutí hru použít kompatibilní verzi z NeoForge/Sinytra.

## [2.4.7] - 2025-12-27

### ⚡ Vylepšení & Opravy

-   **Prioritizace Javy:** Launcher nyní ignoruje systémovou Javu a manuální nastavení. Vždy používá svou vlastní ověřenou verzi Javy 21 (staženou do `.void-craft-launcher/java`), což zaručuje konzistenci a eliminuje chyby "Class version mismatch".
-   **Oprava knihoven:** Opravena chyba v načítání knihoven modpacku (např. Mixin, Sinytra Connector), které neměly přímou cestu ke stažení v manifestu. Launcher nyní správně sestaví cestu podle Maven koordinátů.

## [2.4.6] - 2025-12-27

### ⚡ Vylepšení & Opravy

-   **Stabilnější spouštění:** Sjednoceny JVM argumenty s CurseForge. Přidány definice cest pro nativní knihovny (`jna`, `lwjgl`, `netty`), což řeší problémy s "DLL not found".
-   **Oprava pádů na Windows:** Odstraněn flag `-XX:+UseLargePages`, který způsoboval pády na systémech bez administrátorského nastavení "Lock pages in memory".
-   **Oprava diagnostiky:** Opravena falešná hláška "Modpack není nainstalován" v diagnostickém testu.

## [2.4.5] - 2025-12-27

### ⚡ Vylepšení & Opravy

-   **Méně striktní Java:** Launcher nyní akceptuje jakoukoliv validní instalaci Javy verze 21 a vyšší (Oracle, OpenJDK, Corretto atd.). Již není vyžadována specificky distribuce "Temurin". To by mělo vyřešit problémy s instalací Javy pro většinu uživatelů.
-   **Oprava stahování modů:** Implementována kontrola integrity souborů. Launcher nyní kontroluje velikost stažených modů oproti serveru.
    -   Pokud je soubor poškozený (má špatnou velikost, nulovou velikost atd.), je automaticky smazán a stažen znovu.
    -   Toto eliminuje pády hry "těsně po spuštění" způsobené nekompletními soubory.
