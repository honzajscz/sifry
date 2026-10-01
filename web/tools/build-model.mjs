#!/usr/bin/env node
// Sestaví český jazykový model pro automatického luštitele.
//
// Vstup: frekvenční seznam slov ve formátu "slovo počet" (jedno na řádek),
// např. https://github.com/hermitdave/FrequencyWords (content/2018/cs/cs_50k.txt,
// CC-BY-SA 4.0, z korpusu OpenSubtitles).
//
// Výstup (do web/data):
//   cs-quad.bin   Uint8Array 26^4, kvantované log10 pravděpodobnosti čtveřic písmen
//   cs-model.json metadata (kvantizace, kalibrace, frekvence písmen)
//   cs-words.txt  slovník pro dělení na slova: "KANON<TAB>počet[<TAB>tvar s diakritikou]"
//
// Použití: node web/tools/build-model.mjs cs_50k.txt

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, '..', 'data');
const src = process.argv[2];
if (!src) {
  console.error('Použití: node build-model.mjs <frekvencni-seznam.txt>');
  process.exit(1);
}

const strip = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

// 1) načtení a sloučení podle tvaru bez diakritiky
const words = new Map(); // canon -> {count, display, displayCount}
for (const line of fs.readFileSync(src, 'utf8').split('\n')) {
  const m = line.trim().match(/^(\S+)\s+(\d+)$/);
  if (!m) continue;
  const word = m[1].toLowerCase();
  const count = +m[2];
  if (!/^[a-záčďéěíňóřšťúůýž]+$/.test(word)) continue;
  const canon = strip(word);
  let w = words.get(canon);
  if (!w) words.set(canon, (w = { count: 0, display: word, displayCount: 0 }));
  w.count += count;
  if (count > w.displayCount) {
    w.display = word;
    w.displayCount = count;
  }
}
// jednopísmenná slova bereme jen ta, která česky opravdu existují
const oneLetter = new Set(['A', 'I', 'K', 'O', 'S', 'U', 'V', 'Z']);
for (const k of [...words.keys()]) if (k.length === 1 && !oneLetter.has(k)) words.delete(k);

const list = [...words.entries()].sort((a, b) => b[1].count - a[1].count);
console.log('slov:', list.length);

// 2) syntetický text vzorkovaný podle frekvencí (slova za sebou bez mezer)
let seed = 12345;
const rnd = () => { // mulberry32
  let t = (seed = (seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const cum = [];
let total = 0;
for (const [, w] of list) cum.push((total += w.count));
const pick = () => {
  const x = rnd() * total;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < x) lo = mid + 1; else hi = mid;
  }
  return list[lo][0];
};

const N = 26 ** 4;
const quad = new Float64Array(N);
const letters = new Float64Array(26);
const SAMPLE_WORDS = 8_000_000;
let prev = [];
let nQuads = 0;
for (let i = 0; i < SAMPLE_WORDS; i++) {
  const w = pick();
  for (let j = 0; j < w.length; j++) {
    const c = w.charCodeAt(j) - 65;
    letters[c]++;
    prev.push(c);
    if (prev.length > 4) prev.shift();
    if (prev.length === 4) {
      quad[((prev[0] * 26 + prev[1]) * 26 + prev[2]) * 26 + prev[3]]++;
      nQuads++;
    }
  }
}

// 3) log pravděpodobnosti a kvantizace
const floor = Math.log10(0.01 / nQuads);
let max = -Infinity;
const logp = new Float64Array(N);
for (let i = 0; i < N; i++) {
  logp[i] = quad[i] > 0 ? Math.log10(quad[i] / nQuads) : floor;
  if (logp[i] > max) max = logp[i];
}
const q = new Uint8Array(N);
for (let i = 0; i < N; i++) q[i] = Math.round(((logp[i] - floor) / (max - floor)) * 255);
const deq = (b) => floor + (b / 255) * (max - floor);

// 4) kalibrace: průměrné skóre českého textu a náhodných písmen
const scoreOf = (codes) => {
  let s = 0;
  for (let i = 0; i + 3 < codes.length; i++)
    s += deq(q[((codes[i] * 26 + codes[i + 1]) * 26 + codes[i + 2]) * 26 + codes[i + 3]]);
  return s / Math.max(1, codes.length - 3);
};
const sample = (n) => {
  const out = [];
  while (out.length < n) for (const ch of pick()) out.push(ch.charCodeAt(0) - 65);
  return out.slice(0, n);
};
let cz = 0, rand = 0;
const T = 400;
const lf = [...letters].map((x) => x / letters.reduce((a, b) => a + b, 0));
for (let t = 0; t < T; t++) {
  cz += scoreOf(sample(60));
  // náhodný text s českými frekvencemi písmen (jako monoalfabetická šifra)
  const r = [];
  for (let i = 0; i < 60; i++) {
    let x = rnd(), c = 0;
    while (c < 25 && (x -= lf[c]) > 0) c++;
    r.push(c);
  }
  rand += scoreOf(r);
}
cz /= T;
rand /= T;
console.log('kalibrace: čeština', cz.toFixed(3), 'náhodné', rand.toFixed(3));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'cs-quad.bin'), q);
fs.writeFileSync(
  path.join(outDir, 'cs-model.json'),
  JSON.stringify({
    source: 'FrequencyWords (hermitdave), OpenSubtitles 2018, CC-BY-SA 4.0',
    floor, max, calib: { czech: cz, random: rand },
    letterFreq: lf.map((x) => +x.toFixed(5)),
  }, null, 1),
);
const WORDS = +(process.env.WORDS || 80000);
const lines = list.slice(0, WORDS).map(([canon, w]) =>
  strip(w.display) === canon && w.display === canon.toLowerCase()
    ? `${canon}\t${w.count}`
    : `${canon}\t${w.count}\t${w.display}`,
);
fs.writeFileSync(path.join(outDir, 'cs-words.txt'), lines.join('\n') + '\n');
console.log('hotovo ->', outDir);
