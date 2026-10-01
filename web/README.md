# Luštitel šifer (webová aplikace)

Webová PWA, která k zadané šifře sama vyzkouší všechny použitelné metody z aplikace Šifry
a seřadí výsledky podle toho, jak moc se podobají češtině. Funguje v prohlížeči na počítači
i v mobilu, dá se nainstalovat na plochu a po prvním načtení běží i bez internetu.

## Co umí

* **Rozpozná druh zadání**: písmena, čísla, Morseovka, dva druhy znaků (Morse, Bacon, binárně),
  římské číslice, permutace ABCD, body Braillova písma.
* **Substituce** (z modulu Substituce): Caesar, Atbaš s posuny, afinní, podle polohy písmene,
  Autokey (13 variant), se zadaným heslem všech 20 variant „S heslem“ a monoalfabetická šifra s klíčem.
* **Bez znalosti hesla**: Vigenère a Beaufort (odhad délky a hesla), obecná záměna písmen
  (frekvenční analýza horolezeckým algoritmem).
* **Transpozice**: pozpátku, prohození dvojic, obdélník (po sloupcích, hadovitě), plot.
* **Čísla** (z modulu Čísla): pořadí v abecedě od 1 i od 0, s CH, modulo 26, ASCII,
  soustavy 2, 3, 8, 10 a 16, římské číslice, permutace.
* **Tabulky**: Polybiův čtverec (bez Q, W, X nebo J, obě pořadí souřadnic), velký polský kříž
  (trojice souřadnic i políčko s pozicí), klávesnice mobilu.
* **Braillovo písmo** zapsané čísly bodů včetně české diakritiky.
* Výsledky z dekódování symbolů se navíc zkusí posunout Caesarem a Atbašem
  (např. čísla A=1 posunutá o 5).
* Čísla A=1..26 a Morseovku bez oddělovačů rozdělí podle jazykového modelu.
* **Dva kroky**: transpozice a k tomu Caesar nebo Atbaš, Vigenère s heslem ze slovníku.
* **Semafor** (šipky ↓↙ …) a **malý polský kříž** (#1 až #9, X1 až X4, tečka •).

Další záložky a pomůcky:

* **Zadávání klikáním**: Braille, Morse, semafor, velký a malý polský kříž, námořní vlajky.
* **Slova**: hledání podle vzoru (`p?k?ad`, `*ovna`, `1221`), přesmyčky a regulární výrazy
  jako v modulu Databáze slov. Volitelně nad úplným slovníkem z aplikace (3,6 milionu tvarů),
  který se stáhne až při prvním použití.
* **Záměna**: ruční luštění záměny písmen s tabulkou četností (modul Frekvence),
  s automatickým odhadem jako výchozím bodem.

## Jak hodnotí výsledky

`data/cs-quad.bin` obsahuje logaritmické pravděpodobnosti všech čtveřic písmen,
`data/cs-words.txt` slovník 80 000 nejčastějších tvarů s diakritikou. Skóre kombinuje
čtveřice a pokrytí textu slovníkem; slovník se zároveň používá k rozdělení textu na slova
a k doplnění diakritiky ve výsledku.

Model se dá znovu sestavit z frekvenčního seznamu slov:

```sh
curl -O https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/cs/cs_full.txt
head -400000 cs_full.txt > cs.txt
node web/tools/build-model.mjs cs.txt
```

## Vývoj

Aplikace nemá žádné závislosti ani sestavovací krok. Stačí složku `web` servírovat
libovolným statickým serverem:

```sh
cd web && python3 -m http.server 8000
```

Testy na vzorových šifrách: `node web/tools/test.mjs`.

Úplný slovník pro hledání slov se při nasazení vyrobí ze slovníku aplikace; lokálně:

```sh
zcat spa2/src/main/assets/raw/cs.canon.gz | cut -d: -f1 | uniq | gzip -9 > web/data/cs-full.txt.gz
```

Při změně souborů zvyšte `VERSION` v `sw.js`, aby si nainstalované aplikace stáhly novou verzi.

## Zveřejnění

Workflow `.github/workflows/pages.yml` nasadí složku `web` na GitHub Pages při každé změně
ve větvi `master`. Jednorázově je potřeba v nastavení repozitáře zvolit
**Settings > Pages > Source: GitHub Actions**.

## Licence

Kód je pod GPL 2 jako původní aplikace. Jazykový model vychází z projektu
[FrequencyWords](https://github.com/hermitdave/FrequencyWords) (korpus OpenSubtitles, CC BY-SA 4.0).
