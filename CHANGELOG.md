# Changelog

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
