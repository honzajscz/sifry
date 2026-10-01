// Klikací klávesnice pro obrázkové šifry. Každá vkládá do zadání text,
// kterému luštitel rozumí (a který jde napsat i ručně).

import { FLAGS } from './flags.js';

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) el.append(kid);
  return el;
};
const btn = (label, onclick, cls = 'ghost', attrs = {}) => h('button', { type: 'button', class: cls, onclick, ...attrs }, label);
const help = (text) => h('p', { class: 'pad-help' }, text);

/**
 * pads: [{id, label, build(api) -> element}]
 * api: {insert(text), backChar(), backToken()}
 */
export const PADS = [
  { id: 'braille', label: 'Braille', build: braillePad },
  { id: 'morse', label: 'Morse', build: morsePad },
  { id: 'semafor', label: 'Semafor', build: semaforPad },
  { id: 'velky', label: 'Velký polský kříž', build: velkyPad },
  { id: 'maly', label: 'Malý polský kříž', build: malyPad },
  { id: 'vlajky', label: 'Vlajky', build: vlajkyPad },
];

// ---------------------------------------------------------------- Braille

function braillePad(api) {
  const order = [1, 4, 2, 5, 3, 6];
  const dots = order.map((d) => h('button', { type: 'button', class: 'dot', 'data-dot': d, 'aria-pressed': 'false', 'aria-label': `bod ${d}` }, String(d)));
  const preview = h('span', { class: 'br-preview' }, '⠀');
  const mask = () => dots.reduce((m, d) => (d.getAttribute('aria-pressed') === 'true' ? m | (1 << (d.dataset.dot - 1)) : m), 0);
  const update = () => (preview.textContent = String.fromCharCode(0x2800 + mask()));
  dots.forEach((d) => d.addEventListener('click', () => {
    d.setAttribute('aria-pressed', String(d.getAttribute('aria-pressed') !== 'true'));
    update();
  }));
  const add = () => {
    const m = mask();
    if (!m) return;
    api.insert(String.fromCharCode(0x2800 + m));
    dots.forEach((d) => d.setAttribute('aria-pressed', 'false'));
    update();
  };
  return h('div', { class: 'pad-body' },
    h('div', { class: 'cell', role: 'group', 'aria-label': 'Body Braillovy buňky' }, dots),
    h('div', { class: 'pad-actions' },
      btn(['Přidat znak ', preview], add, 'primary'),
      btn('Mezera', () => api.insert(' ')),
      btn('Smazat poslední', () => api.backChar()),
      help('Vyznačte tečky tak, jak jsou v zadání, a přidejte znak. Ručně jde psát i čísla bodů oddělená mezerou (1 12 14) nebo vložit znaky ⠁⠃⠉.'),
    ));
}

// ---------------------------------------------------------------- Morse

function morsePad(api) {
  return h('div', { class: 'pad-body' },
    h('div', { class: 'pad-actions' },
      btn('·', () => api.insert('.'), 'key big', { 'aria-label': 'tečka' }),
      btn('–', () => api.insert('-'), 'key big', { 'aria-label': 'čárka' }),
      btn('Další písmeno', () => api.insert(' ')),
      btn('Další slovo', () => api.insert(' / ')),
      btn('Smazat poslední', () => api.backChar()),
      help('Tečky a čárky, mezi písmeny mezera, mezi slovy lomítko. Luštitel zkusí i prohozené tečky a čárky a čtení pozpátku.'),
    ));
}

// ---------------------------------------------------------------- semafor

// poloha 0 = dolů, dál po směru hodinových ručiček (z pohledu pozorovatele), jako v aplikaci
const ARROWS = '↓↙←↖↑↗→↘';

function semaforPad(api) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-120 -120 240 240');
  svg.setAttribute('class', 'sem');
  const sel = new Set();
  const arms = [];
  const mk = (tag, a) => { const e = document.createElementNS(NS, tag); for (const k in a) e.setAttribute(k, a[k]); return e; };
  svg.append(mk('circle', { cx: 0, cy: -38, r: 14, class: 'sem-body' }), mk('rect', { x: -14, y: -22, width: 28, height: 50, rx: 6, class: 'sem-body' }));
  for (let i = 0; i < 8; i++) {
    const x = -Math.sin((Math.PI * i) / 4) * 92, y = Math.cos((Math.PI * i) / 4) * 92;
    const line = mk('line', { x1: 0, y1: -10, x2: x * 0.82, y2: y * 0.82 - 10 * (1 - 0.82), class: 'sem-arm' });
    const flag = mk('rect', { x: x * 0.82 - 9, y: y * 0.82 - 9, width: 18, height: 18, class: 'sem-flag' });
    const hit = mk('circle', { cx: x, cy: y, r: 22, class: 'sem-hit', tabindex: 0, role: 'button', 'aria-label': `směr ${ARROWS[i]}` });
    const g = mk('g', { class: 'sem-pos' });
    g.append(line, flag, hit);
    arms.push(g);
    svg.append(g);
    const toggle = () => {
      sel.has(i) ? sel.delete(i) : sel.add(i);
      g.classList.toggle('on', sel.has(i));
      if (sel.size === 2) {
        api.insert([...sel].sort((a, b) => a - b).map((k) => ARROWS[k]).join('') + ' ');
        sel.clear();
        setTimeout(() => arms.forEach((a) => { if (!sel.has(arms.indexOf(a))) a.classList.remove('on'); }), 250);
      }
    };
    hit.addEventListener('click', toggle);
    hit.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  }
  return h('div', { class: 'pad-body' },
    svg,
    h('div', { class: 'pad-actions' },
      btn('Smazat poslední', () => api.backToken()),
      btn('Mezera', () => api.insert('/ ')),
      help('Klikněte na polohy obou praporků, jak je vidíte (postava je čelem k vám). Znak se vloží jako dvojice šipek, např. ↓↙ = A. Luštitel zkusí i zrcadlový pohled.'),
    ));
}

// ---------------------------------------------------------------- velký polský kříž

function velkyPad(api) {
  const grid = h('div', { class: 'cross', role: 'group', 'aria-label': 'Velký polský kříž' });
  for (let y = 1; y <= 3; y++)
    for (let x = 1; x <= 3; x++) {
      const cell = h('div', { class: `xcell${x > 1 ? ' bl' : ''}${x < 3 ? ' br' : ''}${y > 1 ? ' bt' : ''}${y < 3 ? ' bb' : ''}` });
      for (let d = 1; d <= 3; d++)
        cell.append(h('button', { type: 'button', class: 'xdot', 'aria-label': `políčko ${x},${y}, tečka ${d}`, onclick: () => api.insert(`${x}${y}${d} `) },
          h('span', { class: `pip p${d}` })));
      grid.append(cell);
    }
  return h('div', { class: 'pad-body' },
    grid,
    h('div', { class: 'pad-actions' },
      btn('Smazat poslední', () => api.backToken()),
      help('Klikněte na tvar rámečku a místo tečky (vlevo, uprostřed, vpravo). Znak se vloží jako trojice číslic sloupec, řádek, tečka. Luštitel zkusí i jiné pořadí souřadnic a abecedu s CH i bez.'),
    ));
}

// ---------------------------------------------------------------- malý polský kříž

function malyPad(api) {
  let dot = false;
  const dotBtn = btn('S tečkou', () => {
    dot = !dot;
    dotBtn.setAttribute('aria-pressed', String(dot));
    wrap.classList.toggle('dotted', dot);
  }, 'ghost toggle', { 'aria-pressed': 'false' });
  const ins = (tok) => api.insert(tok + (dot ? '•' : '') + ' ');
  const grid = h('div', { class: 'cross small', role: 'group', 'aria-label': 'Mřížka' });
  for (let y = 1; y <= 3; y++)
    for (let x = 1; x <= 3; x++) {
      const n = (y - 1) * 3 + x;
      grid.append(h('button', { type: 'button', class: `xcell mcell${x > 1 ? ' bl' : ''}${x < 3 ? ' br' : ''}${y > 1 ? ' bt' : ''}${y < 3 ? ' bb' : ''}`, 'aria-label': `mřížka ${n}`, onclick: () => ins('#' + n) }, h('span', { class: 'pip' })));
    }
  // kříž X: nahoře, vlevo, vpravo, dole
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 120');
  svg.setAttribute('class', 'xgrid');
  const tri = [['60,58 8,6 112,6', 60, 30], ['58,60 6,8 6,112', 30, 60], ['62,60 114,8 114,112', 90, 60], ['60,62 8,114 112,114', 60, 90]];
  tri.forEach(([pts, cx, cy], i) => {
    const g = document.createElementNS(NS, 'g');
    const p = document.createElementNS(NS, 'polygon');
    p.setAttribute('points', pts);
    p.setAttribute('class', 'xtri');
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', 5); c.setAttribute('class', 'xpip');
    g.append(p, c);
    g.setAttribute('tabindex', 0);
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', ['X nahoře', 'X vlevo', 'X vpravo', 'X dole'][i]);
    g.addEventListener('click', () => ins('X' + (i + 1)));
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ins('X' + (i + 1)); } });
    svg.append(g);
  });
  const l1 = document.createElementNS(NS, 'path');
  l1.setAttribute('d', 'M6 6 L114 114 M114 6 L6 114');
  l1.setAttribute('class', 'xline');
  svg.append(l1);
  const wrap = h('div', { class: 'maly' }, grid, svg);
  return h('div', { class: 'pad-body' },
    wrap,
    h('div', { class: 'pad-actions' },
      dotBtn,
      btn('Smazat poslední', () => api.backToken()),
      help('Klikněte na tvar ze zadání; pro symboly s tečkou nejdřív zapněte „S tečkou“. Vkládá se jako #1 až #9 a X1 až X4. Luštitel vyzkouší všechna tři pořadí písmen z aplikace.'),
    ));
}

// ---------------------------------------------------------------- vlajky

function vlajkyPad(api) {
  const grid = h('div', { class: 'flags' });
  for (const [ch, svg] of Object.entries(FLAGS))
    grid.append(h('button', { type: 'button', class: 'flag', 'aria-label': `vlajka ${ch}`, title: ch, onclick: () => api.insert(ch), html: svg }));
  return h('div', { class: 'pad-body col' },
    grid,
    h('div', { class: 'pad-actions' },
      btn('Mezera', () => api.insert(' ')),
      btn('Smazat poslední', () => api.backChar()),
      help('Mezinárodní námořní signální vlajky. Kliknutím se vloží písmeno, výsledek luštitel dál zkouší jako písmennou šifru.'),
    ));
}
