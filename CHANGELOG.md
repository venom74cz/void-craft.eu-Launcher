# Changelog

## [2.4.5] - 2025-12-27

### ⚡ Vylepšení & Opravy

-   **Méně striktní Java:** Launcher nyní akceptuje jakoukoliv validní instalaci Javy verze 21 a vyšší (Oracle, OpenJDK, Corretto atd.). Již není vyžadována specificky distribuce "Temurin". To by mělo vyřešit problémy s instalací Javy pro většinu uživatelů.
-   **Oprava stahování modů:** Implementována kontrola integrity souborů. Launcher nyní kontroluje velikost stažených modů oproti serveru.
    -   Pokud je soubor poškozený (má špatnou velikost, nulovou velikost atd.), je automaticky smazán a stažen znovu.
    -   Toto eliminuje pády hry "těsně po spuštění" způsobené nekompletními soubory.
