// Výpočty běží mimo hlavní vlákno, aby stránka nezamrzala.
import { loadModel } from './model.js';
import { solve } from './solver.js';

const modelReady = loadModel(new URL('../data/', import.meta.url).href);
let latest = 0;

const slim = (r) => ({
  cat: r.cat, method: r.method, detail: r.detail, text: r.text, pretty: r.pretty,
  score: r.score, readability: r.readability, coverage: r.coverage, also: r.also || 0,
});

self.onmessage = async (e) => {
  const { id, text, key } = e.data;
  latest = id;
  const model = await modelReady;
  if (id !== latest) return;
  // 1) rychlé metody
  const fast = solve(model, text, { key, heavy: false });
  self.postMessage({ id, phase: 'fast', info: { hints: fast.info.hints }, results: fast.results.slice(0, 60).map(slim) });
  // necháme doběhnout případné novější zadání
  await new Promise((r) => setTimeout(r, 30));
  if (id !== latest) return;
  // 2) i pomalé lámání (Vigenère, obecná záměna)
  const full = solve(model, text, { key, heavy: true, monoMs: 1500 });
  if (id !== latest) return;
  self.postMessage({ id, phase: 'full', info: { hints: full.info.hints }, results: full.results.slice(0, 60).map(slim) });
};

modelReady.then(() => self.postMessage({ ready: true })).catch((err) => self.postMessage({ error: String(err) }));
