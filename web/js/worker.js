// Výpočty běží mimo hlavní vlákno, aby stránka nezamrzala.
import { loadModel, canon } from './model.js';
import { solve, crackMono } from './solver.js';
import { WordList } from './words.js';

const modelReady = loadModel(new URL('../data/', import.meta.url).href);
let latest = 0;
let small = null;
let full = null;

const slim = (r) => ({
  cat: r.cat, method: r.method, detail: r.detail, text: r.text, pretty: r.pretty,
  score: r.score, readability: r.readability, coverage: r.coverage, also: r.also || 0,
});

async function loadFull() {
  if (!full) full = (async () => {
    self.postMessage({ type: 'words-status', text: 'Stahuji úplný slovník (asi 9 MB)…' });
    const res = await fetch(new URL('../data/cs-full.txt.gz', import.meta.url));
    if (!res.ok) throw new Error('Úplný slovník není k dispozici.');
    const buf = new Uint8Array(await res.arrayBuffer());
    let text;
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
      text = await new Response(stream).text();
    } else text = new TextDecoder().decode(buf);
    return new WordList(text, small && small.display);
  })();
  try { return await full; } catch (e) { full = null; throw e; }
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg.type) latest = msg.id;
  const model = await modelReady;

  if (msg.type === 'words') {
    try {
      small ||= WordList.fromModel(model);
      const list = msg.dict === 'full' ? await loadFull() : small;
      const r = list.search(msg.mode, msg.query, { partial: msg.partial });
      self.postMessage({ type: 'words', id: msg.id, ...r, dictSize: list.count });
    } catch (err) {
      self.postMessage({ type: 'words', id: msg.id, error: err.message });
    }
    return;
  }

  if (msg.type === 'mono') {
    const r = crackMono(model, canon(msg.text), 2000)[0];
    self.postMessage({ type: 'mono', key: r ? r.key : null });
    return;
  }

  const { id, text, key } = msg;
  if (id !== latest) return;
  // 1) rychlé metody
  const fast = solve(model, text, { key, heavy: false });
  self.postMessage({ type: 'solve', id, phase: 'fast', info: { hints: fast.info.hints }, results: fast.results.slice(0, 60).map(slim) });
  // necháme doběhnout případné novější zadání
  await new Promise((r) => setTimeout(r, 30));
  if (id !== latest) return;
  // 2) i pomalé lámání (Vigenère, obecná záměna)
  const res = solve(model, text, { key, heavy: true, monoMs: 1500 });
  if (id !== latest) return;
  self.postMessage({ type: 'solve', id, phase: 'full', info: { hints: res.info.hints }, results: res.results.slice(0, 60).map(slim) });
};

modelReady.then(() => self.postMessage({ ready: true })).catch((err) => self.postMessage({ error: String(err) }));
