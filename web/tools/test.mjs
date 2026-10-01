#!/usr/bin/env node
// Ověří, že luštitel najde správné řešení vzorových šifer.
// Použití: node web/tools/test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Model } from '../js/model.js';
import { solve } from '../js/solver.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const model = new Model({
  quad: new Uint8Array(fs.readFileSync(path.join(dir, 'cs-quad.bin'))),
  meta: JSON.parse(fs.readFileSync(path.join(dir, 'cs-model.json'), 'utf8')),
  wordsText: fs.readFileSync(path.join(dir, 'cs-words.txt'), 'utf8'),
});

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const L = (s) => s.toUpperCase().replace(/[^A-Z]/g, '');
const shift = (s, k) => s.replace(/[A-Z]/g, (c) => ABC[(c.charCodeAt(0) - 65 + k + 26) % 26]);
const MORSE = { A: '.-', B: '-...', C: '-.-.', D: '-..', E: '.', F: '..-.', G: '--.', H: '....', I: '..', J: '.---', K: '-.-', L: '.-..', M: '--', N: '-.', O: '---', P: '.--.', Q: '--.-', R: '.-.', S: '...', T: '-', U: '..-', V: '...-', W: '.--', X: '-..-', Y: '-.--', Z: '--..' };
const morse = (s) => s.split(' ').map((w) => [...w].map((c) => MORSE[c]).join(' ')).join(' / ');
const vig = (s, key) => { let i = 0; return s.replace(/[A-Z]/g, (c) => ABC[(c.charCodeAt(0) - 65 + key.charCodeAt(i++ % key.length) - 65) % 26]); };
const polyb = (s) => [...L(s)].map((c) => { const g = ABC.replace('Q', ''); const i = g.indexOf(c); return `${(i / 5 | 0) + 1}${i % 5 + 1}`; }).join(' ');
const columns = (s, w) => { s = L(s); let o = ''; for (let c = 0; c < w; c++) for (let r = c; r < s.length; r += w) o += s[r]; return o; };
const sub = (s) => { const k = 'QWERTYUIOPASDFGHJKLZXCVBNM'; return s.replace(/[A-Z]/g, (c) => k[c.charCodeAt(0) - 65]); };
const keypad = ['', '', 'ABC', 'DEF', 'GHI', 'JKL', 'MNO', 'PQRS', 'TUV', 'WXYZ'];
const multitap = (s) => [...L(s)].map((c) => { const k = keypad.findIndex((x) => x.includes(c)); return String(k).repeat(keypad[k].indexOf(c) + 1); }).join(' ');
const braille = { P: '1234', O: '135', K: '13', L: '123', A: '1', D: '145', J: '245', E: '15', U: '136', S: '234', T: '2345', R: '1235', N: '1345', M: '134', I: '24' };

const P1 = 'POKLAD JE UKRYTY POD STAROU LIPOU U KOSTELA';
const P2 = 'DALSI STANOVISTE NAJDETE NA KRAJI LESA ZA RYBNIKEM';
const LONG = 'KDYZ PRIJDETE NA ROZCESTI U STARE HAJOVNY VYDEJTE SE PO CERVENE ZNACCE AZ K POTOKU KDE NAJDETE DALSI SIFRU SCHOVANOU POD KAMENEM U VELKEHO DUBU';

const cases = [
  ['Caesar', shift(P1, 3), P1],
  ['Atbaš', P1.replace(/[A-Z]/g, (c) => ABC[25 - (c.charCodeAt(0) - 65)]), P1],
  ['Morse', morse(P1), P1],
  ['A1Z26', [...L(P2)].map((c) => c.charCodeAt(0) - 64).join(' '), P2],
  ['A1Z26 bez mezer', [...L(P2)].map((c) => c.charCodeAt(0) - 64).join(''), P2],
  ['A1Z26 + posun', [...shift(L(P2), 5)].map((c) => c.charCodeAt(0) - 64).join(' '), P2],
  ['Polybius', polyb(P2), P2],
  ['Pozpátku', [...P2].reverse().join(''), P2],
  ['Obdélník', columns(P2, 5), P2],
  ['Vigenère', vig(L(LONG), 'SIFRY'), LONG],
  ['Záměna', sub(LONG), LONG],
  ['Mobil', multitap('SRAZ U MOSTU'), 'SRAZUMOSTU'],
  ['Braille', [...'POKLADJEUKOSTELA'].map((c) => braille[c]).join(' '), 'POKLADJEUKOSTELA'],
  ['Braille Unicode', '⠏⠕⠅⠇⠁⠙ ⠚⠑ ⠥ ⠅⠕⠎⠞⠑⠇⠁', 'POKLADJEUKOSTELA'],
  ['Bacon', [...L('UTEKLIJSME')].map((c) => (c.charCodeAt(0) - 65).toString(2).padStart(5, '0').replace(/0/g, 'A').replace(/1/g, 'B')).join(' '), 'UTEKLIJSME'],
  ['Binárně ASCII', [...'AHOJ'].map((c) => c.charCodeAt(0).toString(2).padStart(8, '0')).join(' '), 'AHOJ'],
  ['Římské', [...L('KAMEN')].map((c) => ['I','II','III','IV','V','VI','VII','VIII','IX','X','XI','XII','XIII','XIV','XV','XVI','XVII','XVIII','XIX','XX','XXI','XXII','XXIII','XXIV','XXV','XXVI'][c.charCodeAt(0) - 65]).join(' '), 'KAMEN'],
];

let ok = 0;
for (const [name, input, expected] of cases) {
  const t0 = Date.now();
  const { results } = solve(model, input, { monoMs: 1500 });
  const best = results[0];
  const pass = best && best.text.replace(/[^A-Z]/g, '') === L(expected);
  if (pass) ok++;
  const rank = results.findIndex((r) => r.text.replace(/[^A-Z]/g, '') === L(expected));
  console.log(`${pass ? 'OK  ' : 'FAIL'} ${name.padEnd(18)} ${String(Date.now() - t0).padStart(5)} ms  #${rank + 1} (${rank >= 0 ? results[rank].score.toFixed(1) : '-'})  ${best ? best.score.toFixed(1) : '-'}  ${best?.method} | ${best?.detail} | ${best?.pretty?.slice(0, 70)}`);
}
console.log(`${ok}/${cases.length}`);
process.exit(ok === cases.length ? 0 : 1);
