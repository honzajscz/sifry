// Uživatelské rozhraní luštitele.

import { PADS } from './pads.js';

const $ = (s) => document.querySelector(s);
const cipher = $('#cipher');
const keyInput = $('#key');
const statusEl = $('#status');
const hintsEl = $('#hints');
const filtersEl = $('#filters');
const resultsEl = $('#results');
const moreBtn = $('#more');
const tpl = $('#tpl-result');

const PAGE = 10;
let results = [];
let filter = 'Vše';
let shown = PAGE;
let reqId = 0;
let ready = false;
let activeTab = 'lustitel';

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

worker.onmessage = (e) => {
  const m = e.data;
  if (m.ready) {
    ready = true;
    statusEl.textContent = '';
    run();
    if (activeTab === 'slova') wsearch();
    return;
  }
  if (m.type === 'words' || m.type === 'words-status') return onWords(m);
  if (m.type === 'mono') return onMono(m);
  if (m.error) {
    statusEl.textContent = 'Slovník se nepodařilo načíst.';
    return;
  }
  if (m.id !== reqId) return;
  results = m.results;
  statusEl.textContent = m.phase === 'fast' ? 'Zkouším i pomalejší metody…' : '';
  renderHints(m.info.hints);
  render();
};

function run() {
  if (activeTab !== 'lustitel') return;
  const text = cipher.value;
  try { localStorage.setItem('lustitel.input', text); localStorage.setItem('lustitel.key', keyInput.value); } catch {}
  if (!text.trim()) {
    results = [];
    hintsEl.textContent = '';
    statusEl.textContent = '';
    render();
    return;
  }
  if (!ready) return;
  reqId++;
  shown = PAGE;
  statusEl.textContent = 'Luštím…';
  worker.postMessage({ id: reqId, text, key: keyInput.value });
}

let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 350); renderZamena(); };
cipher.addEventListener('input', schedule);
keyInput.addEventListener('input', schedule);

$('#clear').addEventListener('click', () => { cipher.value = ''; keyInput.value = ''; run(); cipher.focus(); });
$('#paste').addEventListener('click', async () => {
  try {
    cipher.value = await navigator.clipboard.readText();
    run();
  } catch {
    cipher.focus();
    statusEl.textContent = 'Vložte text ručně (Ctrl+V).';
  }
});
moreBtn.addEventListener('click', () => { shown += PAGE * 2; render(); });

function renderHints(hints) {
  hintsEl.replaceChildren(...hints.map((h) => {
    const s = document.createElement('span');
    s.className = 'hint';
    s.textContent = h;
    return s;
  }));
}

function render() {
  // filtry podle druhu
  const counts = new Map([['Vše', results.length]]);
  for (const r of results) counts.set(r.cat, (counts.get(r.cat) || 0) + 1);
  if (!counts.has(filter)) filter = 'Vše';
  filtersEl.replaceChildren(...(results.length ? [...counts] : []).map(([cat, n]) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = `${cat} ${n}`;
    b.setAttribute('aria-pressed', String(cat === filter));
    b.onclick = () => { filter = cat; shown = PAGE; render(); };
    return b;
  }));

  const list = results.filter((r) => filter === 'Vše' || r.cat === filter);
  if (!list.length) {
    resultsEl.innerHTML = cipher.value.trim() && ready && statusEl.textContent === ''
      ? '<p class="empty">Žádná metoda nedala smysluplný výsledek.</p>' : '';
    moreBtn.hidden = true;
    return;
  }
  resultsEl.replaceChildren(...list.slice(0, shown).map((r, i) => card(r, i === 0 && filter === 'Vše')));
  moreBtn.hidden = list.length <= shown;
}

function card(r, first) {
  const el = tpl.content.firstElementChild.cloneNode(true);
  const score = Math.max(0, Math.min(100, Math.round(r.score)));
  el.classList.add(score >= 75 ? 'good' : score >= 50 ? 'mid' : 'low');
  if (first) el.classList.add('top1');
  el.querySelector('.meter span').style.height = `${score}%`;
  el.querySelector('.pretty').textContent = r.pretty;
  el.querySelector('.raw').textContent = r.text;
  el.querySelector('.method').textContent = r.method;
  el.querySelector('.detail').textContent = r.detail + (r.also ? ` (a ${r.also} dalších se stejným výsledkem)` : '');
  el.querySelector('.score').textContent = `${score} %`;
  el.querySelector('.score').title = 'Čitelnost: podobnost s češtinou';
  const btn = el.querySelector('.copy');
  btn.onclick = async () => {
    try {
      await navigator.clipboard.writeText(r.pretty);
      btn.textContent = 'Zkopírováno';
      setTimeout(() => (btn.textContent = 'Kopírovat'), 1500);
    } catch {}
  };
  return el;
}

// obnovení posledního zadání, případně zadání z odkazu ?q=
const params = new URLSearchParams(location.search);
// při první návštěvě ukázková šifra (Caesar), ať je hned vidět, co nástroj dělá
const EXAMPLE = 'SRNODG MH XNUBWB SRG VWDURX OLSRX X NRVWHOD';
try {
  cipher.value = params.get('q') ?? localStorage.getItem('lustitel.input') ?? EXAMPLE;
  keyInput.value = params.get('k') ?? localStorage.getItem('lustitel.key') ?? '';
} catch {
  cipher.value = params.get('q') ?? EXAMPLE;
}

// ---------------------------------------------------------------- záložky

const TABS = ['lustitel', 'slova', 'zamena'];
function showTab(name) {
  if (!TABS.includes(name)) name = 'lustitel';
  activeTab = name;
  for (const t of TABS) {
    $(`#tab-${t}`).setAttribute('aria-selected', String(t === name));
    $(`#panel-${t}`).hidden = t !== name;
  }
  $('#input-block').hidden = name === 'slova';
  if (name === 'lustitel') run();
  if (name === 'zamena') renderZamena();
  if (name === 'slova') wsearch();
}
for (const t of TABS) $(`#tab-${t}`).addEventListener('click', () => {
  showTab(t);
  try { history.replaceState(null, '', t === 'lustitel' ? location.pathname + location.search : '#' + t); } catch {}
});

// ---------------------------------------------------------------- klávesnice

const padArea = $('#pad-area');
const padChoice = $('#pad-choice');
let openPad = null;
const padApi = {
  insert(t) { cipher.value += t; schedule(); },
  backChar() { cipher.value = [...cipher.value].slice(0, -1).join(''); schedule(); },
  backToken() {
    const v = cipher.value.replace(/\s+$/, '');
    const i = v.search(/\S+$/);
    cipher.value = i > 0 ? v.slice(0, i) : '';
    schedule();
  },
};
for (const pad of PADS) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = pad.label;
  b.setAttribute('aria-pressed', 'false');
  b.onclick = () => {
    const same = openPad === pad.id;
    openPad = same ? null : pad.id;
    for (const x of padChoice.children) x.setAttribute('aria-pressed', String(x === b && !same));
    padArea.hidden = same;
    padArea.replaceChildren(same ? '' : pad.build(padApi));
  };
  padChoice.append(b);
}

// ---------------------------------------------------------------- hledání slov

const wq = $('#wq');
const wdict = $('#wdict');
const wstatus = $('#wstatus');
const wresults = $('#wresults');
const WHELP = {
  pattern: '? = jedno písmeno, * = libovolně písmen, [kl] = jedno z písmen, [^kl] = žádné z nich. Číslice označují stejná písmena: 1221 najde „anna“, 12341 slova, která začínají a končí stejně. Diakritika se nerozlišuje.',
  anagram: 'Napište písmena, ze kterých má slovo být (pořadí nehraje roli). Otazník je libovolné písmeno navíc.',
  regex: 'Regulární výraz pro jedno slovo bez diakritiky, jako v modulu Databáze slov: ^ začátek, $ konec, např. ^kou.*kou$ nebo (h.*){4}.',
};
let wid = 0;
const wmode = () => document.querySelector('input[name="wmode"]:checked').value;
function wsearch() {
  const mode = wmode();
  $('#whelp').textContent = WHELP[mode];
  document.querySelector('.wpartial').hidden = mode !== 'anagram';
  try { localStorage.setItem('lustitel.words', JSON.stringify({ q: wq.value, mode, dict: wdict.value })); } catch {}
  if (!wq.value.trim()) { wresults.replaceChildren(); wstatus.textContent = ''; return; }
  if (!ready) return;
  wid++;
  wstatus.textContent = 'Hledám…';
  worker.postMessage({ type: 'words', id: wid, mode, query: wq.value, dict: wdict.value, partial: $('#wpartial').checked });
}
let wtimer;
const wschedule = () => { clearTimeout(wtimer); wtimer = setTimeout(wsearch, 250); };
wq.addEventListener('input', wschedule);
wdict.addEventListener('change', wsearch);
$('#wpartial').addEventListener('change', wsearch);
document.querySelectorAll('input[name="wmode"]').forEach((r) => r.addEventListener('change', wsearch));
function onWords(m) {
  if (m.type === 'words-status') { wstatus.textContent = m.text; return; }
  if (m.id !== wid) return;
  if (m.error) { wstatus.textContent = m.error; wresults.replaceChildren(); return; }
  const n = m.total;
  wstatus.textContent = n === 0 ? 'Nic nenalezeno.'
    : `Nalezeno ${n.toLocaleString('cs')} ${n === 1 ? 'slovo' : n < 5 ? 'slova' : 'slov'}${m.truncated ? `, zobrazeno prvních ${m.words.length.toLocaleString('cs')}` : ''}.`;
  wresults.replaceChildren(...m.words.map((w) => {
    const s = document.createElement('span');
    s.className = 'word';
    s.textContent = w;
    return s;
  }));
}
try {
  const saved = JSON.parse(localStorage.getItem('lustitel.words') || 'null');
  if (saved) {
    wq.value = saved.q || '';
    wdict.value = saved.dict === 'full' ? 'full' : 'small';
    const r = document.querySelector(`input[name="wmode"][value="${saved.mode}"]`);
    if (r) r.checked = true;
  }
} catch {}
$('#whelp').textContent = WHELP[wmode()];

// ---------------------------------------------------------------- ruční záměna

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const CZ_ORDER = 'EAOITNSMLDRUJVKCZPYHBFGWXQ';
const CZ_PCT = { E: 11.9, A: 8.9, O: 8.0, I: 6.5, T: 6.4, N: 5.9, S: 5.8, M: 4.5, L: 4.3, D: 4.0, R: 3.9, U: 3.6, J: 3.5, V: 3.4, K: 3.2, C: 3.0, Z: 3.0, P: 2.9, Y: 2.7, H: 2.3, B: 1.9 };
const zmap = new Map();
const canonUp = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
$('#zlang').textContent = Object.entries(CZ_PCT).map(([l, p]) => `${l} ${p.toLocaleString('cs')}`).join(' · ');

function zcounts() {
  const cnt = {};
  let total = 0;
  for (const ch of canonUp(cipher.value)) if (ch >= 'A' && ch <= 'Z') { cnt[ch] = (cnt[ch] || 0) + 1; total++; }
  return { cnt, total };
}

function renderZamena() {
  if (activeTab !== 'zamena') return;
  const { cnt, total } = zcounts();
  const letters = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a] || a.localeCompare(b));
  const table = $('#ztable');
  const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.z : null;
  if (!letters.length) {
    table.replaceChildren();
    $('#zout').textContent = '';
    $('#zbigrams').textContent = '';
    $('#zstatus').textContent = 'Zadejte nahoře šifru složenou z písmen.';
    return;
  }
  $('#zstatus').textContent = '';
  const used = {};
  for (const [, v] of zmap) if (v) used[v] = (used[v] || 0) + 1;
  const row = (cls, cells) => {
    const tr = document.createElement('tr');
    tr.className = cls;
    tr.append(...cells);
    return tr;
  };
  const th = (t) => { const e = document.createElement('th'); e.textContent = t; return e; };
  const td = (t) => { const e = document.createElement('td'); e.textContent = t; return e; };
  const inputs = letters.map((l) => {
    const cell = document.createElement('td');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.maxLength = 1;
    inp.dataset.z = l;
    inp.id = 'z-' + l;
    inp.setAttribute('aria-label', `${l} zaměnit za`);
    inp.value = (zmap.get(l) || '').toLowerCase();
    if (zmap.get(l) && used[zmap.get(l)] > 1) inp.classList.add('dup');
    inp.addEventListener('input', () => {
      const v = canonUp(inp.value).replace(/[^A-Z]/g, '').slice(-1);
      if (v) zmap.set(l, v); else zmap.delete(l);
      renderZamena();
      const next = $(`#z-${letters[letters.indexOf(l) + 1]}`);
      if (v && next) next.focus(); else $(`#z-${l}`)?.focus();
    });
    cell.append(inp);
    return cell;
  });
  table.replaceChildren(
    row('zl', [th('Šifra'), ...letters.map((l) => th(l))]),
    row('zp', [th('%'), ...letters.map((l) => td(((cnt[l] / total) * 100).toFixed(1)))]),
    row('zi', [th('Za'), ...inputs]),
  );
  if (focused) $(`#z-${focused}`)?.focus();

  const out = $('#zout');
  out.replaceChildren(...[...canonUp(cipher.value)].map((ch) => {
    if (ch < 'A' || ch > 'Z') return document.createTextNode(ch);
    const v = zmap.get(ch);
    const e = document.createElement(v ? 'b' : 'span');
    e.textContent = v ? v : ch.toLowerCase();
    if (!v) e.className = 'unk';
    return e;
  }));
  // nejčastější dvojice písmen
  const big = {};
  const only = canonUp(cipher.value).replace(/[^A-Z]/g, '');
  for (let i = 0; i + 1 < only.length; i++) big[only.slice(i, i + 2)] = (big[only.slice(i, i + 2)] || 0) + 1;
  const top = Object.entries(big).sort((a, b) => b[1] - a[1]).slice(0, 8).filter(([, n]) => n > 1);
  $('#zbigrams').textContent = top.length ? 'Nejčastější dvojice v šifře: ' + top.map(([b, n]) => `${b} ${n}×`).join(', ') + '. V češtině bývají nejčastější ST, PR, NE, PO, NA, OV, RO, EN.' : '';
}

$('#z-freq').addEventListener('click', () => {
  const { cnt } = zcounts();
  const letters = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a]);
  zmap.clear();
  letters.forEach((l, i) => zmap.set(l, CZ_ORDER[i]));
  renderZamena();
});
$('#z-clear').addEventListener('click', () => { zmap.clear(); renderZamena(); });
$('#z-auto').addEventListener('click', () => {
  const { total } = zcounts();
  if (total < 30) { $('#zstatus').textContent = 'Na automatický odhad je text moc krátký (potřeba aspoň 30 písmen).'; return; }
  $('#zstatus').textContent = 'Počítám odhad…';
  worker.postMessage({ type: 'mono', text: cipher.value });
});
function onMono(m) {
  if (!m.key) { $('#zstatus').textContent = 'Odhad se nepodařil.'; return; }
  const { cnt } = zcounts();
  zmap.clear();
  for (const l of Object.keys(cnt)) zmap.set(l, ABC[m.key[l.charCodeAt(0) - 65]]);
  renderZamena();
  $('#zstatus').textContent = 'Hotovo. Chybná písmena opravte ručně.';
}

showTab(location.hash.slice(1));

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
