/* TI301 — Projet « La forêt et la lumière », partie 1.
   - thème clair / sombre (mémorisé, même clé que les Ateliers TI301)
   - figure de l'exemple dessinée en SVG à partir des données (prête à être animée)
   - liens de survol figure <-> tableau, sommaire actif, boutons « Copier », coloration du code C */

const THEME_KEY = 'ateliers-ti301-theme';
try { const t = localStorage.getItem(THEME_KEY); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; } catch (e) {}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

/* ------------------------------------------------------------------
   L'arbre de l'exemple : même contenu que exemple1.txt
   (saison, parent, direction, longueur), pied en (4,5 ; 1,0).
   ------------------------------------------------------------------ */
const EXEMPLE = {
  pied: { x: 4.5, y: 1.0 },
  lignes: [
    [1, 0, 0, 1.0], [1, 0, -45, 0.8], [2, 1, 5, 1.0], [2, 1, 50, 0.8], [2, 1, -40, 0.7],
    [3, 3, 0, 1.0], [3, 2, -50, 0.6], [4, 6, -5, 0.9], [4, 6, 45, 0.7],
  ],
};

/* Équivalent JS de lire_arbre / pousser_rameau : renvoie le tableau des rameaux par numéro. */
function construireArbre({ pied, lignes }) {
  const rameaux = [{ num: 0, x: pied.x, y: pied.y, dir: 0, saison: 0, gen: 0, parent: -1, fils: [] }];
  for (const [saison, p, dir, l] of lignes) {
    const par = rameaux[p];
    const t = dir * Math.PI / 180;
    const r = { num: rameaux.length, x: par.x + l * Math.sin(t), y: par.y + l * Math.cos(t),
                dir, saison, gen: par.gen + 1, parent: p, fils: [] };
    par.fils.push(r.num);
    rameaux.push(r);
  }
  for (const r of rameaux) r.etat = r.fils.length ? 'bois' : 'bourgeon';
  return rameaux;
}

/* Disposition de l'arbre informatique : les feuilles côte à côte (parcours en profondeur),
   chaque nœud interne au milieu de ses fils. */
function disposer(rameaux) {
  let feuille = 0;
  (function place(i) {
    const r = rameaux[i];
    if (!r.fils.length) { r.col = feuille++; return; }
    r.fils.forEach(place);
    r.col = r.fils.reduce((s, f) => s + rameaux[f].col, 0) / r.fils.length;
  })(0);
  return feuille;
}

function dessinerExemple(host) {
  const rameaux = construireArbre(EXEMPLE);
  const nbFeuilles = disposer(rameaux);
  const hauteur = Math.max(...rameaux.map(r => r.gen));

  const W = 1140, H = 560;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img' });
  svg.appendChild(Object.assign(document.createElementNS(SVG_NS, 'title'),
    { textContent: "L'arbre de l'exemple, de profil et sous forme d'arbre informatique" }));

  /* --- Vue de profil --- */
  const X0 = 3, X1 = 7, Y1 = 5.3;                    // fenêtre en unités de l'arbre
  const L = 70, R = 527, T = 40, B = 492;            // fenêtre en pixels
  const px = x => L + (x - X0) / (X1 - X0) * (R - L);
  const py = y => B - y / Y1 * (B - T);

  svgEl('text', { x: 22, y: 30, class: 'title' }, svg).textContent = 'De profil (dans la forêt)';
  const grid = svgEl('g', { class: 'grid' }, svg);
  for (let y = 0; y <= 5; y++) {
    svgEl('line', { x1: L, x2: R, y1: py(y), y2: py(y) }, grid);
    svgEl('text', { x: 14, y: py(y) + 4, class: 'axis-t' }, svg).textContent = `y = ${y}`;
  }
  for (let x = X0 + 1; x < X1; x++) svgEl('line', { x1: px(x), x2: px(x), y1: T, y2: B }, grid);
  for (let c = X0; c < X1; c++) {
    const t = svgEl('text', { x: px(c + .5), y: B + 24, class: 'axis-t', 'text-anchor': 'middle' }, svg);
    t.textContent = `colonne ${c}`;
  }
  svgEl('line', { x1: L, x2: R, y1: B, y2: B, class: 'sol' }, svg);

  const profil = svgEl('g', { class: 'profil' }, svg);
  const vueProfil = [];
  // le pied part du sol, les autres rameaux de l'extrémité de leur parent
  for (const r of rameaux) {
    const base = r.parent < 0 ? { x: r.x, y: 0 } : rameaux[r.parent];
    const g = svgEl('g', { class: `r ${r.etat}`, 'data-r': r.num, 'data-saison': r.saison }, profil);
    svgEl('line', { x1: px(base.x), y1: py(base.y), x2: px(r.x), y2: py(r.y), class: 'seg', pathLength: 1 }, g);
    vueProfil[r.num] = g;
  }
  // les extrémités par-dessus tous les segments
  for (const r of rameaux) {
    const g = vueProfil[r.num];
    const bud = r.etat === 'bourgeon';
    const c = svgEl('circle', { cx: px(r.x), cy: py(r.y), r: bud ? 8 : 4, class: bud ? 'dot-bud' : 'dot-wood' });
    profil.appendChild(g); g.appendChild(c);
    const lx = r.dir < -20 || (bud && r.dir < 0) ? -24 : 12;
    svgEl('text', { x: px(r.x) + lx, y: py(r.y) + 5, class: 'lab' }, g).textContent = r.num;
  }
  // légende
  svgEl('circle', { cx: 80, cy: 534, r: 7, class: 'dot-bud' }, svg);
  svgEl('text', { x: 94, y: 539, class: 'axis-t', style: 'font-size:14px;fill:#1E2420' }, svg).textContent = 'bourgeon';
  svgEl('circle', { cx: 206, cy: 534, r: 4, class: 'dot-wood' }, svg);
  svgEl('text', { x: 216, y: 539, class: 'axis-t', style: 'font-size:14px;fill:#1E2420' }, svg).textContent = 'bois';

  svgEl('line', { x1: 573, x2: 573, y1: 20, y2: 525, class: 'sep' }, svg);

  /* --- Arbre informatique --- */
  svgEl('text', { x: 618, y: 30, class: 'title' }, svg).textContent = 'Arbre informatique';
  const TL = 630, TR = 1010, TT = 92, TB = 482;
  const tx = c => TL + c / (nbFeuilles - 1) * (TR - TL);
  const ty = g => TT + g / hauteur * (TB - TT);
  for (let g = 0; g <= hauteur; g++) {
    svgEl('text', { x: 1046, y: ty(g) + 4, class: 'axis-t' }, svg).textContent = `génération ${g}`;
  }
  const arbre = svgEl('g', { class: 'info' }, svg);
  const aretes = svgEl('g', {}, arbre);
  const vueInfo = [], vueArete = [];
  for (const r of rameaux) {
    if (r.parent >= 0) {
      const p = rameaux[r.parent];
      vueArete[r.num] = svgEl('line', { x1: tx(p.col), y1: ty(p.gen), x2: tx(r.col), y2: ty(r.gen), class: 'edge', 'data-r': r.num }, aretes);
    }
  }
  for (const r of rameaux) {
    const g = svgEl('g', { class: `r node ${r.etat === 'bois' ? 'wood' : 'bud'}`, 'data-r': r.num, 'data-saison': r.saison }, arbre);
    svgEl('circle', { cx: tx(r.col), cy: ty(r.gen), r: 21 }, g);
    svgEl('text', { x: tx(r.col), y: ty(r.gen) }, g).textContent = r.num;
    vueInfo[r.num] = g;
  }

  host.appendChild(svg);

  /* --- Survol : rameau de profil <-> nœud <-> ligne du tableau --- */
  const lignesTab = document.querySelectorAll('#tabExemple tbody tr');
  function surligner(n, on) {
    if (n == null || isNaN(n)) return;
    vueProfil[n]?.classList.toggle('hl', on);
    vueInfo[n]?.classList.toggle('hl', on);
    vueArete[n]?.classList.toggle('hl', on);
    lignesTab[n]?.classList.toggle('hl', on);
  }
  for (const zone of [svg, document.querySelector('#tabExemple tbody')]) {
    if (!zone) continue;
    zone.addEventListener('pointerover', e => surligner(+e.target.closest('[data-r]')?.dataset.r, true));
    zone.addEventListener('pointerout', e => surligner(+e.target.closest('[data-r]')?.dataset.r, false));
  }

  // exposé pour de futures animations (ex. pousse saison par saison)
  window.figureExemple = { svg, rameaux, vueProfil, vueInfo, vueArete };
}

/* ------------------------------------------------------------------
   Coloration minimale du code C (commentaires et mots-clés)
   ------------------------------------------------------------------ */
const MOTS_C = /\b(typedef|struct|enum|int|float|double|short|unsigned|char|void|static|const|return|for|if|while|else|FILE|NULL|uint64_t)\b/g;
function colorerC(code) {
  // ne traite pas les blocs qui contiennent déjà du balisage (pseudo-code, trous)
  if (code.children.length) return;
  const html = code.innerHTML.split('\n').map(ligne => {
    const i = ligne.indexOf('//');
    const [avant, com] = i >= 0 ? [ligne.slice(0, i), ligne.slice(i)] : [ligne, ''];
    // ne colore pas l'intérieur des chaînes "..."
    const morceaux = avant.split(/("(?:[^"\\]|\\.)*")/);
    const av = morceaux.map((m, k) => k % 2 ? m : m.replace(MOTS_C, '<span class="kw">$1</span>')).join('');
    return av + (com ? `<span class="cm">${com}</span>` : '');
  }).join('\n');
  code.innerHTML = html;
}

/* ------------------------------------------------------------------ */
document.addEventListener('DOMContentLoaded', () => {
  // thème
  const sel = document.getElementById('optTheme');
  if (sel) {
    sel.value = document.documentElement.dataset.theme || 'auto';
    sel.addEventListener('change', () => {
      const t = sel.value;
      if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
      try { localStorage.setItem(THEME_KEY, t); } catch (e) {}
    });
  }

  // figure de l'exemple
  const host = document.getElementById('figExemple');
  if (host) dessinerExemple(host);

  // code : coloration + bouton « Copier »
  document.querySelectorAll('pre.code').forEach(pre => {
    const code = pre.querySelector('code');
    if (!pre.matches('.console, .file, .shell, .algo')) colorerC(code);
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'copy'; b.textContent = 'Copier';
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(code.innerText); b.textContent = 'Copié ✓'; }
      catch (e) { b.textContent = 'Échec'; }
      setTimeout(() => (b.textContent = 'Copier'), 1400);
    });
    pre.appendChild(b);
  });

  // sommaire : lien actif selon la section visible
  const liens = new Map([...document.querySelectorAll('.toc a')].map(a => [a.getAttribute('href').slice(1), a]));
  const cibles = [...liens.keys()].map(id => document.getElementById(id)).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const visibles = new Set();
    const spy = new IntersectionObserver(entries => {
      for (const e of entries) e.isIntersecting ? visibles.add(e.target) : visibles.delete(e.target);
      const actif = cibles.filter(c => visibles.has(c)).pop();
      if (!actif) return;
      liens.forEach(a => a.classList.remove('active'));
      liens.get(actif.id).classList.add('active');
    }, { rootMargin: '0px 0px -70% 0px' });
    cibles.forEach(c => spy.observe(c));

    // apparition douce des blocs au défilement
    const blocs = document.querySelectorAll('main .fig, main .table-wrap, main pre.code, main .callout, main .todo, main .check, main .formula');
    const rev = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); rev.unobserve(e.target); }
    }, { rootMargin: '0px 0px -8% 0px' });
    blocs.forEach(b => { b.classList.add('reveal'); rev.observe(b); });
  }
});
