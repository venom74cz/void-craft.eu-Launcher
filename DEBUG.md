# 🐛 Debug - UUID problém

## Jak zkontrolovat UUID:

### 1. Zkontroluj UUID v launcheru:
- Otevři launcher
- Spusť hru
- V CMD okně najdi řádek: `[MINECRAFT] Uživatel: JMENO (original)`
- Launcher by měl vypsat i UUID

### 2. Zkontroluj UUID na serveru:
- Připoj se na server
- Admin spustí: `/whitelist list`
- Nebo zkontroluj `whitelist.json` na serveru

### 3. Zkontroluj oficiální UUID:
- Jdi na: https://mcuuid.net/
- Zadej své Minecraft jméno
- Zkopíruj UUID (s pomlčkami)

## Formát UUID:

**Správný formát (s pomlčkami):**
```
xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Příklad:**
```
069a79f4-44e9-4726-a5be-fca90e38aaf5
```

## Řešení:

Pokud UUID v launcheru **NESEDÍ** s UUID na mcuuid.net:
1. Odhlásit se z launcheru
2. Smazat `C:\Users\TVOJE_JMENO\.void-craft-launcher\account.json`
3. Přihlásit se znovu přes Microsoft

Launcher nyní správně formátuje UUID s pomlčkami!

## Test:

Spusť launcher a zkontroluj v CMD:
```
[MINECRAFT] Uživatel: TvojeJmeno (original)
[MINECRAFT] UUID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

UUID MUSÍ mít pomlčky na správných místech!
