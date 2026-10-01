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

Při změně souborů zvyšte `VERSION` v `sw.js`, aby si nainstalované aplikace stáhly novou verzi.

## Zveřejnění

Workflow `.github/workflows/pages.yml` nasadí složku `web` na GitHub Pages při každé změně
ve větvi `master`. Jednorázově je potřeba v nastavení repozitáře zvolit
**Settings > Pages > Source: GitHub Actions**.

## Licence

Kód je pod GPL 2 jako původní aplikace. Jazykový model vychází z projektu
[FrequencyWords](https://github.com/hermitdave/FrequencyWords) (korpus OpenSubtitles, CC BY-SA 4.0).
