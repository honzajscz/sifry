// Dešifrovací metody převzaté z aplikace Šifry (cz.absolutno.sifry) a několik dalších.
// Každý generátor vrací pole kandidátů {cat, method, detail, text}.
// "text" je vždy velkými písmeny bez diakritiky (nepísmenné znaky mohou zůstat).

import { canon } from './model.js';

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const chr = (c) => ABC[c];
const mod = (x, m = 26) => ((x % m) + m) % m;
const isL = (ch) => ch >= 'A' && ch <= 'Z';

/** Písmena bez ostatních znaků. */
export const lettersOnly = (t) => t.replace(/[^A-Z]/g, '');

/** Aplikuje f(kód, pořadí písmene) na písmena, ostatní znaky ponechá. */
function mapLetters(text, f) {
  let out = '';
  let k = 0;
  for (const ch of text) out += isL(ch) ? chr(mod(f(ch.charCodeAt(0) - 65, k++))) : ch;
  return out;
}

// ---------------------------------------------------------------- substituce

export function caesar(text) {
  const out = [];
  for (let k = 1; k < 26; k++)
    out.push({ cat: 'Substituce', method: 'Caesar', detail: `posun o ${k} (A→${chr(k)}, zpět o ${26 - k})`, text: mapLetters(text, (c) => c + k), cost: 1 });
  return out;
}

export function atbash(text) {
  const out = [];
  // AtbashAdapter: (cnt - 1 - ord + cnt - position) % cnt
  for (let k = 0; k < 26; k++)
    out.push({
      cat: 'Substituce', method: 'Atbaš', detail: k ? `obrácená abeceda s posunem ${k}` : 'obrácená abeceda (A↔Z)',
      text: mapLetters(text, (c) => 25 - c + 26 - k), cost: k ? 2 : 1,
    });
  return out;
}

export function affine(text) {
  const out = [];
  for (const a of [3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25])
    for (let k = 0; k < 26; k++)
      out.push({ cat: 'Substituce', method: 'Afinní', detail: `×${a} +${k}`, text: mapLetters(text, (c) => c * a + k), cost: 3 });
  return out;
}

const POZICE = ['A(n) + n (od 1)', 'A(n) − n (od 1)', 'n − A(n) (od 1)', 'A(n) + n (od 0)', 'A(n) − n (od 0)', 'n − A(n) (od 0)', '2A(n) − n', '2n − A(n)'];
export function pozice(text) {
  const f = [
    (a, i) => a + i + 1, (a, i) => a - i - 1, (a, i) => i - a - 1,
    (a, i) => a + i, (a, i) => a - i, (a, i) => i - a,
    (a, i) => 2 * a - i, (a, i) => 2 * i - a,
  ];
  return f.map((fn, p) => ({
    cat: 'Substituce', method: 'Podle polohy písmene', detail: POZICE[p],
    text: mapLetters(text, (a, i) => fn(a, i % 26)), cost: 2,
  }));
}

const AUTOKEY = [
  'A(n) + A(n−1) (od 1)', 'A(n) − A(n−1) (od 1)', 'A(n−1) − A(n) (od 1)',
  'A(n) + A(n−1) (od 0)', 'A(n) − A(n−1) (od 0)', 'A(n−1) − A(n) (od 0)',
  'A(n) + V(n−1) (od 1)', 'A(n) − V(n−1) (od 1)', 'V(n−1) − A(n) (od 1)',
  'A(n) + V(n−1) (od 0)', 'A(n) − V(n−1) (od 0)', 'V(n−1) − A(n) (od 0)',
  '2A(n) − A(n−1)',
];
/** Port AutokeyAdapter.getItem. */
export function autokey(text) {
  const out = [];
  for (let pos = 0; pos < 13; pos++) {
    const plus1 = [0, 1, 2, 6, 7, 8].includes(pos);
    const prev = [0, 1, 2, 3, 4, 5, 12].includes(pos);
    const run = [6, 7, 8, 9, 10, 11].includes(pos);
    let l = 0, r = 0, first = true, dst = '';
    for (const ch of text) {
      if (!isL(ch)) { dst += ch; continue; }
      let o = ch.charCodeAt(0) - 65;
      if (plus1) o++;
      if (prev) { r = l; l = o; }
      if (!first) {
        if (pos === 12) o = 2 * o - r;
        else if (pos % 3 === 0) o += r;
        else if (pos % 3 === 1) o -= r;
        else o = r - o;
      }
      o = mod(o);
      if (run) r = o;
      if (plus1) o--;
      if (o === -1) o = 25;
      dst += chr(o);
      first = false;
    }
    out.push({ cat: 'Substituce', method: 'Autokey (pomocí sebe sama)', detail: AUTOKEY[pos], text: dst, cost: 2 });
  }
  return out;
}

const HESLO = [
  'A(n) + B(n) (od 1)', 'A(n) − B(n) (od 1)', 'B(n) − A(n) (od 1)',
  'A(n) + B(n) (od 0)', 'A(n) − B(n) (od 0)', 'B(n) − A(n) (od 0)',
  'A(n) + [BA](n) (od 1)', 'A(n) − [BA](n) (od 1)', '[BA](n) − A(n) (od 1)',
  'A(n) + [BA](n) (od 0)', 'A(n) − [BA](n) (od 0)', '[BA](n) − A(n) (od 0)',
  'A(n) + [BV](n) (od 1)', 'A(n) − [BV](n) (od 1)', '[BV](n) − A(n) (od 1)',
  'A(n) + [BV](n) (od 0)', 'A(n) − [BV](n) (od 0)', '[BV](n) − A(n) (od 0)',
  '2A(n) − B(n)', '2B(n) − A(n)',
];
/** Port HesloAdapter.getItem: Vigenère a příbuzné se zadaným heslem. */
export function heslo(text, key) {
  const k = lettersOnly(canon(key));
  if (!k) return [];
  const proc = lettersOnly(text);
  const out = [];
  for (let pos = 0; pos < 20; pos++) {
    let src = k, si = 0, sv = '', dst = '';
    for (const ch of text) {
      if (!isL(ch)) { dst += ch; continue; }
      const oa = ch.charCodeAt(0) - 65;
      if (si >= src.length) {
        if (pos >= 6 && pos < 12) src = proc;
        else if (pos >= 12 && pos < 18) { src = sv; sv = ''; }
        si = 0;
      }
      const ob = src.charCodeAt(si++) - 65;
      const grp = pos < 18 ? pos % 6 : -1;
      let c;
      if (grp === 0) c = oa + ob + 1;
      else if (grp === 1) c = oa - ob - 1;
      else if (grp === 2) c = ob - oa - 1;
      else if (grp === 3) c = oa + ob;
      else if (grp === 4) c = oa - ob;
      else if (grp === 5) c = ob - oa;
      else if (pos === 18) c = 2 * oa - ob;
      else c = 2 * ob - oa;
      c = mod(c);
      dst += chr(c);
      sv += chr(c);
    }
    out.push({ cat: 'Substituce', method: 'S heslem (Vigenère apod.)', detail: `${HESLO[pos]}, heslo ${k}`, text: dst, cost: 1 });
  }
  return out;
}

/** Port KlicAdapter: monoalfabetická substituce s klíčovým slovem. */
export function klic(text, key) {
  const k = lettersOnly(canon(key));
  if (!k) return [];
  const out = [];
  const names = ['zbytek A-Z', 'zbytek Z-A', 'zbytek od posledního písmene'];
  for (let fill = 0; fill < 3; fill++) {
    const tab = [];
    let last = 0;
    for (const ch of k) {
      const o = ch.charCodeAt(0) - 65;
      if (!tab.includes(o)) tab.push(o);
      last = o;
    }
    for (let i = 0; i < 26; i++) {
      const o = fill === 0 ? i : fill === 1 ? 25 - i : (last + i) % 26;
      if (!tab.includes(o)) tab.push(o);
    }
    const inv = [];
    tab.forEach((v, i) => (inv[v] = i));
    out.push({ cat: 'Substituce', method: 'Monoalfabetická s klíčem', detail: `klíč ${k}, ${names[fill]}, dešifrování`, text: mapLetters(text, (c) => inv[c]), cost: 1 });
    out.push({ cat: 'Substituce', method: 'Monoalfabetická s klíčem', detail: `klíč ${k}, ${names[fill]}, zašifrování`, text: mapLetters(text, (c) => tab[c]), cost: 2 });
  }
  return out;
}

// ---------------------------------------------------------------- transpozice

export function transpositions(text) {
  const s = lettersOnly(text);
  const n = s.length;
  const out = [];
  if (n < 4) return out;
  const T = (method, detail, t, cost = 2) => out.push({ cat: 'Transpozice', method, detail, text: t, cost });

  T('Pozpátku', 'celý text odzadu', [...s].reverse().join(''), 1);
  if (/\s/.test(text.trim())) {
    T('Pozpátku', 'každé slovo zvlášť', text.split(/(\s+)/).map((w) => [...w].reverse().join('')).join(''), 2);
  }
  // prohození dvojic
  let sw = '';
  for (let i = 0; i < n; i += 2) sw += (s[i + 1] || '') + s[i];
  T('Prohození dvojic', 'AB CD → BA DC', sw);

  // obdélník: text zapsaný po řádcích šířky w, čtený po sloupcích, a naopak
  const maxW = Math.min(n - 1, 30);
  for (let w = 2; w <= maxW; w++) {
    const h = Math.ceil(n / w);
    if (h < 2) continue;
    let byCols = '';
    for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) if (r * w + c < n) byCols += s[r * w + c];
    T('Obdélník', `zapsáno po řádcích délky ${w}, čteno po sloupcích`, byCols);
    // zapsáno po sloupcích výšky w, čteno po řádcích (inverze předchozího)
    const res = new Array(n);
    let k = 0;
    for (let c = 0; c < w && k < n; c++) for (let r = 0; r < h; r++) if (r * w + c < n) res[r * w + c] = s[k++];
    T('Obdélník', `zapsáno po sloupcích (${w} sloupců), čteno po řádcích`, res.join(''));
    // hadovitě
    let snake = '';
    for (let r = 0; r < h; r++) {
      const row = s.slice(r * w, r * w + w);
      snake += r % 2 ? [...row].reverse().join('') : row;
    }
    T('Obdélník', `hadovitě po řádcích délky ${w}`, snake, 3);
    let snakeCols = '';
    for (let c = 0; c < w; c++) {
      const col = [];
      for (let r = 0; r < h; r++) if (r * w + c < n) col.push(s[r * w + c]);
      snakeCols += (c % 2 ? col.reverse() : col).join('');
    }
    T('Obdélník', `řádky délky ${w}, sloupce čtené hadovitě`, snakeCols, 3);
  }

  // plot (rail fence)
  for (let rails = 2; rails <= Math.min(10, n - 1); rails++) {
    const pattern = [];
    let r = 0, d = 1;
    for (let i = 0; i < n; i++) {
      pattern.push(r);
      if (r === 0) d = 1; else if (r === rails - 1) d = -1;
      r += d;
    }
    const order = [...pattern.keys()].sort((a, b) => pattern[a] - pattern[b] || a - b);
    const res = new Array(n);
    order.forEach((pos, i) => (res[pos] = s[i]));
    T('Plot (rail fence)', `${rails} řádky`, res.join(''));
  }
  return out;
}

// ---------------------------------------------------------------- Morseovka

export const MORSE = {
  '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E', '..-.': 'F', '--.': 'G', '....': 'H',
  '..': 'I', '.---': 'J', '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O', '.--.': 'P',
  '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T', '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X',
  '-.--': 'Y', '--..': 'Z', '----': 'CH',
  '-----': '0', '.----': '1', '..---': '2', '...--': '3', '....-': '4', '.....': '5', '-....': '6',
  '--...': '7', '---..': '8', '----.': '9',
};

/** Dekóduje morseovku se značkami "." a "-"; písmena oddělená mezerou, slova "/" nebo "|". */
export function morseDecode(s) {
  const words = s.trim().split(/\s*[\/|]\s*|\s{3,}/).filter(Boolean);
  let bad = 0, total = 0;
  const text = words.map((w) => w.split(/\s+/).map((code) => {
    total++;
    const ch = MORSE[code];
    if (!ch) { bad++; return '?'; }
    return ch;
  }).join('')).join(' ');
  return { text, bad, total };
}

// ---------------------------------------------------------------- Baconova šifra

const BACON24 = 'ABCDEFGHIKLMNOPQRSTUWXYZ'; // I=J, U=V

export function bacon(bits, label) {
  const out = [];
  const groups = bits.match(/.{5}/g) || [];
  if (!groups.length) return out;
  const vals = groups.map((g) => parseInt(g, 2));
  out.push({ cat: 'Binární', method: 'Baconova šifra', detail: `26 písmen, ${label}`, text: vals.map((v) => (v < 26 ? chr(v) : '?')).join(''), cost: 1 });
  out.push({ cat: 'Binární', method: 'Baconova šifra', detail: `24 písmen (I=J, U=V), ${label}`, text: vals.map((v) => (v < 24 ? BACON24[v] : '?')).join(''), cost: 1 });
  return out;
}

// ---------------------------------------------------------------- čísla

const ABC_CH = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'CH', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

/** Převod pole čísel na písmena různými způsoby (CislaDFragment: Čísla 1-N, 0-N, modulo, ASCII). */
export function numbersToLetters(vals, label) {
  const out = [];
  const conv = (f) => {
    let bad = 0;
    const t = vals.map((v) => { const r = f(v); if (r == null) { bad++; return '?'; } return r; }).join('');
    return { t, bad };
  };
  const add = (method, detail, f, cost = 1) => {
    const { t, bad } = conv(f);
    if (bad <= vals.length * 0.15) out.push({ cat: 'Čísla', method, detail: `${detail}${label ? ', ' + label : ''}`, text: t, cost: cost + bad });
  };
  add('Pořadí v abecedě', 'A=1 … Z=26', (v) => (v >= 1 && v <= 26 ? chr(v - 1) : v === 0 ? ' ' : null));
  add('Pořadí v abecedě', 'A=0 … Z=25', (v) => (v >= 0 && v <= 25 ? chr(v) : null));
  add('Pořadí v abecedě', 'abeceda s CH, A=1 … Z=27', (v) => (v >= 1 && v <= 27 ? ABC_CH[v - 1] : null), 2);
  add('Pořadí v abecedě', 'modulo 26 (od 1)', (v) => (v >= 0 ? chr(mod(v - 1)) : null), 3);
  add('Pořadí v abecedě', 'modulo 26 (od 0)', (v) => (v >= 0 ? chr(mod(v)) : null), 3);
  add('ASCII', 'kódy znaků', (v) => (v >= 32 && v < 127 ? canon(String.fromCharCode(v)) : null));
  return out;
}

export function parseRoman(s) {
  if (!/^M*(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(s)) return -1;
  const val = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let v = 0;
  for (let i = 0; i < s.length; i++) {
    const a = val[s[i]], b = val[s[i + 1]] || 0;
    v += a < b ? -a : a;
  }
  return v;
}

/** CislaConv.parsePerm: permutace ABCD → číslo 1..24. */
export function parsePerm(s, inverse) {
  if (s.length !== 4 || ![...'ABCD'].every((x) => s.includes(x))) return -1;
  let a, b, c, d;
  if (!inverse) [a, b, c, d] = [...s].map((x) => x.charCodeAt(0) - 65);
  else [a, b, c, d] = [...'ABCD'].map((x) => s.indexOf(x));
  let v = a * 6;
  if (b > a) b--;
  v += b * 2;
  if (c > d) v++;
  return v + 1;
}
const ABC_NO_QW = 'ABCDEFGHIJKLMNOPRSTUVXYZ';
export function permToLetter(v) { return v >= 1 && v <= 24 ? ABC_NO_QW[v - 1] : '?'; }

// ---------------------------------------------------------------- tabulky

/** Polybiův čtverec 5×5 bez jednoho písmene (TabulkyDFragment, CtverecView). */
export function polybius(pairs, label = '') {
  const out = [];
  const variants = [['Q', 'bez Q'], ['W', 'bez W'], ['X', 'bez X'], ['J', 'I=J']];
  for (const [miss, name] of variants) {
    const grid = ABC.replace(miss, '');
    for (const swap of [false, true]) {
      let bad = 0;
      const t = pairs.map(([x, y]) => {
        const [r, c] = swap ? [y, x] : [x, y];
        if (r < 1 || r > 5 || c < 1 || c > 5) { bad++; return '?'; }
        return grid[(r - 1) * 5 + (c - 1)];
      }).join('');
      if (bad <= pairs.length * 0.1)
        out.push({ cat: 'Tabulky', method: 'Polybiův čtverec', detail: `${name}, ${swap ? 'sloupec-řádek' : 'řádek-sloupec'}${label}`, text: t, cost: miss === 'Q' && !swap ? 1 : 2 });
    }
  }
  return out;
}

/** Velký polský kříž: index = y*9 + x*3 + tečka (PolskyKlasView). */
export function polishCross(triples, label = '') {
  const out = [];
  const perms = [[0, 1, 2], [1, 0, 2], [0, 2, 1], [2, 0, 1], [1, 2, 0], [2, 1, 0]];
  const names = ['X, Y, tečka', 'Y, X, tečka', 'X, tečka, Y', 'tečka, X, Y', 'Y, tečka, X', 'tečka, Y, X'];
  for (const withCh of [true, false]) {
    const abc = withCh ? ABC_CH : [...ABC, '?'];
    perms.forEach((p, pi) => {
      let bad = 0;
      const t = triples.map((tr) => {
        const x = tr[p[0]], y = tr[p[1]], dot = tr[p[2]];
        if ([x, y, dot].some((v) => v < 1 || v > 3)) { bad++; return '?'; }
        return abc[(y - 1) * 9 + (x - 1) * 3 + (dot - 1)];
      }).join('');
      if (bad <= triples.length * 0.1)
        out.push({ cat: 'Tabulky', method: 'Velký polský kříž', detail: `${names[pi]}, ${withCh ? 's CH' : 'bez CH'}${label}`, text: t, cost: pi === 0 ? 1 : 2 });
    });
  }
  return out;
}

/** Velký polský kříž zadaný jako (políčko 1-9, pozice 1-3). */
export function polishCellPos(pairs, label = '') {
  const out = [];
  for (const withCh of [true, false]) {
    const abc = withCh ? ABC_CH : [...ABC, '?'];
    for (const swap of [false, true]) {
      let bad = 0;
      const t = pairs.map(([a, b]) => {
        const [cell, pos] = swap ? [b, a] : [a, b];
        if (cell < 1 || cell > 9 || pos < 1 || pos > 3) { bad++; return '?'; }
        return abc[(cell - 1) * 3 + pos - 1];
      }).join('');
      if (bad <= pairs.length * 0.1)
        out.push({ cat: 'Tabulky', method: 'Velký polský kříž', detail: `${swap ? 'pozice, políčko' : 'políčko 1-9, pozice 1-3'}, ${withCh ? 's CH' : 'bez CH'}${label}`, text: t, cost: 1 });
    }
  }
  return out;
}

export const KEYPAD = ['', '', 'ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQRS', 'TUV', 'WXYZ'];

// ---------------------------------------------------------------- Braille

// bit 0 = bod 1 … bit 5 = bod 6 (BrailleDFragment, strings_braille.xml)
export const BRAILLE = {
  1: 'A', 3: 'B', 9: 'C', 25: 'D', 17: 'E', 11: 'F', 27: 'G', 19: 'H', 10: 'I', 26: 'J',
  5: 'K', 7: 'L', 13: 'M', 29: 'N', 21: 'O', 15: 'P', 31: 'Q', 23: 'R', 14: 'S', 30: 'T',
  37: 'U', 39: 'V', 55: 'W', 45: 'X', 61: 'Y', 53: 'Z',
  33: 'Á', 41: 'Č', 57: 'Ď', 28: 'É', 35: 'Ě', 12: 'Í', 43: 'Ň', 42: 'Ó', 58: 'Ř',
  49: 'Š', 51: 'Ť', 44: 'Ú', 62: 'Ů', 47: 'Ý', 46: 'Ž',
};

// ---------------------------------------------------------------- malý polský kříž

/**
 * Port MalyPolskyKrizDecoder. Symboly: #1..#9 (mřížka 3×3 po řádcích), X1..X4
 * (kříž X: nahoře, vlevo, vpravo, dole), tečka "•" za symbolem.
 */
export function malyPolsky(tokens) {
  const parsed = tokens.map((t) => {
    const T = t.toUpperCase();
    const dot = /[•.*]$/.test(T) ? 1 : 0;
    const n = +T[1];
    if (T[0] === '#') return { yq: 0, xq: dot, x: (n - 1) % 3, y: Math.floor((n - 1) / 3) };
    return { yq: 1, xq: dot, x: [0, 1, 0, 1][n - 1], y: [0, 0, 1, 1][n - 1] };
  });
  // X1 nahoře = (0,0), X2 vlevo = (1,0), X3 vpravo = (0,1), X4 dole = (1,1) podle komentáře v aplikaci
  const variants = [
    ['9 - tečka - 4', (p) => (p.yq === 0 ? p.xq * 9 + p.y * 3 + p.x : 18 + p.xq * 4 + p.y * 2 + p.x)],
    ['9 - 4 - tečka', (p) => (p.yq === 0 ? p.xq * 13 + p.y * 3 + p.x : p.xq * 13 + 9 + p.y * 2 + p.x)],
    ['tečka - 9 - 4', (p) => (p.yq === 0 ? p.y * 6 + p.x * 2 + p.xq : 18 + p.y * 4 + p.x * 2 + p.xq)],
  ];
  return variants.map(([name, f], i) => ({
    cat: 'Tabulky', method: 'Malý polský kříž', detail: `pořadí ${name}`,
    text: parsed.map((p) => chr(f(p)) || '?').join(''), cost: i ? 1 : 0,
  }));
}
