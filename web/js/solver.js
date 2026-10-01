// Automatický luštitel: rozpozná typ zadání, vyzkouší všechny použitelné metody
// a seřadí výsledky podle české čitelnosti.

import { canon, codesOf } from './model.js';
import * as C from './ciphers.js';

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// ---------------------------------------------------------------- rozbor zadání

/** Popíše vstup: jaké znaky obsahuje a co z toho plyne. */
export function analyze(raw) {
  const s = raw.trim();
  const up = canon(s);
  const letters = (up.match(/[A-Z]/g) || []).length;
  const digits = (s.match(/\d/g) || []).length;
  const morse = (s.match(/[.\-·•\u2212\u2013\u2014_]/g) || []).length;
  const nonSpace = s.replace(/\s/g, '').length || 1;
  const symbols = new Set(s.replace(/[\s\/|,;]/g, ''));
  const hints = [];
  if (morse / nonSpace > 0.8) hints.push('Morseovka');
  if (digits / nonSpace > 0.6) hints.push('čísla');
  if (symbols.size === 2 && !hints.length) hints.push('dva druhy znaků (Morse, Bacon, binárně)');
  if (letters / nonSpace > 0.7) {
    const codes = codesOf(up);
    const ic = indexOfCoincidence(codes);
    hints.push(`písmena (${codes.length}, index koincidence ${ic.toFixed(3)})`);
  }
  return { s, up, letters, digits, morse, symbols, hints };
}

export function indexOfCoincidence(codes) {
  const f = new Array(26).fill(0);
  for (const c of codes) f[c]++;
  const n = codes.length;
  if (n < 2) return 0;
  return f.reduce((a, x) => a + x * (x - 1), 0) / (n * (n - 1));
}

// ---------------------------------------------------------------- dekodéry symbolů

function symbolCandidates(info, model) {
  const out = [];
  const { s, up } = info;

  // Braillovo písmo jako znaky Unicode (⠁⠃⠉…), pořadí bitů je stejné jako v aplikaci
  const br = [...s].filter((ch) => ch >= '\u2800' && ch <= '\u283f');
  if (br.length && br.length >= s.replace(/\s/g, '').length * 0.7) out.push(brailleCells([...s]));

  // Morseovka (běžné značky)
  const m = s.replace(/[·•∙*]/g, '.').replace(/[\u2212\u2013\u2014_]/g, '-');
  if (/^[.\-\s\/|]+$/.test(m) && /[.\-]/.test(m)) {
    addMorse(out, m, model, '');
  }

  // dva druhy znaků: Morse s jinými značkami, Bacon, binárně
  const sym = [...info.symbols];
  if (sym.length === 2) {
    const [a, b] = sym.sort();
    for (const [x, y] of [[a, b], [b, a]]) {
      const label = `${x}=0 ${y}=1`;
      const bits = s.replace(/[\s\/|,;]/g, '').split('').map((ch) => (ch === x ? '0' : '1')).join('');
      if (!(x === '.' || x === '-') || !(y === '.' || y === '-')) {
        const mm = s.split('').map((ch) => (ch === x ? '.' : ch === y ? '-' : ch)).join('');
        addMorse(out, mm, model, ` (${x}=tečka, ${y}=čárka)`);
      }
      const groups = s.trim().split(/[\s\/|,;]+/);
      if (groups.every((g) => g.length === 5) || (!/\s/.test(s.trim()) && bits.length % 5 === 0))
        out.push(...C.bacon(bits, label));
      if (groups.every((g) => g.length === 8) || (!/\s/.test(s.trim()) && bits.length % 8 === 0)) {
        const vals = bits.match(/.{8}/g).map((g) => parseInt(g, 2));
        out.push(...C.numbersToLetters(vals, `binárně po 8 bitech, ${label}`).filter((c) => c.method === 'ASCII'));
      }
      if (!/\s/.test(s.trim()) && bits.length % 5 === 0) {
        const vals = bits.match(/.{5}/g).map((g) => parseInt(g, 2));
        out.push(...C.numbersToLetters(vals, `binárně po 5 bitech, ${label}`).filter((c) => c.method !== 'ASCII'));
      }
    }
  }

  // čísla oddělená čímkoliv
  const tokens = s.match(/[0-9A-Fa-f]+/g) || [];
  const numeric = s.replace(/[\s,.;:\/|\-]/g, '');
  if (/^\d+$/.test(numeric) && numeric.length) {
    const toks = s.match(/\d+/g);
    if (toks.length > 1) numberGroups(out, toks);
    else continuousDigits(out, numeric, model);
  } else if (tokens.length > 1 && tokens.every((t) => /^[0-9A-Fa-f]+$/.test(t)) && s.replace(/[0-9A-Fa-f\s,;\/|]/g, '') === '') {
    // šestnáctková čísla
    const vals = tokens.map((t) => parseInt(t, 16));
    out.push(...C.numbersToLetters(vals, 'šestnáctkově'));
  }

  // římské číslice
  const rom = up.split(/[\s,;\/|.\-]+/).filter(Boolean);
  if (rom.length > 1 && rom.every((t) => /^[IVXLCDM]+$/.test(t))) {
    const vals = rom.map(C.parseRoman);
    if (vals.every((v) => v > 0)) out.push(...C.numbersToLetters(vals, 'římské číslice').filter((c) => c.method !== 'ASCII'));
  }

  // permutace ABCD (CislaDFragment)
  if (rom.length > 1 && rom.every((t) => t.length === 4 && /^[ABCD]{4}$/.test(t))) {
    for (const inv of [false, true]) {
      const t = rom.map((g) => C.permToLetter(C.parsePerm(g, inv))).join('');
      out.push({ cat: 'Čísla', method: 'Permutace ABCD', detail: inv ? 'inverzní' : 'přímá', text: t, cost: 1 });
    }
  }

  // Polybiův čtverec zapsaný písmeny A-E (AA AB …)
  const le = up.replace(/[\s,;\/|]/g, '');
  if (/^[A-E]+$/.test(le) && le.length % 2 === 0 && le.length >= 4 && new Set(le).size > 2) {
    const pairs = le.match(/../g).map((p) => [p.charCodeAt(0) - 64, p.charCodeAt(1) - 64]);
    out.push(...C.polybius(pairs, ', souřadnice písmeny A-E'));
  }
  return out;
}

function addMorse(out, m, model, label) {
  if (/\s|\/|\|/.test(m.trim())) {
    const { text, bad, total } = C.morseDecode(m);
    if (bad <= total * 0.2) {
      out.push({ cat: 'Morse', method: 'Morseovka', detail: 'standardní' + label, text, cost: bad });
      const inv = C.morseDecode(m.replace(/[.\-]/g, (c) => (c === '.' ? '-' : '.')));
      if (inv.bad <= inv.total * 0.2) out.push({ cat: 'Morse', method: 'Morseovka', detail: 'prohozené tečky a čárky' + label, text: inv.text, cost: 2 + inv.bad });
    }
    const rev = C.morseDecode([...m].reverse().join(''));
    if (rev.bad <= rev.total * 0.2) out.push({ cat: 'Morse', method: 'Morseovka', detail: 'čtená pozpátku' + label, text: rev.text, cost: 2 + rev.bad });
  } else {
    // bez oddělovačů: hledáme nejpravděpodobnější rozdělení
    const codes = Object.entries(C.MORSE).filter(([, v]) => /^[A-Z]$/.test(v));
    const t = beamDecode(model, m, (i) => codes.filter(([k]) => m.startsWith(k, i)).map(([k, v]) => [k.length, v]), 256, 1.5);
    if (t) out.push({ cat: 'Morse', method: 'Morseovka', detail: 'bez oddělovačů (jen odhad, bývá nepřesný)' + label, text: t, cost: 3 });
  }
}

function numberGroups(out, toks) {
  // soustavy jako v CislaDFragment
  for (const [base, name] of [[10, ''], [2, 'dvojkově'], [3, 'trojkově'], [8, 'osmičkově'], [16, 'šestnáctkově']]) {
    const re = { 2: /^[01]+$/, 3: /^[012]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i }[base];
    if (!toks.every((t) => re.test(t))) continue;
    if (base === 10 && toks.every((t) => /^[01]+$/.test(t)) && toks.some((t) => t.length > 2)) continue; // spíš binárně
    const vals = toks.map((t) => parseInt(t, base));
    out.push(...C.numbersToLetters(vals, name).map((c) => ({ ...c, cost: c.cost + (base === 10 ? 0 : 1) })));
  }
  const two = toks.every((t) => t.length === 2);
  if (two) {
    const pairs = toks.map((t) => [+t[0], +t[1]]);
    out.push(...C.polybius(pairs));
    out.push(...C.polishCellPos(pairs));
    // klávesnice mobilu: číslice + počet stisků
    if (pairs.every(([k, n]) => k >= 2 && k <= 9 && n >= 1 && n <= C.KEYPAD[k].length))
      out.push({ cat: 'Tabulky', method: 'Klávesnice mobilu', detail: 'klávesa a počet stisků', text: pairs.map(([k, n]) => C.KEYPAD[k][n - 1]).join(''), cost: 1 });
  }
  if (toks.every((t) => t.length === 3 && /^[1-3]+$/.test(t)))
    out.push(...C.polishCross(toks.map((t) => [...t].map(Number))));
  // klávesnice mobilu: opakované stisky (222 = C)
  if (toks.every((t) => /^(\d)\1*$/.test(t) && (t[0] === '0' || (t[0] >= '2' && t.length <= C.KEYPAD[+t[0]].length))))
    out.push({ cat: 'Tabulky', method: 'Klávesnice mobilu', detail: 'opakované stisky (222 = C)', text: toks.map((t) => (t[0] === '0' ? ' ' : C.KEYPAD[+t[0]][t.length - 1])).join(''), cost: 1 });
  // Braillovo písmo zapsané čísly bodů
  if (toks.every((t) => /^[1-6]+$/.test(t) && new Set(t).size === t.length) && toks.some((t) => t.length > 1)) {
    out.push(brailleCells(toks.map((x) => {
      let mask = 0;
      for (const d of x) mask |= 1 << (+d - 1);
      return String.fromCharCode(0x2800 + mask);
    }), 'čísla bodů (1-6)'));
  }
}

/** Dekóduje buňky Braillova písma (znaky U+2800..U+283F), včetně prefixu číslic ⠼. */
function brailleCells(chars, detail = 'znaky ⠁⠃⠉') {
  let t = '', num = false;
  const DIG = { 1: '1', 3: '2', 9: '3', 25: '4', 17: '5', 11: '6', 27: '7', 19: '8', 10: '9', 26: '0' };
  for (const ch of chars) {
    const code = ch.charCodeAt(0);
    if (/\s/.test(ch) || code === 0x2800) { t += ' '; num = false; continue; }
    if (code < 0x2800 || code > 0x283f) { t += ch; continue; }
    const mask = code - 0x2800;
    if (mask === 60) { num = true; continue; }
    if (mask === 32 || mask === 48 || mask === 16) continue; // velké / malé písmo
    if (num && DIG[mask]) { t += DIG[mask]; continue; }
    num = false;
    t += C.BRAILLE[mask] || '?';
  }
  t = t.replace(/ +/g, ' ').trim();
  return { cat: 'Braille', method: 'Braillovo písmo', detail, text: canon(t), cost: (t.match(/\?/g) || []).length };
}

function continuousDigits(out, d, model) {
  if (d.length < 4) {
    out.push(...C.numbersToLetters([+d], ''));
    return;
  }
  if (d.length % 2 === 0) {
    const pairs = d.match(/../g).map((p) => [+p[0], +p[1]]);
    out.push(...C.polybius(pairs, ', bez oddělovačů'));
    out.push(...C.polishCellPos(pairs, ', bez oddělovačů'));
    out.push(...C.numbersToLetters(d.match(/../g).map(Number), 'po dvou číslicích'));
  }
  if (d.length % 3 === 0 && /^[1-3]+$/.test(d))
    out.push(...C.polishCross(d.match(/.../g).map((t) => [...t].map(Number)), ', bez oddělovačů'));
  // A=1..Z=26 bez oddělovačů: rozdělení podle jazykového modelu
  const t = beamDecode(model, d, (i) => {
    const opts = [];
    const a = +d[i];
    if (a >= 1) opts.push([1, ABC[a - 1]]);
    if (i + 1 < d.length && a >= 1) {
      const b = +d.slice(i, i + 2);
      if (b >= 10 && b <= 26) opts.push([2, ABC[b - 1]]);
    }
    return opts;
  });
  if (t) out.push({ cat: 'Čísla', method: 'Pořadí v abecedě', detail: 'A=1 … Z=26 bez oddělovačů (rozdělení odhadnuto)', text: t, cost: 2 });
  // multi-tap bez mezer
  if (/^[2-9]+$/.test(d)) {
    const t2 = beamDecode(model, d, (i) => {
      const k = +d[i];
      const opts = [];
      for (let n = 1; n <= C.KEYPAD[k].length && i + n <= d.length && d[i + n - 1] === d[i]; n++) opts.push([n, C.KEYPAD[k][n - 1]]);
      return opts;
    });
    if (t2) out.push({ cat: 'Tabulky', method: 'Klávesnice mobilu', detail: 'opakované stisky bez mezer (rozdělení odhadnuto)', text: t2, cost: 3 });
  }
}

/**
 * Najde nejpravděpodobnější čtení řetězce, kde na každé pozici může začínat
 * více možných znaků. options(i) vrací [[délka, písmeno], ...].
 */
export function beamDecode(model, str, options, width = 64, offset = 0) {
  const n = str.length;
  // offset > 0 zvýhodní čtení s menším počtem delších znaků
  const czech = model.czech + offset;
  const states = Array.from({ length: n + 1 }, () => new Map());
  states[0].set('', { text: '', score: 0, codes: [] });
  for (let i = 0; i < n; i++) {
    const cur = [...states[i].values()].sort((a, b) => b.score - a.score).slice(0, width);
    if (!cur.length) continue;
    const opts = options(i);
    for (const st of cur) {
      for (const [len, ch] of opts) {
        const code = ch.charCodeAt(0) - 65;
        const codes = st.codes.length >= 3 ? [...st.codes.slice(-3), code] : [...st.codes, code];
        let add = 0;
        if (codes.length === 4) add = model.q[((codes[0] * 26 + codes[1]) * 26 + codes[2]) * 26 + codes[3]] - czech;
        const next = { text: st.text + ch, score: st.score + add, codes };
        const key = codes.join(',');
        const tgt = states[i + len];
        const ex = tgt.get(key);
        if (!ex || ex.score < next.score) tgt.set(key, next);
      }
    }
  }
  const fin = [...states[n].values()].sort((a, b) => b.score - a.score)[0];
  return fin ? fin.text : null;
}

// ---------------------------------------------------------------- lámání bez klíče

/** Vigenère / Beaufort s neznámým heslem: frekvenční analýza sloupců + doladění čtveřicemi. */
export function crackVigenere(model, text) {
  const codes = codesOf(text);
  const n = codes.length;
  if (n < 16) return [];
  const freq = model.meta.letterFreq;
  const results = [];
  for (const beaufort of [false, true]) {
    const dec = (c, k) => (beaufort ? (k - c + 26) % 26 : (c - k + 26) % 26);
    for (let L = 1; L <= Math.min(16, Math.floor(n / 4)); L++) {
      const key = [];
      for (let j = 0; j < L; j++) {
        let best = 0, bestChi = Infinity;
        for (let k = 0; k < 26; k++) {
          const cnt = new Array(26).fill(0);
          let m = 0;
          for (let i = j; i < n; i += L) { cnt[dec(codes[i], k)]++; m++; }
          let chi = 0;
          for (let x = 0; x < 26; x++) { const e = freq[x] * m + 1e-3; chi += (cnt[x] - e) ** 2 / e; }
          if (chi < bestChi) { bestChi = chi; best = k; }
        }
        key.push(best);
      }
      // doladění: každé písmeno hesla zkusíme změnit, pokud to zlepší čitelnost
      const plain = (k) => codes.map((c, i) => dec(c, k[i % L]));
      let fit = model.fitness(plain(key));
      for (let pass = 0; pass < 2; pass++)
        for (let j = 0; j < L; j++)
          for (let k = 0; k < 26; k++) {
            const old = key[j];
            if (k === old) continue;
            key[j] = k;
            const f = model.fitness(plain(key));
            if (f > fit) fit = f; else key[j] = old;
          }
      results.push({ L, key: [...key], fit, beaufort });
    }
  }
  results.sort((a, b) => b.fit - a.fit);
  // kratší heslo má přednost, pokud je skoro stejně dobré (delší násobky jen opakují)
  const picked = [];
  for (const r of results) {
    if (picked.some((p) => p.beaufort === r.beaufort && r.L % p.L === 0)) continue;
    picked.push(r);
    if (picked.length >= 3) break;
  }
  return picked.map((r) => {
    const keyStr = r.key.map((k) => ABC[k]).join('');
    let i = 0;
    const t = text.replace(/[A-Z]/g, (ch) => {
      const c = ch.charCodeAt(0) - 65;
      const k = r.key[i++ % r.L];
      return ABC[r.beaufort ? (k - c + 26) % 26 : (c - k + 26) % 26];
    });
    return {
      cat: 'Substituce', method: r.beaufort ? 'Beaufort (B(n) − A(n))' : 'Vigenère (A(n) − B(n))',
      detail: `odhadnuté heslo ${keyStr} (délka ${r.L})`, text: t, cost: 2, penalty: Math.min(40, (120 * r.L) / n),
    };
  });
}

/** Obecná záměna písmen: horolezecký algoritmus nad čtveřicemi. */
export function crackMono(model, text, timeMs = 1500) {
  const codes = codesOf(text);
  const n = codes.length;
  if (n < 30) return [];
  const t0 = Date.now();
  // start: přiřazení podle četností
  const cnt = new Array(26).fill(0);
  for (const c of codes) cnt[c]++;
  const byCnt = [...Array(26).keys()].sort((a, b) => cnt[b] - cnt[a]);
  const byLang = [...Array(26).keys()].sort((a, b) => model.meta.letterFreq[b] - model.meta.letterFreq[a]);
  const start = new Array(26);
  byCnt.forEach((c, i) => (start[c] = byLang[i]));

  const buf = new Array(n);
  const fitOf = (key) => {
    for (let i = 0; i < n; i++) buf[i] = key[codes[i]];
    return model.fitness(buf);
  };
  let bestKey = start.slice(), bestFit = fitOf(bestKey);
  let rnd = 1;
  const rand = () => ((rnd = (Math.imul(rnd, 48271) >>> 0) % 2147483647) / 2147483647);
  let restarts = 0;
  while (Date.now() - t0 < timeMs) {
    const key = restarts === 0 ? start.slice() : bestKey.slice();
    if (restarts > 0) for (let s = 0; s < 4 + (restarts % 6); s++) {
      const a = (rand() * 26) | 0, b = (rand() * 26) | 0;
      [key[a], key[b]] = [key[b], key[a]];
    }
    let fit = fitOf(key);
    let improved = true;
    while (improved && Date.now() - t0 < timeMs) {
      improved = false;
      for (let a = 0; a < 26; a++)
        for (let b = a + 1; b < 26; b++) {
          [key[a], key[b]] = [key[b], key[a]];
          const f = fitOf(key);
          if (f > fit) { fit = f; improved = true; } else [key[a], key[b]] = [key[b], key[a]];
        }
    }
    if (fit > bestFit) { bestFit = fit; bestKey = key.slice(); }
    restarts++;
  }
  const t = text.replace(/[A-Z]/g, (ch) => ABC[bestKey[ch.charCodeAt(0) - 65]]);
  const used = [...new Set(codes)].sort((a, b) => a - b);
  const map = used.map((c) => `${ABC[c]}→${ABC[bestKey[c]]}`).join(' ');
  return [{ cat: 'Substituce', method: 'Obecná záměna písmen', detail: `odhad frekvenční analýzou: ${map}`, text: t, cost: 4, penalty: Math.min(40, 1500 / n) }];
}

// ---------------------------------------------------------------- hlavní běh

const FAST_TRANSFORMS = (t) => [...C.caesar(t), ...C.atbash(t)];

/**
 * Vrátí seřazené výsledky. opts: {key, heavy (bool), onProgress}
 */
export function solve(model, raw, opts = {}) {
  const info = analyze(raw);
  const cands = [];
  const { up } = info;
  const hasLetters = info.letters / Math.max(1, info.s.replace(/\s/g, '').length) > 0.7;

  // 1) symboly → písmena
  const sym = symbolCandidates(info, model);
  cands.push(...sym);

  // 2) písmenné zadání: všechny substituce a transpozice
  if (hasLetters && info.symbols.size > 2) {
    const t = up.replace(/[^A-Z\s]/g, '').replace(/\s+/g, ' ').trim();
    cands.push({ cat: 'Bez šifry', method: 'Beze změny', detail: 'text tak, jak je', text: t, cost: 0 });
    cands.push(...C.caesar(t), ...C.atbash(t), ...C.affine(t), ...C.pozice(t), ...C.autokey(t));
    const tr = C.transpositions(t);
    cands.push(...tr);
    // pozpátku + posun
    const rev = C.lettersOnly(t).split('').reverse().join('');
    cands.push(...C.caesar(rev).map((c) => ({ ...c, method: 'Pozpátku + Caesar', cost: 3 })));
    if (opts.key) cands.push(...C.heslo(t, opts.key), ...C.klic(t, opts.key));
    if (opts.heavy !== false) {
      cands.push(...crackVigenere(model, t));
      cands.push(...crackMono(model, t, opts.monoMs || 1500));
    }
    // první a poslední písmena slov (akrostich)
    const words = t.split(' ').filter(Boolean);
    if (words.length >= 4) {
      cands.push({ cat: 'Ostatní', method: 'První písmena slov', detail: 'akrostich', text: words.map((w) => w[0]).join(''), cost: 1 });
      cands.push({ cat: 'Ostatní', method: 'Poslední písmena slov', detail: '', text: words.map((w) => w[w.length - 1]).join(''), cost: 2 });
    }
  }

  // 3) rychlé ohodnocení všech, pak řetězení posunů na nejlepší dekódované symboly
  const quick = (c) => {
    c.quick = model.readability(codesOf(c.text));
    return c;
  };
  cands.forEach(quick);
  const symTop = sym.filter((c) => /[A-Z]{3,}/.test(c.text.replace(/\s/g, ''))).sort((a, b) => b.quick - a.quick).slice(0, 4);
  for (const base of symTop) {
    for (const c of FAST_TRANSFORMS(base.text))
      cands.push(quick({ ...c, cat: base.cat, method: `${base.method} → ${c.method}`, detail: `${base.detail}; ${c.detail}`, cost: base.cost + c.cost + 1 }));
    if (opts.key) for (const c of C.heslo(base.text, opts.key))
      cands.push(quick({ ...c, cat: base.cat, method: `${base.method} → ${c.method}`, detail: `${base.detail}; ${c.detail}`, cost: base.cost + c.cost + 1 }));
  }

  // 4) podrobné ohodnocení nejlepších, odstranění duplicit
  cands.sort((a, b) => b.quick - a.quick || a.cost - b.cost);
  const seen = new Map();
  const out = [];
  for (const c of cands.slice(0, 150)) {
    const k = c.text.replace(/\s/g, '');
    if (!k) continue;
    if (seen.has(k)) { seen.get(k).also = (seen.get(k).also || 0) + 1; continue; }
    const r = model.rate(c.text);
    const item = { ...c, ...r, score: r.score - Math.min(c.cost || 0, 6) * 0.4 - (c.penalty || 0) };
    seen.set(k, item);
    out.push(item);
  }
  out.sort((a, b) => b.score - a.score);
  return { info, results: out };
}
