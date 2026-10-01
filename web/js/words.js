// Hledání slov ve slovníku podle vzoru, přesmyčky nebo regulárního výrazu
// (obdoba modulu Databáze slov v aplikaci Šifry).

/** Slovník jako jeden řetězec "slovo\n" (malá písmena bez diakritiky), seřazený podle četnosti. */
export class WordList {
  constructor(text, display = null) {
    this.text = text.endsWith('\n') ? text : text + '\n';
    this.display = display; // Map KANON -> tvar s diakritikou
    this.count = 0;
    for (let i = this.text.indexOf('\n'); i >= 0; i = this.text.indexOf('\n', i + 1)) this.count++;
  }

  static fromModel(model) {
    const words = [...model.words.keys()].map((w) => w.toLowerCase());
    const display = new Map();
    for (const [w, v] of model.words) display.set(w.toLowerCase(), v.display);
    return new WordList(words.join('\n'), display);
  }

  show(w) {
    return (this.display && this.display.get(w)) || w;
  }

  /** Vrátí {words, total, truncated}. */
  search(mode, query, { limit = 1500, partial = false } = {}) {
    const q = query.trim();
    if (!q) return { words: [], total: 0 };
    if (mode === 'anagram') return this.anagram(q, limit, partial);
    const re = mode === 'regex' ? buildRegex(q) : buildPattern(q);
    const found = [];
    let total = 0;
    // celý slovník najednou: ^...$ v režimu více řádků
    for (const m of this.text.matchAll(re)) {
      total++;
      if (found.length < limit) found.push(m[0]);
    }
    return { words: found.map((w) => this.show(w)), total, truncated: total > limit };
  }

  anagram(q, limit, partial) {
    const letters = strip(q).replace(/[^a-z?]/g, '');
    const need = new Array(26).fill(0);
    let wild = 0;
    for (const ch of letters) ch === '?' ? wild++ : need[ch.charCodeAt(0) - 97]++;
    const len = letters.length;
    const t = this.text;
    const found = [];
    let total = 0;
    const cnt = new Array(26);
    for (let start = 0, end; (end = t.indexOf('\n', start)) >= 0; start = end + 1) {
      const wl = end - start;
      if (partial ? wl < 2 || wl > len : wl !== len) continue;
      cnt.fill(0);
      let extra = 0;
      for (let i = start; i < end; i++) {
        const c = t.charCodeAt(i) - 97;
        if (c < 0 || c > 25) { extra = 99; break; }
        if (++cnt[c] > need[c]) extra++;
      }
      if (extra > wild) continue;
      total++;
      if (found.length < limit) found.push(t.slice(start, end));
    }
    if (partial) found.sort((a, b) => b.length - a.length);
    return { words: found.map((w) => this.show(w)), total, truncated: total > limit };
  }
}

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Jednoduchý vzor: ? . _ = jedno písmeno, * = cokoliv, [abc] = jedno z písmen,
 * [^abc] = žádné z nich, číslice 1-9 = stejná / různá písmena (1221 = "anna").
 */
export function buildPattern(q) {
  const s = strip(q).replace(/\s+/g, '');
  let re = '';
  const groups = new Map(); // číslice -> číslo skupiny
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '?' || ch === '.' || ch === '_') re += '[a-z]';
    else if (ch === '*') re += '[a-z]*';
    else if (ch === '[') {
      const j = s.indexOf(']', i);
      if (j < 0) throw new Error('Chybí uzavírací závorka ].');
      const body = s.slice(i + 1, j).replace(/[^a-z^-]/g, '');
      re += `[${body}]`;
      i = j;
    } else if (/[1-9]/.test(ch)) {
      if (groups.has(ch)) re += `\\${groups.get(ch)}`;
      else {
        const others = [...groups.values()].map((g) => `\\${g}`).join('|');
        groups.set(ch, groups.size + 1);
        re += (others ? `(?!${others})` : '') + '([a-z])';
      }
    } else if (/[a-z]/.test(ch)) re += ch;
    else throw new Error(`Znak „${ch}“ ve vzoru neznám.`);
  }
  return new RegExp(`^${re}$`, 'gm');
}

export function buildRegex(q) {
  // výraz platí pro jedno slovo (malá písmena bez diakritiky); ^ a $ jsou začátek a konec slova
  const src = strip(q).trim().replace(/(^|[^\\])\./g, '$1[a-z]');
  const body = src.startsWith('^') ? src.slice(1) : '[^\\n]*' + src;
  try {
    return new RegExp(`^(?=${body})[^\\n]+$`, 'gm');
  } catch (e) {
    throw new Error('Neplatný regulární výraz: ' + e.message);
  }
}
