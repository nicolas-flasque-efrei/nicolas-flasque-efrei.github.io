/* Ateliers TI301 — moteur commun.
   Une page d'atelier décrit ses commandes et son modèle ; le moteur fournit l'interface (script, journal,
   lecteur, narration) et anime une scène SVG décrite étape par étape (éléments et flèches repérés par une clé). */
(() => {
'use strict';
const THEME_KEY = 'ateliers-ti301-theme';
try { const t = localStorage.getItem(THEME_KEY); if (t && t !== 'auto') document.documentElement.dataset.theme = t === 'neo' ? 'neon' : t; } catch (e) {}

const NS = 'http://www.w3.org/2000/svg';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const ICON = { start: 'M2 3h2v10H2zM9 3v10L4 8zM15 3v10l-5-5z', prev: 'M12 2v12L4 8z', play: 'M5 2.5v11L13.5 8z',
  pause: 'M4 2.5h3v11H4zM9 2.5h3v11H9z', next: 'M4 2v12l8-6z', last: 'M14 3h-2v10h2zM7 3v10l5-5zM1 3v10l5-5z' };

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v; else e.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
}
function sv(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const lerp = (a, b, t) => a + (b - a) * t;
function bezier(x1, y1, x2, y2) {
  const B = (u, a, b) => 3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
  return t => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let lo = 0, hi = 1, u = t;
    for (let i = 0; i < 22; i++) { u = (lo + hi) / 2; if (B(u, x1, x2) < t) lo = u; else hi = u; }
    return B(u, y1, y2);
  };
}
const EASE = bezier(0.45, 0, 0.25, 1);
const ph = (p, a, b) => EASE(Math.max(0, Math.min(1, (p - a) / (b - a))));
const plural = (n, w, ws) => `${n} ${n > 1 ? (ws || w + 's') : w}`;

/* ---------- Petits constructeurs de scène, partagés par les ateliers ---------- */
const S = {
  box: (k, x, y, w, h, t, o = {}) => ({ k, shape: 'box', x, y, w, h, t, ...o }),
  circle: (k, cx, cy, r, t, o = {}) => ({ k, shape: 'circle', x: cx - r, y: cy - r, w: 2 * r, h: 2 * r, t, ...o }),
  text: (k, x, y, t, o = {}) => ({ k, shape: 'text', x, y: y - 10, w: o.w || 0, h: 20, t, align: o.align || 'middle', ...o }),
  /* cellule de liste : compartiments { t, w, cls, tc } placés de gauche à droite */
  cell: (k, x, y, parts, o = {}) => ({ k, shape: 'cell', x, y, w: parts.reduce((s, p) => s + p.w, 0), h: o.h || 40, parts, ...o }),
  tri: (k, cx, y, w, h, t, o = {}) => ({ k, shape: 'tri', x: cx - w / 2, y, w, h, t, ...o }),
  /* variable pointeur : étiquette arrondie */
  ptr: (k, x, y, t, o = {}) => ({ k, shape: 'box', x, y, w: Math.max(46, 14 + String(t).length * 8.6), h: 26, rx: 13, t, ...o, cls: 'var ' + (o.cls || '') }),
  arrow: (k, from, to, o = {}) => ({ k, from: typeof from === 'object' ? from : { k: from }, to: typeof to === 'object' ? to : { k: to }, ...o }),
  /* Convention du cours pour les listes : cellule « value | next », next contient @ et un point d'où part la flèche */
  LCW: 106,
  lcell: (k, x, y, v, o = {}) => ({ k, shape: 'cell', x, y, w: 106, h: 40,
    parts: [{ t: v, w: 56, lbl: o.labels === false ? null : 'value' }, { t: '@', w: 50, dot: true, lbl: o.labels === false ? null : 'next', tc: 'at' }], ...o }),
  /* Variable structure (t_list, t_ht_list…) : un cadre, et pour chaque champ son nom et une case @.
     Les cases ont pour clé `${k}_${champ}` ; le centre du champ i est à y + 42 + 54 i. */
  lstruct: (k, x, y, fields, o = {}) => {
    const out = [{ k, shape: 'box', x, y, w: 92, h: 12 + fields.length * 54, t: '', rx: 3, cls: 'struct ' + (o.cls || ''),
      sub: o.name, subPos: o.namePos || 'left', subCls: 'strong' }];
    fields.forEach((f, i) => {
      out.push({ k: `${k}_${f}L`, shape: 'text', x: x + 46, y: y + 6 + i * 54, w: 0, h: 20, t: f, align: 'middle', cls: 'fld' });
      out.push({ k: `${k}_${f}`, shape: 'box', x: x + 17, y: y + 26 + i * 54, w: 58, h: 32, t: '@', dot: true, rx: 3,
        cls: 'field ' + ((o.fcls && o.fcls[f]) || ''), tc: 'at' });
    });
    return out;
  },
  /* NULL : une barre et des hachures (comme une « masse »), à droite d'une flèche horizontale ou sous une flèche verticale */
  ground: (k, x, y, dir = 'right', o = {}) => ({ k, shape: 'ground', x, y, w: dir === 'right' ? 12 : 26, h: dir === 'right' ? 26 : 12, dir, nobounds: false, ...o }),
};

/* ====================================================================================== */
function init(cfg) {
  const ID = cfg.id;
  const commands = cfg.commands || {};
  const LOOK = {};
  for (const [name, spec] of Object.entries(commands)) for (const a of [name, ...(spec.aliases || [])]) LOOK[a.toLowerCase()] = name;

  /* ---------- Construction de l'interface ---------- */
  const $ = {};
  const credit = el('span', { class: 'credit', html: '<svg class="copyleft" viewBox="0 0 24 24" role="img" aria-label="Copyleft"><circle cx="12" cy="12" r="10.5"></circle><path d="M8.6 8.2a5.2 5.2 0 1 1 0 7.6"></path></svg>Nicolas FLASQUE - IA Claude code' });
  $.theme = el('select', { id: 'optTheme' },
    el('option', { value: 'auto', text: 'Auto' }), el('option', { value: 'light', text: 'Clair' }),
    el('option', { value: 'dark', text: 'Sombre' }), el('option', { value: 'neon', text: 'Neon' }),
    el('option', { value: 'klear', text: 'Klear (accessibilité)' }));
  const opts = el('div', { class: 'opts' });
  if (cfg.conv) opts.append(el('span', { class: 'conv', text: cfg.conv }));
  opts.append(el('label', { for: 'optTheme' }, 'Thème ', $.theme));
  $.opts = {};
  for (const o of cfg.options || []) {
    let saved = null;
    try { saved = localStorage.getItem(`${ID}-opt-${o.id}`); } catch (e) {}
    const cb = el('input', { type: 'checkbox', id: 'opt-' + o.id, checked: saved != null ? saved === '1' : !!o.checked });
    $.opts[o.id] = cb;
    opts.append(el('label', { class: 'chk' }, cb, ' ' + o.label));
  }
  const header = el('header', { class: 'top' },
    el('div', { class: 'brand' }, el('h1', { text: cfg.title }), credit,
      el('a', { class: 'home', href: 'index.html', text: '← tous les ateliers' }),
      el('p', { text: cfg.subtitle || '' })),
    opts);

  const side = el('aside', { class: 'side' });
  if (cfg.quick) {
    const q = cfg.quick, form = el('form', { class: 'btns', novalidate: true });
    if (q.input) {
      $.qVal = el('input', { id: 'qVal', type: 'text', autocomplete: 'off', spellcheck: 'false', inputmode: q.input === 'num' ? 'numeric' : null,
        placeholder: q.placeholder || (q.input === 'num' ? 'Valeur, par exemple 42' : ''), 'aria-label': 'Valeur' });
      form.append($.qVal);
    }
    let first = true;
    for (const b of q.buttons) {
      const btn = el('button', { type: b.primary && first ? 'submit' : 'button', class: b.primary ? 'primary' : b.ghost ? 'ghost' : null, text: b.label });
      if (b.primary && first) { first = false; form.addEventListener('submit', e => { e.preventDefault(); quick(b); }); }
      else btn.addEventListener('click', () => quick(b));
      form.append(btn);
    }
    $.qErr = el('p', { class: 'err', hidden: true });
    side.append(el('section', { class: 'block' }, el('h2', { text: q.title || 'Opération directe' }), form, $.qErr));
  }
  $.gut = el('pre', { class: 'gutter', 'aria-hidden': 'true' });
  $.ta = el('textarea', { class: 'code', spellcheck: 'false', wrap: 'off', 'aria-label': 'Script' });
  $.err = el('p', { class: 'err', hidden: true });
  const helpBlock = cfg.help ? el('details', { class: 'help', open: cfg.helpOpen ? true : null },
    el('summary', { text: 'Syntaxe des commandes' }), el('pre', { text: cfg.help })) : null;
  side.append(el('section', { class: 'block' },
    el('h2', { html: 'Script <span class="hint">pris en compte en direct</span>' }),
    el('div', { class: 'editor' }, $.gut, $.ta), $.err, helpBlock));
  if (cfg.codes) {
    $.codeTitle = el('h2', { text: '' });
    $.listing = el('pre', { class: 'listing' });
    side.append(el('section', { class: 'block' }, $.codeTitle, $.listing));
  }
  if (cfg.note) side.append(el('section', { class: 'block' }, el('h2', { text: cfg.noteTitle || 'À retenir' }), el('p', { class: 'note', html: cfg.note })));
  $.journal = el('ol', { class: 'journal' });
  side.append(el('section', { class: 'block' }, el('h2', { html: 'Étapes <span class="hint">cliquer pour revoir</span>' }), $.journal));

  const ib = (id, cls, title, d) => {
    const b = el('button', { type: 'button', class: 'ib ' + (cls || ''), id, title, 'aria-label': title, html: `<svg viewBox="0 0 16 16"><path d="${d}"/></svg>` });
    $[id] = b; return b;
  };
  $.speed = el('input', { type: 'range', id: 'speed', min: 0, max: 4, step: 1, value: 2 });
  $.speedOut = el('output', { text: '×1' });
  $.counter = el('span', { class: 'counter', text: 'étape 0 / 0' });
  $.svg = sv('svg', { class: 'scene', preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': cfg.title });
  // contour en dégradé bleu → rouge des éléments au repos, en thème Neon (même définition que l'Atelier AVL)
  const neonStroke = sv('linearGradient', { id: 'neonStroke', x1: 0, y1: 0, x2: 1, y2: 0 }, sv('defs', {}, $.svg));
  sv('stop', { offset: 0, 'stop-color': '#0041EA' }, neonStroke); sv('stop', { offset: 1, 'stop-color': '#EA0E4C' }, neonStroke);
  $.gZ = sv('g', {}, $.svg); $.gA = sv('g', {}, $.svg); $.gI = sv('g', {}, $.svg); $.gAT = sv('g', {}, $.svg); $.gT = sv('g', {}, $.svg);
  $.empty = el('div', { class: 'empty', hidden: true, text: cfg.emptyMsg || 'Rien à afficher pour l\'instant.' });
  $.badge = el('span', { class: 'badge', text: '—' });
  $.msg = el('p', { class: 'msg', 'aria-live': 'polite' });
  $.readout = el('p', { class: 'readout', hidden: true });
  const legend = el('ul', { class: 'legend' });
  for (const [sw, label] of cfg.legend || []) legend.append(el('li', {}, sw ? el('i', { class: 'sw ' + sw }) : null, label));
  const stage = el('section', { class: 'stage', 'aria-label': 'Animation' },
    el('div', { class: 'toolbar' },
      el('div', { class: 'transport' },
        ib('bStart', 'start', 'Retour au début du script', ICON.start), ib('bFirst', '', "Début de l'opération", ICON.start),
        ib('bPrev', '', 'Étape précédente (←)', ICON.prev), ib('bPlay', 'play', 'Lecture / pause (espace)', ICON.play),
        ib('bNext', '', 'Étape suivante (→)', ICON.next), ib('bLast', '', 'Aller à la fin', ICON.last)),
      el('label', { class: 'speed', for: 'speed' }, 'Vitesse ', $.speed, ' ', $.speedOut), $.counter),
    el('div', { class: 'canvas' }, $.svg, $.empty),
    el('div', { class: 'narr' }, el('div', { class: 'msgrow' }, $.badge, $.msg), $.readout, legend));
  document.body.append(el('div', { class: 'app' }, header, el('main', { class: 'grid' }, side, stage)));
  $.playIcon = $.bPlay.querySelector('path');

  /* ---------- Modèle : chaque état intermédiaire devient une étape ---------- */
  const frames = [], journal = [];
  let ctx = { line: null, op: -1 }, lastScene = { items: [], arrows: [] };
  const A = {
    S, plural,
    op(label, line, fn) {
      ctx = { line, op: journal.length };
      const entry = { label, first: frames.length, text: '', cls: '' };
      journal.push(entry);
      const r = fn();
      if (typeof r === 'string') entry.text = r; else if (r) Object.assign(entry, r);
      if (frames.length === entry.first) A.emit(lastScene, label);
    },
    emit(scene, msg, o = {}) {
      frames.push({ scene, msg, kind: o.kind || '', code: o.code || null, codeCls: o.codeCls || 'on',
        readout: o.readout != null ? o.readout : null, line: ctx.line, op: ctx.op });
      lastScene = scene;
    },
    opt: id => !!($.opts[id] && $.opts[id].checked),
    get last() { return lastScene; },
  };
  function rebuild(list) {
    frames.length = 0; journal.length = 0; lastScene = { items: [], arrows: [] };
    cfg.build(list, A);
    if (!frames.length) { ctx = { line: null, op: -1 }; A.emit({ items: [], arrows: [] }, cfg.emptyMsg || ''); }
    renderJournal();
  }

  /* ---------- Analyse du script ---------- */
  let errLines = new Set();
  function parse(text) {
    const out = [], errs = []; errLines = new Set();
    text.split('\n').forEach((raw, i) => {
      const line = raw.replace(/(#|\/\/).*$/, '').trim();
      if (!line) return;
      const fail = m => { errs.push(`Ligne ${i + 1} : ${m}`); errLines.add(i); };
      const m = line.match(/^(\S+)\s*(.*)$/);
      let word = m[1], rest = m[2], name = LOOK[word.toLowerCase()];
      if (!name && cfg.defaultCmd && /^[-\d\[]/.test(word)) { name = cfg.defaultCmd; rest = line; }
      if (!name) return fail(`commande inconnue « ${word} ».`);
      const spec = commands[name], kind = spec.args || 'none';
      if (kind === 'text') {
        if (!rest) return fail(`il manque ${spec.argName || 'un argument'} après « ${word} ».`);
        if (spec.check) { const e = spec.check(rest); if (e) return fail(e); }
        out.push({ cmd: name, text: rest, vals: [], line: i });
        return;
      }
      const toks = rest.split(/[\s,;\[\]()]+/).filter(Boolean), vals = [];
      const lo = spec.min != null ? spec.min : -999, hi = spec.max != null ? spec.max : 999;
      for (const t of toks) {
        if (!/^-?\d+$/.test(t) || +t < lo || +t > hi) return fail(`« ${t} » n'est pas un entier entre ${lo} et ${hi}.`);
        vals.push(+t);
      }
      if (kind === 'none' && vals.length) return fail(`« ${word} » n'attend pas de valeur.`);
      if (kind === 'num' && vals.length !== 1) return fail(`« ${word} » attend exactement une valeur.`);
      if (kind === 'nums' && !vals.length) return fail(`il manque au moins une valeur après « ${word} ».`);
      if (kind === 'num?' && vals.length > 1) return fail(`« ${word} » attend au plus une valeur.`);
      if (spec.check) { const e = spec.check(vals); if (e) return fail(e); }
      out.push({ cmd: name, vals, text: rest, line: i });
    });
    return { out, errs };
  }

  /* ---------- Lecture ---------- */
  let cur = -1, playing = false, timer = 0;
  const SPEEDS = [0.25, 0.5, 1, 2, 4];
  const speed = () => SPEEDS[+$.speed.value];
  const TRANS = cfg.trans || 850, HOLD = cfg.holdBase || 650;
  const transDur = () => TRANS / speed();
  const holdDur = f => ((f && cfg.hold && cfg.hold[f.kind]) || 1.4) * HOLD / speed();
  function show(i, anim = true) {
    if (i < 0 || i >= frames.length) return;
    cur = i; render(frames[i], anim && !reduce); updateUI();
  }
  function loop() {
    clearTimeout(timer);
    if (!playing) return;
    timer = setTimeout(() => {
      if (cur < frames.length - 1) { show(cur + 1); loop(); } else { playing = false; updateUI(); }
    }, transDur() + holdDur(frames[cur]));
  }
  function play(advance = true) {
    if (!frames.length) return;
    if (cur >= frames.length - 1) { const j = journal[journal.length - 1]; show(j ? j.first : 0); }
    else if (advance) show(cur + 1);
    playing = true; loop(); updateUI();
  }
  function pause() { playing = false; clearTimeout(timer); updateUI(); }
  function opStart() {
    const f = frames[cur]; if (!f) return 0;
    const j = journal[f.op]; if (!j) return 0;
    return cur > j.first ? j.first : (journal[f.op - 1] ? journal[f.op - 1].first : 0);
  }

  let codeSet = null;
  function showCode(set) {
    if (!cfg.codes || set === codeSet || !cfg.codes[set]) return;
    codeSet = set;
    const c = cfg.codes[set];
    $.codeTitle.textContent = c.title || set;
    $.listing.innerHTML = c.lines.map(l => {
      const k = l.indexOf('//');
      return '<span>' + (k >= 0 ? esc(l.slice(0, k)) + '<i class="cm">' + esc(l.slice(k)) + '</i>' : esc(l)) + ' </span>';
    }).join('');
  }
  function updateUI() {
    const f = frames[cur];
    $.counter.textContent = `étape ${cur + 1} / ${frames.length}`;
    $.playIcon.setAttribute('d', playing ? ICON.pause : ICON.play);
    $.bPlay.setAttribute('aria-label', playing ? 'Pause' : 'Lecture');
    $.bPrev.disabled = $.bFirst.disabled = $.bStart.disabled = cur <= 0;
    $.bNext.disabled = $.bLast.disabled = cur >= frames.length - 1;
    if (!f) return;
    const k = (cfg.kinds || {})[f.kind] || { label: '—', tone: '' };
    $.badge.textContent = k.label; $.badge.className = 'badge' + (k.tone ? ' t-' + k.tone : '');
    $.msg.textContent = f.msg;
    $.readout.hidden = f.readout == null;
    if (f.readout != null) {
      if (Array.isArray(f.readout)) { $.readout.textContent = ''; f.readout.forEach((s, i) => $.readout.append(i % 2 ? el('b', { text: s }) : s)); }
      else $.readout.textContent = f.readout;
    }
    if (cfg.codes) {
      if (f.code) showCode(f.code[0]); else if (!codeSet) showCode(cfg.codeDefault || Object.keys(cfg.codes)[0]);
      const on = f.code ? [].concat(f.code[1]) : [];
      [...$.listing.children].forEach((sp, i) => sp.className = on.includes(i) ? f.codeCls : '');
      const hl = $.listing.querySelector('span.on,span.bad,span.good');
      if (hl && (hl.offsetTop < $.listing.scrollTop || hl.offsetTop > $.listing.scrollTop + $.listing.clientHeight - 20))
        $.listing.scrollTop = hl.offsetTop - 40;
    }
    [...$.journal.children].forEach((li, i) => li.classList.toggle('on', f.op === i));
    const on = $.journal.querySelector('li.on'), ol = $.journal;
    if (on && (on.offsetTop < ol.scrollTop || on.offsetTop + on.offsetHeight > ol.scrollTop + ol.clientHeight))
      ol.scrollTop = on.offsetTop - ol.clientHeight / 2;
    markGutter();
  }

  /* ---------- Rendu animé de la scène ---------- */
  const items = new Map(), arrows = new Map();
  const vb = { x: -300, y: -60, w: 600, h: 400 }; let vbFrom = { ...vb }, vbTo = { ...vb }, camFixed = false;
  let tw = { start: 0, dur: 0 }, raf = 0;

  function shapeKey(s) {
    return s.shape + '|' + (s.parts ? s.parts.map(p => (p.dot ? 'd' : '') + (p.lbl ? 'l' : '') + '.').join('') : '') + '|' + (s.dot ? 1 : 0)
      + '|' + (s.sub != null ? 1 : 0) + '|' + (s.sub2 != null ? 1 : 0);
  }
  function buildItem(st, s) {
    const g = st.g; g.textContent = '';
    st.els = {};
    if (s.shape === 'box' || s.shape === 'text') st.els.r = sv('rect', {}, g);
    else if (s.shape === 'circle') st.els.r = sv('circle', {}, g);
    else if (s.shape === 'tri') st.els.r = sv('polygon', {}, g);
    else if (s.shape === 'ground') st.els.r = sv('path', {}, g);
    else if (s.shape === 'cell') st.els.parts = s.parts.map(p => ({ r: sv('rect', {}, g), t: sv('text', {}, g),
      d: p.dot ? sv('circle', { class: 'dotc', r: 3.6 }, g) : null, l: p.lbl ? sv('text', { class: 'plbl' }, g) : null }));
    if (s.shape !== 'cell' && s.shape !== 'ground') st.els.t = sv('text', {}, g);
    if (s.dot) st.els.d = sv('circle', { class: 'dotc', r: 3.6 }, g);
    if (s.sub != null) st.els.sub = sv('text', { class: 'sub' }, g);
    if (s.sub2 != null) st.els.sub2 = sv('text', { class: 'sub' }, g);
    st.key = shapeKey(s);
  }
  function updateItem(st, s) {
    if (st.key !== shapeKey(s)) buildItem(st, s);
    st.g.setAttribute('class', 'it ' + s.shape + (s.cls ? ' ' + s.cls : ''));
    const E = st.els;
    if (E.t) {
      E.t.textContent = s.t == null ? '' : s.t;
      E.t.setAttribute('class', s.tc || '');
      if (s.fs) E.t.style.fontSize = s.fs + 'px'; else E.t.style.fontSize = '';
      E.t.style.textAnchor = s.shape === 'text' ? (s.align === 'start' ? 'start' : s.align === 'end' ? 'end' : 'middle') : 'middle';
    }
    if (E.parts) s.parts.forEach((p, i) => {
      E.parts[i].t.textContent = p.t == null ? '' : p.t;
      E.parts[i].r.setAttribute('class', p.cls || '');
      E.parts[i].t.setAttribute('class', p.tc || '');
      if (E.parts[i].l) E.parts[i].l.textContent = p.lbl;
    });
    if (E.sub) { E.sub.textContent = s.sub; E.sub.setAttribute('class', 'sub' + (s.subCls ? ' ' + s.subCls : '')); }
    if (E.sub2) { E.sub2.textContent = s.sub2; E.sub2.setAttribute('class', 'sub' + (s.sub2Cls ? ' ' + s.sub2Cls : '')); }
    st.spec = s;
  }
  function drawItem(st) {
    const s = st.spec, c = st.cur, E = st.els, w = Math.max(0, c.w), h = Math.max(0, c.h);
    st.g.setAttribute('transform', `translate(${c.x.toFixed(2)} ${c.y.toFixed(2)})`);
    st.g.style.opacity = Math.max(0, Math.min(1, c.o)).toFixed(3);
    if (s.shape === 'box' || s.shape === 'text') {
      E.r.setAttribute('width', w.toFixed(2)); E.r.setAttribute('height', h.toFixed(2)); E.r.setAttribute('rx', s.rx != null ? s.rx : 7);
    } else if (s.shape === 'circle') {
      E.r.setAttribute('cx', (w / 2).toFixed(2)); E.r.setAttribute('cy', (h / 2).toFixed(2)); E.r.setAttribute('r', (Math.min(w, h) / 2).toFixed(2));
    } else if (s.shape === 'tri') {
      E.r.setAttribute('points', `${(w / 2).toFixed(2)},0 ${w.toFixed(2)},${h.toFixed(2)} 0,${h.toFixed(2)}`);
    } else if (s.shape === 'ground') {
      let d = '';
      if (s.dir === 'down') { d = `M0 0 H${w.toFixed(2)}`; for (let k = 0; k < 4; k++) { const x = 3 + k * (w - 6) / 3; d += ` M${x.toFixed(2)} 0 l-5 ${h.toFixed(2)}`; } }
      else { d = `M0 0 V${h.toFixed(2)}`; for (let k = 0; k < 4; k++) { const y = 3 + k * (h - 6) / 3; d += ` M0 ${y.toFixed(2)} l${w.toFixed(2)} 5`; } }
      E.r.setAttribute('d', d);
    }
    if (E.d) { E.d.setAttribute('cx', (w - 11).toFixed(2)); E.d.setAttribute('cy', (h / 2).toFixed(2)); }
    if (E.t) {
      const tx = s.shape === 'text' ? (s.align === 'start' ? 0 : s.align === 'end' ? w : w / 2) : s.dot ? w / 2 - 7 : w / 2;
      E.t.setAttribute('x', tx.toFixed(2)); E.t.setAttribute('y', (s.shape === 'tri' ? h * 0.68 : h / 2).toFixed(2));
    }
    if (E.parts) {
      const tot = s.parts.reduce((a, p) => a + p.w, 0) || 1; let x = 0;
      s.parts.forEach((p, i) => {
        const pw = p.w / tot * w;
        E.parts[i].r.setAttribute('x', x.toFixed(2)); E.parts[i].r.setAttribute('width', pw.toFixed(2));
        E.parts[i].r.setAttribute('y', 0); E.parts[i].r.setAttribute('height', h.toFixed(2)); E.parts[i].r.setAttribute('rx', 3);
        E.parts[i].t.setAttribute('x', (x + pw / 2 - (p.dot ? 7 : 0)).toFixed(2)); E.parts[i].t.setAttribute('y', (h / 2).toFixed(2));
        if (E.parts[i].d) { E.parts[i].d.setAttribute('cx', (x + pw - 11).toFixed(2)); E.parts[i].d.setAttribute('cy', (h / 2).toFixed(2)); }
        if (E.parts[i].l) { E.parts[i].l.setAttribute('x', (x + pw / 2).toFixed(2)); E.parts[i].l.setAttribute('y', '-8'); }
        x += pw;
      });
    }
    const subAt = (t, pos) => {
      if (!t) return;
      const P = { below: [w / 2, h + 14, 'middle'], above: [w / 2, -11, 'middle'], left: [-8, h / 2, 'end'], right: [w + 8, h / 2, 'start'],
        'above-left': [0, -11, 'start'], 'below-left': [0, h + 14, 'start'] }[pos || 'below'];
      t.setAttribute('x', P[0].toFixed(2)); t.setAttribute('y', P[1].toFixed(2)); t.style.textAnchor = P[2];
    };
    subAt(E.sub, s.subPos); subAt(E.sub2, s.sub2Pos || 'above');
  }

  /* Points d'accroche d'une flèche */
  function geom(key, which) {
    const st = items.get(key);
    if (!st) return null;
    const r = which === 'to' ? st.to : st.cur;
    return { r, s: st.spec };
  }
  function partCenter(G, i) {
    const tot = G.s.parts.reduce((a, p) => a + p.w, 0) || 1; let x = 0;
    for (let j = 0; j < i; j++) x += G.s.parts[j].w / tot * G.r.w;
    return { x: G.r.x + x + G.s.parts[i].w / tot * G.r.w / 2, y: G.r.y + G.r.h / 2 };
  }
  function dotPt(G, part) {
    if (part == null) return { x: G.r.x + G.r.w - 11, y: G.r.y + G.r.h / 2 };
    const tot = G.s.parts.reduce((a, p) => a + p.w, 0) || 1; let x = 0;
    for (let j = 0; j <= part; j++) x += G.s.parts[j].w / tot * G.r.w;
    return { x: G.r.x + x - 11, y: G.r.y + G.r.h / 2 };
  }
  function sidePt(G, side) {
    const { x, y, w, h } = G.r;
    return { t: { x: x + w / 2, y }, b: { x: x + w / 2, y: y + h }, l: { x, y: y + h / 2 }, r: { x: x + w, y: y + h / 2 },
      tl: { x: x + w * 0.25, y }, tr: { x: x + w * 0.75, y }, bl: { x: x + w * 0.25, y: y + h }, br: { x: x + w * 0.75, y: y + h } }[side];
  }
  function clip(G, toward, gap) {
    const { x, y, w, h } = G.r, cx = x + w / 2, cy = y + h / 2;
    let dx = toward.x - cx, dy = toward.y - cy; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    let t;
    if (G.s.shape === 'circle') t = Math.min(w, h) / 2;
    else t = Math.min(Math.abs(dx) > 1e-6 ? (w / 2) / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? (h / 2) / Math.abs(dy) : Infinity);
    return { x: cx + dx * (t + gap), y: cy + dy * (t + gap) };
  }
  function resolve(a, which) {
    const G1 = a.from.k != null ? geom(a.from.k, which) : null, G2 = a.to.k != null ? geom(a.to.k, which) : null;
    if ((a.from.k != null && !G1) || (a.to.k != null && !G2)) return null;
    const base = (G, end) => end.dot ? dotPt(G, end.part) : end.part != null ? partCenter(G, end.part) : end.side ? sidePt(G, end.side) : { x: G.r.x + G.r.w / 2, y: G.r.y + G.r.h / 2 };
    let p1 = G1 ? base(G1, a.from) : { x: a.from.x, y: a.from.y };
    let p2 = G2 ? base(G2, a.to) : { x: a.to.x, y: a.to.y };
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2, dx = p2.x - p1.x, dy = p2.y - p1.y;
    let c = a.ctrl ? { x: mx + (a.ctrl.dx || 0), y: my + (a.ctrl.dy || 0) } : { x: mx - dy * (a.bend || 0), y: my + dx * (a.bend || 0) };
    if (a.elbow) c = a.elbow === 'vh' ? { x: p1.x, y: p2.y } : { x: p2.x, y: p1.y };
    if (G1 && a.from.part == null && !a.from.side && !a.from.dot) p1 = clip(G1, c, 1);
    if (G2 && !a.to.side) p2 = clip(G2, c, 2);
    return { p1, c, p2 };
  }
  const lerpP = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k) });
  const lerpG = (a, b, k) => ({ p1: lerpP(a.p1, b.p1, k), c: lerpP(a.c, b.c, k), p2: lerpP(a.p2, b.p2, k) });
  function drawArrow(st) {
    const G = st.drawn; if (!G) { st.g.style.opacity = 0; return; }
    const g = Math.max(0, Math.min(1, st.grow));
    if (st.spec.elbow) {
      /* flèche coudée : deux segments droits, p1 → coude → p2 */
      const l1 = Math.hypot(G.c.x - G.p1.x, G.c.y - G.p1.y), l2 = Math.hypot(G.p2.x - G.c.x, G.p2.y - G.c.y), len = g * (l1 + l2);
      let a = G.p1, b, end;
      if (len <= l1 || l2 < 1e-3) { b = null; end = lerpP(G.p1, G.c, l1 ? Math.min(1, len / l1) : 1); a = G.p1; }
      else { b = G.c; end = lerpP(G.c, G.p2, Math.min(1, (len - l1) / l2)); a = G.c; }
      let ex = end.x - a.x, ey = end.y - a.y, EL = Math.hypot(ex, ey) || 1; ex /= EL; ey /= EL;
      const hd = 9, wd = 4.6, bs = { x: end.x - ex * hd, y: end.y - ey * hd };
      st.path.setAttribute('d', `M${G.p1.x.toFixed(2)} ${G.p1.y.toFixed(2)}${b ? ` L${b.x.toFixed(2)} ${b.y.toFixed(2)}` : ''} L${bs.x.toFixed(2)} ${bs.y.toFixed(2)}`);
      st.head.setAttribute('points', `${end.x.toFixed(2)},${end.y.toFixed(2)} ${(bs.x - ey * wd).toFixed(2)},${(bs.y + ex * wd).toFixed(2)} ${(bs.x + ey * wd).toFixed(2)},${(bs.y - ex * wd).toFixed(2)}`);
      st.g.style.opacity = Math.max(0, Math.min(1, st.o)).toFixed(3);
      return;
    }
    const q1 = lerpP(G.p1, G.c, g), q2 = lerpP(lerpP(G.p1, G.c, g), lerpP(G.c, G.p2, g), g);
    let dx = q2.x - q1.x, dy = q2.y - q1.y, L = Math.hypot(dx, dy);
    if (L < 1e-3) { dx = G.p2.x - G.p1.x; dy = G.p2.y - G.p1.y; L = Math.hypot(dx, dy) || 1; }
    dx /= L; dy /= L;
    const head = st.spec.nohead ? 0 : 9, wdt = 4.6;
    const base = { x: q2.x - dx * head, y: q2.y - dy * head };
    st.path.setAttribute('d', `M${G.p1.x.toFixed(2)} ${G.p1.y.toFixed(2)} Q${q1.x.toFixed(2)} ${q1.y.toFixed(2)} ${base.x.toFixed(2)} ${base.y.toFixed(2)}`);
    if (head) st.head.setAttribute('points', `${q2.x.toFixed(2)},${q2.y.toFixed(2)} ${(base.x - dy * wdt).toFixed(2)},${(base.y + dx * wdt).toFixed(2)} ${(base.x + dy * wdt).toFixed(2)},${(base.y - dx * wdt).toFixed(2)}`);
    else st.head.setAttribute('points', '');
    if (st.label) {
      const m = lerpP(lerpP(G.p1, G.c, 0.5), lerpP(G.c, G.p2, 0.5), 0.5);
      const off = st.spec.labelOff || 10;
      st.label.setAttribute('x', (m.x - dy * off).toFixed(2)); st.label.setAttribute('y', (m.y + dx * off).toFixed(2));
      st.label.style.opacity = g > 0.95 ? 1 : 0;
    }
    st.g.style.opacity = Math.max(0, Math.min(1, st.o)).toFixed(3);
  }

  function bounds(scene) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); };
    for (const s of scene.items || []) {
      if (s.nobounds) continue;
      if (s.parts && s.parts.some(p => p.lbl)) add(s.x, s.y - 18);
      add(s.x, s.y - (s.sub2 != null || s.subPos === 'above' || s.subPos === 'above-left' ? 18 : 0));
      add(s.x + s.w, s.y + s.h + (s.sub != null && (!s.subPos || s.subPos === 'below' || s.subPos === 'below-left') ? 20 : 0));
      if (s.sub != null && s.subPos === 'left') add(s.x - 10 - String(s.sub).length * 7, s.y);
      if (s.sub != null && s.subPos === 'right') add(s.x + s.w + 10 + String(s.sub).length * 7, s.y);
      if (s.shape === 'text' && !s.w) { const tw = String(s.t).length * 8; add(s.x - (s.align === 'start' ? 0 : s.align === 'end' ? tw : tw / 2), s.y); add(s.x + (s.align === 'start' ? tw : s.align === 'end' ? 0 : tw / 2), s.y + s.h); }
    }
    for (const a of scene.arrows || []) { const R = resolve(a, 'to'); if (R) { add(R.c.x, R.c.y); } }
    if (x0 === Infinity) return null;
    return { x0, y0, x1, y1 };
  }
  function targetVB(scene) {
    const r = $.svg.getBoundingClientRect(), asp = r.width && r.height ? r.width / r.height : 1.6;
    let B = scene.view ? { x0: scene.view.x, y0: scene.view.y, x1: scene.view.x + scene.view.w, y1: scene.view.y + scene.view.h } : bounds(scene);
    if (!B) return { ...vbTo };
    const pad = scene.view ? 0 : (cfg.pad || 34);
    let w = Math.max(B.x1 - B.x0 + 2 * pad, cfg.minW || 520), h = Math.max(B.y1 - B.y0 + 2 * pad, cfg.minH || 300);
    if (w / h < asp) w = h * asp; else h = w / asp;
    return { x: (B.x0 + B.x1) / 2 - w / 2, y: (B.y0 + B.y1) / 2 - h / 2, w, h, l: B.x0 - pad, r: B.x1 + pad, t: B.y0 - pad, b: B.y1 + pad };
  }
  /* Cadrage calme : on agrandit dès que la scène ne tient plus, on ne rétrécit que si elle devient nettement plus petite. */
  function cameraTarget(scene) {
    const need = targetVB(scene), c = vbTo;
    if (scene.view || cfg.camera === 'fit') return need;
    const same = Math.abs(c.w / c.h - need.w / need.h) < 0.01;
    if (!same || need.w > c.w + 0.5 || need.w < c.w * 0.72) return need;
    let x = c.x, y = c.y;
    if (need.l < x) x = need.l; else if (need.r > x + c.w) x = need.r - c.w;
    if (need.t < y) y = need.t; else if (need.b > y + c.h) y = need.b - c.h;
    return { ...c, x, y };
  }

  function render(f, anim) {
    const sc = f.scene || { items: [], arrows: [] };
    const dur = anim ? transDur() : 0;
    const seen = new Set();
    for (const st of items.values()) { st.from = { ...st.cur }; }
    for (const s of sc.items || []) {
      seen.add(s.k);
      let st = items.get(s.k), fresh = false;
      if (!st || st.dead && st.cur.o < 0.05) {
        if (st) st.g.remove();
        st = { g: sv('g', {}, (s.layer === 'back' ? $.gZ : s.layer === 'top' ? $.gT : $.gI)), key: '' };
        items.set(s.k, st); fresh = true; st.fresh = true;
      }
      updateItem(st, s);
      const o = s.o != null ? s.o : /mute/.test(s.cls || '') ? 0.4 : 1;
      if (fresh) {
        const src = s.enter != null && items.get(s.enter);
        if (src && !src.fresh) {
          const r = src.cur;
          st.cur = { x: r.x + r.w / 2 - s.w / 2, y: r.y + r.h / 2 - s.h / 2, w: s.w, h: s.h, o: 0.001 };
          st.fly = true;
        } else { st.cur = { x: s.x, y: s.y - (s.drop != null ? s.drop : 10), w: s.w, h: s.h, o: 0 }; st.fly = false; }
        st.from = { ...st.cur };
      } else st.fly = false;
      st.to = { x: s.x, y: s.y, w: s.w, h: s.h, o };
      st.dead = false;
    }
    for (const [k, st] of items) if (!seen.has(k)) {
      const ex = sc.exits && sc.exits[k] != null && items.get(sc.exits[k]);
      st.to = ex ? { ...ex.to, x: ex.to.x + ex.to.w / 2 - st.cur.w / 2, y: ex.to.y + ex.to.h / 2 - st.cur.h / 2, w: st.cur.w, h: st.cur.h, o: 0 } : { ...st.cur, o: 0 };
      st.dead = true; st.exitFly = !!ex;
    }
    for (const st of items.values()) st.fresh = false;

    const seenA = new Set();
    for (const a of sc.arrows || []) {
      seenA.add(a.k);
      let st = arrows.get(a.k);
      if (st && st.dead && st.o < 0.05) { st.g.remove(); arrows.delete(a.k); st = null; }
      if (!st) {
        const g = sv('g', {}, a.from.dot || a.top ? $.gAT : $.gA);
        st = { g, path: sv('path', {}, g), head: sv('polygon', {}, g), label: null, drawn: null, grow: 0, o: 1, isNew: true };
        arrows.set(a.k, st);
      } else st.isNew = false;
      if (a.label && !st.label) st.label = sv('text', {}, st.g);
      if (!a.label && st.label) { st.label.remove(); st.label = null; }
      if (st.label) st.label.textContent = a.label;
      st.g.setAttribute('class', 'ar' + (a.cls ? ' ' + a.cls : a.from.dot ? ' ink' : ''));
      st.spec = a; st.dead = false;
      st.start = st.drawn ? { p1: { ...st.drawn.p1 }, c: { ...st.drawn.c }, p2: { ...st.drawn.p2 } } : null;
      st.fgrow = st.grow; st.fo = st.o;
      if (st.isNew) st.grow = st.fgrow = 0;
    }
    for (const [k, st] of arrows) if (!seenA.has(k)) { st.dead = true; st.fo = st.o; st.start = st.drawn; }

    vbFrom = { ...vb }; vbTo = cameraTarget(sc);
    $.empty.hidden = !!(sc.items && sc.items.length);
    $.svg.style.setProperty('--t', Math.round(dur * 0.7) + 'ms');
    $.svg.style.setProperty('--td', Math.round(dur * 0.12) + 'ms');
    tw = { start: performance.now(), dur };
    if (dur === 0) { cancelAnimationFrame(raf); raf = 0; step(tw.start); }
    else if (!raf) raf = requestAnimationFrame(step);
  }

  /* Chorégraphie (p de 0 à 1) : ce qui disparaît s'efface (0 → 0,35), les éléments se déplacent (0,08 → 1),
     les nouveaux apparaissent (0,4 → 1) et les nouvelles flèches se dessinent (0,45 → 0,95). */
  function step(now) {
    const p = tw.dur > 0 ? Math.min(1, (now - tw.start) / tw.dur) : 1;
    const kMove = ph(p, 0.08, 1), kOut = ph(p, 0, 0.35), kIn = ph(p, 0.4, 1), kDraw = ph(p, 0.45, 0.95);
    for (const st of items.values()) {
      const F = st.from, T = st.to;
      const appearing = !st.dead && F.o < 0.05 && T.o > 0;
      const k = appearing && !st.fly ? kIn : kMove;
      st.cur = { x: lerp(F.x, T.x, k), y: lerp(F.y, T.y, k), w: lerp(F.w, T.w, k), h: lerp(F.h, T.h, k),
        o: st.dead ? lerp(F.o, 0, st.exitFly ? ph(p, 0.6, 1) : kOut) : appearing ? lerp(F.o, T.o, st.fly ? ph(p, 0, 0.3) : kIn) : lerp(F.o, T.o, kMove) };
      drawItem(st);
    }
    for (const st of arrows.values()) {
      const target = resolve(st.spec, 'cur');
      if (st.dead) {
        if (target) st.drawn = target;
        st.o = lerp(st.fo, 0, kOut);
      } else {
        if (!target) { st.o = 0; } else {
          st.drawn = st.start && !st.isNew ? lerpG(st.start, target, kMove) : target;
          st.grow = st.isNew ? lerp(st.fgrow, 1, kDraw) : 1;
          st.o = st.isNew ? 1 : lerp(st.fo, 1, kMove);
        }
      }
      drawArrow(st);
    }
    const kCam = ph(p, 0.05, 0.95);
    for (const c of ['x', 'y', 'w', 'h']) vb[c] = lerp(vbFrom[c], vbTo[c], kCam);
    $.svg.setAttribute('viewBox', `${vb.x.toFixed(2)} ${vb.y.toFixed(2)} ${vb.w.toFixed(2)} ${vb.h.toFixed(2)}`);
    if (p < 1) { raf = requestAnimationFrame(step); return; }
    raf = 0;
    for (const [k, st] of items) if (st.dead) { st.g.remove(); items.delete(k); }
    for (const [k, st] of arrows) { if (st.dead) { st.g.remove(); arrows.delete(k); } else st.isNew = false; }
  }
  new ResizeObserver(() => {
    if (cur < 0 || !frames[cur]) return;
    const t = targetVB(frames[cur].scene || {});
    vbTo = t;
    if (!raf) { Object.assign(vb, t); $.svg.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`); }
  }).observe($.svg);

  /* ---------- Journal et éditeur ---------- */
  function renderJournal() {
    const ol = $.journal; ol.innerHTML = '';
    journal.forEach((j, i) => {
      const b = el('button', { type: 'button', title: j.label }, el('code', { text: j.label }), el('span', { class: j.cls || null, text: j.text || '' }));
      b.dataset.i = i;
      ol.append(el('li', {}, b));
    });
    ol.scrollTop = ol.scrollHeight;
  }
  $.journal.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    pause(); show(journal[+b.dataset.i].first);
  });
  const ta = $.ta, gut = $.gut;
  function renderGutter() {
    const n = ta.value.split('\n').length; let html = '';
    for (let i = 0; i < n; i++) html += `<span data-l="${i}">${i + 1}</span>`;
    gut.innerHTML = html + '<span class="pad"></span>';
    markGutter();
  }
  function markGutter() {
    const f = frames[cur], act = f && f.line != null ? f.line : -1;
    for (const s of gut.children) {
      if (!s.dataset.l) continue;
      const l = +s.dataset.l;
      s.classList.toggle('on', l === act);
      s.classList.toggle('bad', errLines.has(l));
    }
    if (act >= 0 && document.activeElement !== ta) {
      const top = act * 20;
      if (top < ta.scrollTop || top > ta.scrollTop + ta.clientHeight - 40) ta.scrollTop = top - 40;
    }
    gut.scrollTop = ta.scrollTop;
  }
  ta.addEventListener('scroll', () => { gut.scrollTop = ta.scrollTop; });
  const STORE = `${ID}-script-v1`;
  const save = () => { try { localStorage.setItem(STORE, ta.value); } catch (e) {} };

  /* Relit le script et reconstruit la chronologie. Les opérations inchangées gardent leurs étapes :
     le lecteur reste où il était, ou recule juste avant la première opération modifiée. */
  function sync(anim = true) {
    const { out, errs } = parse(ta.value);
    $.err.hidden = !errs.length; $.err.textContent = errs.join('\n');
    if (errs.length && frames.length) { markGutter(); return -1; }
    const oldLabels = journal.map(j => j.label), oldCur = cur;
    const oldOp = frames[cur] ? frames[cur].op : 0;
    rebuild(errs.length ? [] : out);
    let k = 0;
    while (k < oldLabels.length && k < journal.length && oldLabels[k] === journal[k].label) k++;
    const target = oldOp < k ? oldCur : (k < journal.length ? journal[k].first - 1 : frames.length - 1);
    cur = -1;
    show(Math.max(0, Math.min(target, frames.length - 1)), anim);
    return errs.length ? -1 : k;
  }
  let syncTimer = 0;
  ta.addEventListener('input', () => { renderGutter(); save(); clearTimeout(syncTimer); syncTimer = setTimeout(() => sync(), 450); });
  ta.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); } });

  /* ---------- Opérations directes : elles ajoutent une ligne au script, puis la jouent ---------- */
  function appendLine(text) {
    clearTimeout(syncTimer);
    ta.value = ta.value.replace(/\s*$/, '') + '\n' + text + '\n';
    ta.scrollTop = ta.scrollHeight;
    renderGutter(); save();
    const k = sync();
    if (k >= 0 && k < journal.length) { show(journal[k].first); play(false); }
  }
  function quick(b) {
    let line;
    if (b.line) line = b.line(A);
    else if (b.arg) {
      const raw = $.qVal.value.trim(), q = cfg.quick;
      let bad = '';
      if (q.input === 'num') { if (!/^-?\d+$/.test(raw) || Math.abs(+raw) > 999) bad = 'Entrez un entier entre −999 et 999.'; }
      else if (!raw) bad = 'Saisissez une valeur.';
      if (!bad && q.check) bad = q.check(raw) || '';
      $.qErr.hidden = !bad; $.qErr.textContent = bad;
      if (bad) { $.qVal.focus(); return; }
      line = `${b.cmd} ${q.input === 'num' ? +raw : raw}`;
      $.qVal.select();
    } else line = b.cmd;
    if ($.qErr) $.qErr.hidden = true;
    if (line) appendLine(line);
  }

  /* ---------- Commandes de lecture ---------- */
  $.bStart.addEventListener('click', () => { pause(); show(0); });
  $.bPlay.addEventListener('click', () => playing ? pause() : play());
  $.bPrev.addEventListener('click', () => { pause(); show(cur - 1); });
  $.bNext.addEventListener('click', () => { pause(); show(cur + 1); });
  $.bFirst.addEventListener('click', () => { pause(); show(opStart()); });
  $.bLast.addEventListener('click', () => { pause(); show(frames.length - 1); });
  $.speed.addEventListener('input', () => { $.speedOut.textContent = '×' + String(speed()).replace('.', ','); if (playing) loop(); });
  document.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea,select')) return;
    if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); playing ? pause() : play(); }
    else if (e.key === 'ArrowRight') { pause(); show(cur + 1); }
    else if (e.key === 'ArrowLeft') { pause(); show(cur - 1); }
  });

  /* ---------- Options ---------- */
  for (const [id, cb] of Object.entries($.opts)) cb.addEventListener('change', () => {
    try { localStorage.setItem(`${ID}-opt-${id}`, cb.checked ? '1' : '0'); } catch (e) {}
    const op = frames[cur] ? frames[cur].op : 0, off = frames[cur] && journal[op] ? cur - journal[op].first : 0;
    pause(); rebuild(parse(ta.value).out); cur = -1;
    const j = journal[op];
    show(j ? Math.min(j.first + Math.max(0, off), (journal[op + 1] ? journal[op + 1].first : frames.length) - 1) : 0, false);
  });
  $.theme.value = document.documentElement.dataset.theme || 'auto';
  $.theme.addEventListener('change', () => {
    const t = $.theme.value;
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
  });

  /* ---------- Démarrage : le script d'exemple est construit, le lecteur se place sur la première opération ---------- */
  let saved = null;
  try { saved = localStorage.getItem(STORE); } catch (e) {}
  ta.value = saved && saved.trim() ? saved : cfg.example;
  renderGutter();
  sync(false);
  const startOp = cfg.startOp != null ? cfg.startOp : 1;
  show(journal[startOp] ? Math.max(0, journal[startOp].first - 1) : 0, false);
  if (cfg.codes && !codeSet) { showCode(cfg.codeDefault || Object.keys(cfg.codes)[0]); updateUI(); }
  /* accès de contrôle (tests) : afficher une étape sans animation */
  window.__atelier = { frames, journal, show: i => { pause(); show(i, false); }, get cur() { return cur; } };
  return A;
}

window.Atelier = { init, S, plural };
})();
