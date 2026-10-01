// Uživatelské rozhraní luštitele.

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

const worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });

worker.onmessage = (e) => {
  const m = e.data;
  if (m.ready) {
    ready = true;
    statusEl.textContent = '';
    run();
    return;
  }
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
const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 350); };
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
// Braillova klávesnice: tečky skládají znak Unicode U+2800 + maska (bod 1 = bit 0)
const dots = [...document.querySelectorAll('.dot')];
const brPreview = $('#br-preview');
const brMask = () => dots.reduce((m, d) => (d.getAttribute('aria-pressed') === 'true' ? m | (1 << (d.dataset.dot - 1)) : m), 0);
const brUpdate = () => (brPreview.textContent = String.fromCharCode(0x2800 + brMask()));
dots.forEach((d) => d.addEventListener('click', () => {
  d.setAttribute('aria-pressed', String(d.getAttribute('aria-pressed') !== 'true'));
  brUpdate();
}));
const brInsert = (ch) => { cipher.value += ch; schedule(); };
$('#br-add').addEventListener('click', () => {
  const m = brMask();
  if (!m) return;
  brInsert(String.fromCharCode(0x2800 + m));
  dots.forEach((d) => d.setAttribute('aria-pressed', 'false'));
  brUpdate();
});
$('#br-space').addEventListener('click', () => brInsert(' '));
$('#br-back').addEventListener('click', () => { cipher.value = [...cipher.value].slice(0, -1).join(''); schedule(); });

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

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
