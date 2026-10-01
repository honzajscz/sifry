// Český jazykový model: hodnocení čitelnosti textu a dělení na slova.

export const A = 65;

/** Odstraní diakritiku a převede na velká písmena. */
export function canon(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

/** Kódy písmen 0..25 z textu (ostatní znaky přeskočí). */
export function codesOf(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) - A;
    if (c >= 0 && c < 26) out.push(c);
  }
  return out;
}

export class Model {
  constructor({ quad, meta, wordsText }) {
    const { floor, max } = meta;
    this.meta = meta;
    this.q = new Float32Array(quad.length);
    for (let i = 0; i < quad.length; i++) this.q[i] = floor + (quad[i] / 255) * (max - floor);
    this.floor = floor;
    this.czech = meta.calib.czech;
    this.random = meta.calib.random;
    this.uni = meta.letterFreq.map((p) => Math.log10(Math.max(p, 1e-5)));

    this.words = new Map();
    let total = 0;
    const rows = [];
    for (const line of wordsText.split('\n')) {
      if (!line) continue;
      const [w, n, disp] = line.split('\t');
      rows.push([w, +n, disp]);
      total += +n;
    }
    this.maxWord = 1;
    for (const [w, n, disp] of rows) {
      this.words.set(w, { cost: -Math.log10(n / total), display: disp || w.toLowerCase() });
      if (w.length > this.maxWord) this.maxWord = w.length;
    }
    // cena neznámého úseku: základ + za každé písmeno
    this.unknownBase = -Math.log10(1 / total) + 1;
    this.unknownPerLetter = 2;
  }

  /** Průměrná log10 pravděpodobnost čtveřic písmen. */
  fitness(codes) {
    const n = codes.length;
    // na méně než čtyři písmena čtveřice nestačí: neutrální hodnota, rozhodne slovník
    if (n < 4) return (this.random + this.czech) / 2;
    const q = this.q;
    let s = 0;
    let idx = (codes[0] * 26 + codes[1]) * 26 + codes[2];
    for (let i = 3; i < n; i++) {
      idx = (idx % 17576) * 26 + codes[i];
      s += q[idx];
    }
    return s / (n - 3);
  }

  /** Čitelnost 0..100 podle čtveřic. */
  readability(codes) {
    const f = this.fitness(codes);
    const r = (f - this.random) / (this.czech - this.random);
    return Math.max(0, Math.min(1.1, r)) * 100;
  }

  /**
   * Rozdělí řetězec písmen (bez mezer, A-Z) na slova.
   * Vrací {words: [{w, display, known}], coverage}.
   */
  segment(str) {
    const n = str.length;
    if (!n) return { words: [], coverage: 0 };
    const best = new Float64Array(n + 1).fill(Infinity);
    const from = new Int32Array(n + 1);
    const known = new Uint8Array(n + 1);
    best[0] = 0;
    const U0 = this.unknownBase, U1 = this.unknownPerLetter;
    for (let i = 0; i < n; i++) {
      if (best[i] === Infinity) continue;
      const lim = Math.min(n, i + this.maxWord);
      for (let j = i + 1; j <= lim; j++) {
        const piece = str.slice(i, j);
        const w = this.words.get(piece);
        // neznámý úsek (slovo mimo slovník)
        const u = best[i] + U0 + U1 * (j - i);
        if (u < best[j]) { best[j] = u; from[j] = i; known[j] = 0; }
        if (!w) continue;
        const c = best[i] + w.cost;
        if (c < best[j]) { best[j] = c; from[j] = i; known[j] = 1; }
      }
    }
    const words = [];
    for (let j = n; j > 0; j = from[j]) {
      const w = str.slice(from[j], j);
      words.push(known[j] ? { w, display: this.words.get(w).display, known: true } : { w, display: w.toLowerCase(), known: false });
    }
    words.reverse();
    // pokrytí: dlouhá známá slova váží víc, krátká slova se dají "najít" skoro všude
    const weight = [0, 0.25, 0.55, 0.85, 1];
    let cov = 0;
    for (const w of words) if (w.known) cov += w.w.length * weight[Math.min(4, w.w.length)];
    return { words, coverage: cov / n };
  }

  /** Zobrazitelná podoba: slova s diakritikou. Zachová mezery, pokud v textu jsou. */
  pretty(text) {
    const tokens = text.split(/(\s+)/);
    const hasSpaces = tokens.length > 1;
    let coverSum = 0, letters = 0;
    const out = tokens.map((t) => {
      if (/^\s+$/.test(t) || !t) return t;
      const m = t.match(/^([^A-Z]*)([A-Z]+)([^A-Z]*)$/);
      if (!m) return t.toLowerCase();
      const seg = this.segment(m[2]);
      coverSum += seg.coverage * m[2].length;
      letters += m[2].length;
      const body = hasSpaces && seg.words.length === 1 ? seg.words[0].display : seg.words.map((w) => w.display).join(' ');
      return m[1] + body + m[3];
    });
    return { text: out.join(''), coverage: letters ? coverSum / letters : 0 };
  }

  /** Celkové skóre kandidáta 0..100 (čtveřice + pokrytí slovníkem). */
  rate(text) {
    const codes = codesOf(text);
    if (!codes.length) return { score: 0, readability: 0, coverage: 0, pretty: text };
    const read = this.readability(codes);
    const p = this.pretty(text);
    const n = codes.length;
    const w = n < 8 ? 0.6 : n < 20 ? 0.4 : 0.25;
    let score = (1 - w) * Math.min(read, 100) + w * p.coverage * 100;
    // velmi krátké výstupy jsou málo průkazné
    if (n < 4) score *= 0.6;
    return { score, readability: read, coverage: p.coverage, pretty: p.text };
  }
}

/** Načtení modelu v prohlížeči (cesty relativně k index.html). */
export async function loadModel(base = './data/') {
  const [quad, meta, wordsText] = await Promise.all([
    fetch(base + 'cs-quad.bin').then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)),
    fetch(base + 'cs-model.json').then((r) => r.json()),
    fetch(base + 'cs-words.txt').then((r) => r.text()),
  ]);
  return new Model({ quad, meta, wordsText });
}
