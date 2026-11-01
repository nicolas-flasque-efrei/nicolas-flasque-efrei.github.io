/* TI301 — Projet « La forêt et la lumière », partie 2 : forêt interactive.
   On choisit K, E, A, le nombre de saisons, la graine et la plantation, on lance la simulation,
   puis on regarde la pousse saison par saison : grille d'occupation à gauche, lumière à droite.
   Lecture, pause, saison par saison ; le survol d'une case montre le calcul de sa lumière.
   Mêmes règles que le sujet, et même générateur que alea.c. */
(function () {
  'use strict';

  const GRAINE = 6, SAISONS = 10, DUREE_SAISON = 1.2, RANGEES_MIN = 12;

  /* ------------------------------------------------------------------
     Textes : français, ou anglais si la page est en anglais (<html lang="en">)
     ------------------------------------------------------------------ */
  const TEXTES = {
    fr: {
      dec: ',',
      paliers: ['L ≥ 0,7 : pousse 95 %', '0,4 ≤ L &lt; 0,7 : pousse 70 %', '0,15 ≤ L &lt; 0,4 : pousse 40 %', 'L &lt; 0,15 : dormance'],
      occupation: 'Occupation', lumiere: 'Lumière', saison: 'Saison',
      axes: (C, H) => `colonnes 0 à ${C - 1} ; rangées 0 à ${H - 1} (la forêt fait le tour : la colonne ${C - 1} touche la colonne 0)`,
      lecture: '▶ Lecture', pause: '⏸ Pause',
      saisonSur: (s, S) => `saison ${s} sur ${S}`,
      bulle: (s, r, c, n, m) => `<b>Saison ${s} – rangée ${r}, colonne ${c}</b><br>`
        + `${n} extrémité${n > 1 ? 's' : ''} dans la case<br>`
        + `${m} extrémité${m > 1 ? 's' : ''} au-dessus, dans la colonne ${c}<br>`,
      bulleFin: (lib, s) => `${lib}, pour les bourgeons de la case à la saison ${s + 1}`,
      legende: (K, E, C, A, g, S, identique, d, v) => `Une forêt de ${K} arbres, E = ${E}, donc ${C} colonnes ; A = ${A} ; graine ${g} ; ${S} saisons ; `
        + `${identique ? 'pieds à la même altitude' : 'altitudes des pieds tirées au hasard'} ; une saison = ${d} seconde${v >= 2 ? 's' : ''}`,
      bilan: S => `Mesures des arbres à la fin de la saison ${S}`,
      entetes: ['Arbre', 'x du pied', 'altitude du pied', 'rameaux', 'hauteur', 'cime', 'bourgeons', 'extension'],
      aria: leg => `Animation de la pousse : ${leg}. Grille d'occupation à gauche, lumière de chaque case à droite.`,
      enCours: (s, S) => `Simulation : saison ${s} sur ${S}`,
      fini: 'Simulation terminée. Survolez une case (ou touchez-la) pour voir le calcul de sa lumière.',
    },
    en: {
      dec: '.',
      paliers: ['L ≥ 0.7: grows 95%', '0.4 ≤ L &lt; 0.7: grows 70%', '0.15 ≤ L &lt; 0.4: grows 40%', 'L &lt; 0.15: dormant'],
      occupation: 'Occupancy', lumiere: 'Light', saison: 'Season',
      axes: (C, H) => `columns 0 to ${C - 1}; rows 0 to ${H - 1} (the forest wraps around: column ${C - 1} touches column 0)`,
      lecture: '▶ Play', pause: '⏸ Pause',
      saisonSur: (s, S) => `season ${s} of ${S}`,
      bulle: (s, r, c, n, m) => `<b>Season ${s} – row ${r}, column ${c}</b><br>`
        + `${n} tip${n !== 1 ? 's' : ''} in the cell<br>`
        + `${m} tip${m !== 1 ? 's' : ''} above, in column ${c}<br>`,
      bulleFin: (lib, s) => `${lib}, for the buds of the cell in season ${s + 1}`,
      legende: (K, E, C, A, g, S, identique, d, v) => `A forest of ${K} trees, E = ${E}, so ${C} columns; A = ${A}; seed ${g}; ${S} seasons; `
        + `${identique ? 'trunks at the same altitude' : 'random trunk altitudes'}; one season = ${d} second${v !== 1 ? 's' : ''}`,
      bilan: S => `Tree measurements at the end of season ${S}`,
      entetes: ['Tree', 'trunk x', 'trunk altitude', 'branches', 'height', 'top', 'buds', 'extent'],
      aria: leg => `Growth animation: ${leg}. Occupancy grid on the left, light of each cell on the right.`,
      enCours: (s, S) => `Simulation: season ${s} of ${S}`,
      fini: 'Simulation finished. Hover over a cell (or tap it) to see how its light is computed.',
    },
  };
  let TXT = TEXTES[typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'fr'];
  // sous node : choisir la langue des images produites
  function choisirLangue(langue) { TXT = TEXTES[langue]; }

  /* ------------------------------------------------------------------
     Générateur : celui de alea.c (splitmix64), calculé sur 64 bits
     ------------------------------------------------------------------ */
  const MASQUE = (1n << 64n) - 1n;
  let etat = 0x123456789ABCDEFn;

  function randomInit(graine) { etat = BigInt(graine) & MASQUE; }
  function random64Bits() {
    etat = (etat + 0x9E3779B97F4A7C15n) & MASQUE;
    let z = etat;
    z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASQUE;
    z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASQUE;
    return z ^ (z >> 31n);
  }
  function randomReal() { return Number(random64Bits() >> 11n) * (1.0 / 9007199254740992.0); }
  function randomBetween(a, b) { return a + (b - a) * randomReal(); }
  function randomInt(n) {
    const un = BigInt(n), seuil = ((1n << 64n) - un) % un;
    let r;
    do { r = random64Bits(); } while (r < seuil);
    return Number(r % un);
  }

  /* ------------------------------------------------------------------
     Pousse : les calculs en float du C sont arrondis avec Math.fround
     ------------------------------------------------------------------ */
  const f = Math.fround;
  const PI = 3.14159265358979;   // valeur de arbre.h

  function canGrow(p) { return randomReal() < p / 100.0; }

  function drawFromTable(table) {
    const n = table.length;
    let res = n - 1, trouve = false, cumul = 0;
    const u = randomReal();
    for (let i = 0; i < n - 1 && !trouve; i++) {
      cumul = f(cumul + table[i]);
      if (u < cumul / 100.0) { res = i; trouve = true; }
    }
    return res;
  }

  function canGrowInLight(l) {
    if (l >= 0.7) return canGrow(95);
    if (l >= 0.4) return canGrow(70);
    if (l >= 0.15) return canGrow(40);
    return canGrow(0);   // dormance : 0 %, mais le tirage est fait
  }

  // seulement pour un bourgeon qui pousse
  function howManyBranchesInLight(l) {
    if (l >= 0.7) return 1 + drawFromTable([70, 25, 5]);
    if (l >= 0.4) return 1 + drawFromTable([85, 15]);
    return 1 + drawFromTable([100]);
  }

  function clampDirection(dir) { return dir < -80 ? f(-80) : (dir > 80 ? f(80) : dir); }

  function growBranch(arbre, parent, saison, dir, longueur) {
    const x = f(parent.x + f(longueur * f(Math.sin(dir * PI / 180))));
    const y = f(parent.y + f(longueur * f(Math.cos(dir * PI / 180))));
    const r = { num: arbre.nb, x, y, dir, saison, gen: parent.gen + 1, fils: [] };
    arbre.nb++;
    return r;
  }

  function growBudInLight(arbre, b, n, l) {
    let dir;
    for (let cpt = 0; cpt < n; cpt++) {
      if (cpt === 0) dir = b.dir + randomBetween(-10, 10);
      else if (randomInt(2) === 0) dir = b.dir - randomBetween(30, 60);
      else dir = b.dir + randomBetween(30, 60);
      const longueur = f((0.5 + 0.5 * l) * randomBetween(0.7, 1.3));
      b.fils.push(growBranch(arbre, b, arbre.saison, clampDirection(f(dir)), longueur));
    }
  }

  /* ------------------------------------------------------------------
     Forêt : grilles d'occupation et de lumière, plantation, saisons
     ------------------------------------------------------------------ */
  // assez de rangées pour qu'aucune extrémité ne dépasse : un pied mesure moins de 1,5,
  // et une extrémité monte de moins de 1,3 par saison
  const rangeesPour = S => Math.ceil(1.5 + 1.3 * S) + 1;

  function creerForet(K, E, A, H, graine, identique) {
    const C = K * E;
    const fo = {
      K, E, C, H, A, P_max: 20000, arbres: [],
      occupation: Array.from({ length: H }, () => new Array(C).fill(0)),
      lumiere: Array.from({ length: H }, () => new Array(C).fill(0)),
    };
    for (let i = 0; i < K; i++) {
      const pied = { num: 0, x: f(i * E + f(E / 2)), y: f(1), dir: f(0), saison: 0, gen: 0, fils: [] };
      fo.arbres.push({ pied, nb: 1, bourgeons: [pied], saison: 0, tronque: false });
    }
    randomInit(graine);
    if (!identique) for (const a of fo.arbres) a.pied.y = f(randomBetween(0.5, 1.5));
    for (const a of fo.arbres) addToGrid(fo, a.pied);
    return fo;
  }

  function columnOf(fo, x) { let c = Math.floor(x) % fo.C; if (c < 0) c += fo.C; return c; }
  function rowOf(fo, y) { return Math.min(Math.max(Math.floor(y), 0), fo.H - 1); }
  function addToGrid(fo, r) { fo.occupation[rowOf(fo, r.y)][columnOf(fo, r.x)]++; }

  function computeLight(fo) {
    for (let c = 0; c < fo.C; c++) {
      let l = 1.0;
      for (let r = fo.H - 1; r >= 0; r--) {
        fo.lumiere[r][c] = l;
        for (let n = 0; n < fo.occupation[r][c]; n++) l = l * (1 - fo.A);
      }
    }
  }

  function growSeasonInForest(fo, a) {
    a.saison++;
    if (a.tronque) return;
    const temp = [];
    for (const b of a.bourgeons) {
      const l = fo.lumiere[rowOf(fo, b.y)][columnOf(fo, b.x)];
      if (!canGrowInLight(l)) temp.push(b);
      else {
        const n = howManyBranchesInLight(l);
        growBudInLight(a, b, n, l);
        for (const r of b.fils) { addToGrid(fo, r); temp.push(r); }
      }
    }
    a.bourgeons = temp;
    if (a.nb >= fo.P_max) a.tronque = true;
  }

  /* une simulation pas à pas : la grille de chaque saison est mémorisée pour l'animation */
  function Simulation(K, E, A, S = SAISONS, graine = GRAINE, H = rangeesPour(S), identique = false) {
    this.fo = creerForet(K, E, A, H, graine, identique);
    this.S = S;
    this.s = 0;
    this.grilles = [];
    this.noter();
  }
  Simulation.prototype.noter = function () {
    computeLight(this.fo);
    this.grilles.push({ occ: this.fo.occupation.map(r => r.slice()), lum: this.fo.lumiere.map(r => r.slice()) });
  };
  Simulation.prototype.saison = function () {
    this.s++;
    computeLight(this.fo);
    for (const a of this.fo.arbres) growSeasonInForest(this.fo, a);
    this.noter();
  };
  // rameaux arbre par arbre, en largeur, avec le numéro de leur parent
  Simulation.prototype.rameaux = function () {
    const res = [];
    this.fo.arbres.forEach((a, k) => {
      const file = [[a.pied, -1]];
      for (let t = 0; t < file.length; t++) {
        const [r, p] = file[t];
        res.push({ arbre: k, num: r.num, parent: p, saison: r.saison, gen: r.gen, x: r.x, y: r.y, bourgeon: r.fils.length === 0 });
        for (const q of r.fils) file.push([q, r.num]);
      }
    });
    return res;
  };
  // mesures de chaque arbre : pied, rameaux, hauteur (génération maximale), cime (altitude maximale), bourgeons,
  // extension (écart entre les abscisses extrêmes des extrémités de tous ses rameaux)
  Simulation.prototype.mesures = function () {
    const rameaux = this.rameaux();
    return this.fo.arbres.map((a, k) => {
      const siens = rameaux.filter(r => r.arbre === k);
      const xs = siens.map(r => r.x);
      return {
        x: a.pied.x, y: a.pied.y, rameaux: a.nb,
        hauteur: Math.max(...siens.map(r => r.gen)),
        cime: Math.max(...siens.map(r => r.y)),
        bourgeons: siens.filter(r => r.bourgeon).length,
        extension: f(Math.max(...xs) - Math.min(...xs)),
      };
    });
  };
  // rangées à dessiner : au moins 12, et deux de plus que la plus haute rangée occupée
  Simulation.prototype.rangeesAffichees = function () {
    const occ = this.grilles[this.grilles.length - 1].occ;
    let haut = 0;
    occ.forEach((ligne, r) => { if (ligne.some(n => n > 0)) haut = r; });
    return Math.min(this.fo.H, Math.max(RANGEES_MIN, haut + 2));
  };

  /* ------------------------------------------------------------------
     Dessin : SVG animé (CSS) ; classes préfixées fs- car le SVG est inséré dans la page
     ------------------------------------------------------------------ */
  const COULEURS = ['rgb(122,82,48)', 'rgb(46,110,170)', 'rgb(170,60,90)', 'rgb(120,90,170)', 'rgb(200,120,30)'];
  const BOURGEON = 'rgb(58,154,58)';
  // une couleur par ligne de la table de pousse : seuil, fond, texte (libellés : TXT.paliers)
  const PALIERS = [[0.7, 'rgb(255,241,184)', 'rgb(90,80,40)'],
    [0.4, 'rgb(240,200,120)', 'rgb(80,60,20)'],
    [0.15, 'rgb(150,150,160)', 'white'],
    [-1.0, 'rgb(70,80,100)', 'white']];
  const palier = l => PALIERS.find(p => l >= p[0]);
  const libellePalier = l => TXT.paliers[PALIERS.indexOf(palier(l))];

  // 2 chiffres après la virgule, arrondi au plus proche (0,125 donne 0,13)
  function texteLumiere(l) {
    if (l === 0) return '0';     // A = 1 : plus aucune lumière sous une extrémité
    if (l < 0.005) return '≈0';
    const [e, d = ''] = String(l).split('.');
    let n = Number(e) * 100 + Number((d + '00').slice(0, 2));
    if ((d + '000')[2] >= '5') n++;
    const ent = Math.floor(n / 100), dec = n % 100;
    return dec === 0 ? String(ent) : ent + TXT.dec + String(dec).padStart(2, '0').replace(/0$/, '');
  }

  function construireSvg(sim, d = DUREE_SAISON, H = sim.rangeesAffichees()) {
    const { K, C, A } = sim.fo;
    const grilles = sim.grilles, rameaux = sim.rameaux();
    const S = grilles.length - 1;
    const pousse = 0.55 * d;                        // durée de la pousse d'un rameau, au début de chaque saison
    let cs = C > 10 ? 34 : (C > 5 ? 40 : 46);       // taille d'une case
    cs = Math.max(22, Math.min(cs, Math.floor(620 / H)));   // beaucoup de rangées : cases plus petites
    const petit = cs < 30;
    const mh = 48, mb = 84, ecart = 46;             // marges haut et bas, écart entre les deux panneaux
    const lp = C * cs, contenu = 2 * lp + ecart;
    const W = Math.max(40 + contenu + 12, 560);     // largeur minimale : légende et texte du bas
    const mg = 40 + Math.floor((W - 52 - contenu) / 2);
    const Ht = mh + H * cs + mb;
    const ox = [mg, mg + lp + ecart];               // origine x des deux panneaux
    const X = (p, x) => ox[p] + x * cs;
    const Y = y => mh + (H - Math.min(y, H)) * cs;
    const apparition = s => (s === 0 ? 0 : s * d + pousse);
    const n1 = v => v.toFixed(1);
    const vis = (debut, fin) => (fin === null ? `class="fs-v fs-dernier" style="animation-delay:${debut.toFixed(2)}s"`
      : `class="fs-v" style="animation-delay:${debut.toFixed(2)}s, ${fin.toFixed(2)}s"`);

    const o = [];
    o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Ht}" viewBox="0 0 ${W} ${Ht}" font-family="sans-serif">`);
    o.push('<rect width="100%" height="100%" fill="white"/>');
    o.push(`<style>
  .fs-r { fill: none; stroke-dasharray: 1 1; stroke-dashoffset: 1; animation: fs-pousse ${pousse.toFixed(2)}s linear forwards; }
  .fs-v { opacity: 0; animation: fs-apparait 0.01s forwards, fs-disparait 0.01s forwards; }
  .fs-dernier { animation: fs-apparait 0.01s forwards; }
  @keyframes fs-pousse    { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
  @keyframes fs-apparait  { from { opacity: 0; } to { opacity: 1; } }
  @keyframes fs-disparait { from { opacity: 1; } to { opacity: 0; } }
  .fs-num { font-size: ${petit ? 10 : (cs < 40 ? 13 : 14)}px; text-anchor: middle; dominant-baseline: central; }
  .fs-ax { font-size: 11px; fill: rgb(110,110,110); }
</style>`);
    for (let p = 0; p < 2; p++) o.push(`<clipPath id="fs-c${p}"><rect x="${ox[p]}" y="${mh}" width="${lp}" height="${H * cs}"/></clipPath>`);

    // titres et saison
    o.push(`<text x="${ox[0]}" y="22" font-size="15" font-weight="bold">${TXT.occupation}</text>`);
    o.push(`<text x="${ox[1]}" y="22" font-size="15" font-weight="bold">${TXT.lumiere} (A = ${texteLumiere(A)})</text>`);
    for (let s = 0; s <= S; s++) {
      o.push(`<text ${vis(apparition(s), s === S ? null : apparition(s + 1))} x="${W - 12}" y="22" font-size="15" text-anchor="end">${TXT.saison} ${s}</text>`);
    }

    // cases : une suite d'éléments par case, un par période où la valeur ne change pas
    for (let p = 0; p < 2; p++) {
      for (let r = 0; r < H; r++) {
        for (let c = 0; c < C; c++) {
          const x0 = X(p, c), y0 = mh + (H - 1 - r) * cs;
          const val = t => (p === 0 ? grilles[t].occ[r][c] : grilles[t].lum[r][c]);
          let debut = 0;
          for (let s = 1; s <= S + 1; s++) {
            if (s <= S && val(s) === val(debut)) continue;
            const fin = s > S ? null : apparition(s);
            const occ = grilles[debut].occ[r][c], lum = grilles[debut].lum[r][c];
            const fond = p === 1 ? palier(lum)[1] : (occ ? 'rgb(233,240,228)' : 'white');
            let e = `<rect x="${x0}" y="${y0}" width="${cs}" height="${cs}" fill="${fond}"/>`;
            if (p === 0 && occ) {
              // dans le coin haut gauche de la case : les extrémités restent visibles, on peut les compter
              e += `<text x="${x0 + 3}" y="${y0 + (petit ? 10 : 12)}" fill="rgb(60,90,50)" font-weight="bold" font-size="${petit ? 10 : 12}">${occ}</text>`;
            }
            if (p === 1) e += `<text class="fs-num" x="${x0 + cs / 2}" y="${y0 + cs / 2}" fill="${palier(lum)[2]}">${texteLumiere(lum)}</text>`;
            o.push(`<g ${vis(apparition(debut), fin)}>${e}</g>`);
            debut = s;
          }
        }
      }
    }

    // quadrillage, axes
    for (let p = 0; p < 2; p++) {
      o.push('<g stroke="rgb(200,200,200)" stroke-width="1">');
      for (let c = 0; c <= C; c++) o.push(`<line x1="${X(p, c)}" y1="${mh}" x2="${X(p, c)}" y2="${mh + H * cs}"/>`);
      for (let r = 0; r <= H; r++) o.push(`<line x1="${ox[p]}" y1="${mh + r * cs}" x2="${ox[p] + lp}" y2="${mh + r * cs}"/>`);
      o.push('</g>');
      o.push(`<line x1="${ox[p]}" y1="${mh + H * cs}" x2="${ox[p] + lp}" y2="${mh + H * cs}" stroke="rgb(120,100,80)" stroke-width="2"/>`);
      for (let c = 0; c < C; c++) o.push(`<text class="fs-ax" x="${X(p, c) + cs / 2}" y="${mh + H * cs + 16}" text-anchor="middle">${c}</text>`);
      for (let r = 0; r < H; r++) o.push(`<text class="fs-ax" x="${ox[p] - 6}" y="${mh + (H - 1 - r) * cs + cs / 2 + 4}" text-anchor="end">${r}</text>`);
    }
    o.push(`<text class="fs-ax" x="40" y="${mh + H * cs + 36}">${TXT.axes(C, H)}</text>`);
    // légende : la couleur d'une case est la ligne de la table de pousse qui s'applique à ses bourgeons
    PALIERS.forEach(([, fond], i) => {
      const lib = TXT.paliers[i];
      const lx = 40 + (i % 2) * 210, ly = mh + H * cs + 46 + Math.floor(i / 2) * 18;
      o.push(`<rect x="${lx}" y="${ly}" width="14" height="12" fill="${fond}" stroke="rgb(170,170,170)"/>`);
      o.push(`<text class="fs-ax" x="${lx + 20}" y="${ly + 10}">${lib}</text>`);
    });

    // rameaux et bourgeons, sur les deux panneaux (plus discrets sur la lumière)
    const parNum = new Map(rameaux.map(r => [r.arbre + ':' + r.num, r]));
    // les rameaux gardent leur abscisse : la forêt fait le tour au dessin seulement, comme dans columnOf
    const auBord = x => { let m = x % C; if (m < 0) m += C; return m; };
    const premierFils = new Map();
    for (const r of rameaux) {
      if (r.parent >= 0) {
        const k = r.arbre + ':' + r.parent;
        premierFils.set(k, Math.min(premierFils.has(k) ? premierFils.get(k) : Infinity, r.saison));
      }
    }
    for (let p = 0; p < 2; p++) {
      o.push(`<g clip-path="url(#fs-c${p})" opacity="${p === 0 ? 1 : 0.55}">`);
      for (const r of rameaux) {
        const coul = COULEURS[r.arbre % COULEURS.length];
        let px = auBord(r.x), py = 0;
        if (r.parent >= 0) { const q = parNum.get(r.arbre + ':' + r.parent); px = auBord(q.x); py = q.y; }
        let x = auBord(r.x);
        if (x - px > C / 2) x -= C;
        else if (px - x > C / 2) x += C;
        for (const dec of [0, -C, C]) {     // copies décalées : un rameau qui « fait le tour » est dessiné des deux côtés
          if (dec && Math.min(px, x) + dec >= 0 && Math.max(px, x) + dec <= C) continue;
          if (dec && !(Math.min(px, x) + dec < C && Math.max(px, x) + dec > 0)) continue;
          o.push(`<path class="fs-r" pathLength="1" style="animation-delay:${(r.saison * d).toFixed(2)}s" stroke="${coul}" `
            + `stroke-width="${petit ? 2.5 : 3}" stroke-linecap="round" d="M${n1(X(p, px + dec))} ${n1(Y(py))} L${n1(X(p, x + dec))} ${n1(Y(r.y))}"/>`);
        }
      }
      for (const r of rameaux) {
        const k = r.arbre + ':' + r.num;
        const debut = r.saison === 0 ? 0 : r.saison * d + pousse;
        const fin = premierFils.has(k) ? premierFils.get(k) * d : null;
        const cx = n1(X(p, auBord(r.x))), cy = n1(Y(r.y));
        o.push(`<circle ${vis(debut, fin)} cx="${cx}" cy="${cy}" r="${petit ? 3.5 : 4.5}" fill="${BOURGEON}"/>`);
        // extrémité d'un rameau devenu du bois : petit rond noir, pour compter l'occupation des cases
        if (fin !== null) o.push(`<circle ${vis(fin, null)} cx="${cx}" cy="${cy}" r="${petit ? 2.2 : 2.6}" fill="black"/>`);
      }
      o.push('</g>');
    }
    o.push('</svg>');
    // géométrie et calendrier, pour le lecteur et le survol des cases
    const geo = { ox, mh, cs, H, C, S, d, pousse, fin: apparition(S) + 0.01 };
    return { svg: o.join('\n') + '\n', W, H: Ht, geo };
  }

  /* ------------------------------------------------------------------
     Page : réglages, simulation avec progression, lecteur, survol des cases, mesures
     ------------------------------------------------------------------ */
  const virgule = v => String(v).replace('.', TXT.dec);
  const pause = ms => new Promise(ok => setTimeout(ok, ms));

  function brancher(fig) {
    const $ = sel => fig.querySelector(sel);
    const ctrl = $('.sim-ctrl'), etatSim = $('.sim-etat'), barre = $('.sim-prog > span');
    const go = $('.sim-go'), hasard = $('.sim-hasard'), img = $('img'), vue = $('.sim-vue');
    const lecteur = $('.sim-lecteur'), legende = $('.sim-leg'), bilan = $('.sim-bilan'), bulle = $('.sim-bulle');
    const bLecture = lecteur.querySelector('[data-act="lecture"]'), vitesse = $('#simV'), saisonLue = $('.sim-saison');
    const champ = nom => ctrl.querySelector(`[name="${nom}"]`);
    const valeur = {
      K: () => Number(champ('K').value),
      E: () => Number(champ('E').value),
      A: () => parseFloat((Number(champ('A').value) / 100).toFixed(2)),   // curseur en centièmes : pas d'erreur d'arrondi
      S: () => Number(champ('S').value),
      // graine : un entier de 0 à 2 147 483 647 (un int du C) ; sinon la graine de départ
      graine: () => {
        const v = champ('graine').value, g = Number(v);   // saisie invalide : value vaut ''
        return v !== '' && Number.isInteger(g) && g >= 0 && g <= 2147483647 ? g : GRAINE;
      },
      identique: () => champ('identique').checked,
    };
    let sim = null, dessin = null, svgEl = null, anims = [], fins = [], ref = null, enLecture = false, enCours = false;

    const afficherValeurs = () => {
      for (const nom of ['K', 'E', 'A', 'S']) ctrl.querySelector(`output[for="${champ(nom).id}"]`).textContent = virgule(valeur[nom]());
    };

    /* --- lecteur : toutes les animations CSS du dessin suivent la même horloge --- */
    const temps = () => (ref && ref.currentTime !== null ? ref.currentTime / 1000 : 0);
    const apparition = s => (s === 0 ? 0 : s * dessin.geo.d + dessin.geo.pousse);
    const saisonA = t => { let s = 0; while (s < dessin.geo.S && apparition(s + 1) <= t + 1e-6) s++; return s; };
    function allerA(t, jouer) {
      anims.forEach(a => { a.pause(); a.currentTime = t * 1000; });
      // une animation déjà terminée reste en pause : play() la ferait repartir du début
      if (jouer) anims.forEach((a, i) => { if (fins[i] > t * 1000) a.play(); });
      enLecture = jouer;
    }
    const allerSaison = s => allerA(apparition(s) + 0.02, false);
    function majLecteur() {
      if (dessin) {
        const t = temps();
        if (enLecture && t >= dessin.geo.fin) enLecture = false;
        bLecture.textContent = enLecture ? TXT.pause : TXT.lecture;
        saisonLue.textContent = TXT.saisonSur(saisonA(t), dessin.geo.S);
      }
      requestAnimationFrame(majLecteur);
    }
    lecteur.addEventListener('click', e => {
      const act = e.target.closest('button')?.dataset.act;
      if (!act || !dessin || !anims.length) return;
      const s = saisonA(temps());
      if (act === 'rejouer') allerA(0, true);
      else if (act === 'avant') allerSaison(Math.max(0, s - 1));
      else if (act === 'apres') allerSaison(Math.min(dessin.geo.S, s + 1));
      else if (act === 'lecture') {
        if (enLecture) allerA(temps(), false);
        else allerA(temps() >= dessin.geo.fin ? 0 : temps(), true);
      }
    });
    const appliquerVitesse = () => {
      const d = Number(vitesse.value);
      anims.forEach(a => { a.playbackRate = DUREE_SAISON / d; });
      if (sim) legende.textContent = legendeTexte();
    };
    vitesse.addEventListener('change', appliquerVitesse);

    /* --- survol d'une case : le calcul de sa lumière --- */
    function caseSous(e) {
      if (!svgEl || !dessin) return null;
      const pt = svgEl.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const q = pt.matrixTransform(svgEl.getScreenCTM().inverse());
      const { ox, mh, cs, H, C } = dessin.geo;
      for (let p = 0; p < 2; p++) {
        const c = Math.floor((q.x - ox[p]) / cs), rr = Math.floor((q.y - mh) / cs);
        if (c >= 0 && c < C && rr >= 0 && rr < H) return { c, r: H - 1 - rr };
      }
      return null;
    }
    function montrerBulle(e) {
      const cell = caseSous(e);
      if (!cell) { bulle.hidden = true; return; }
      const { r, c } = cell, s = saisonA(temps()), g = sim.grilles[s], A = sim.fo.A;
      let m = 0;
      for (let rr = r + 1; rr < sim.fo.H; rr++) m += g.occ[rr][c];
      const l = g.lum[r][c], n = g.occ[r][c];
      const lib = libellePalier(l).replace('&lt;', '<');
      bulle.innerHTML = TXT.bulle(s, r, c, n, m)
        + `L = (1 − ${virgule(A)})<sup>${m}</sup> = ${texteLumiere(l)}<br>`
        + TXT.bulleFin(lib, s);
      bulle.hidden = false;
      const rv = vue.getBoundingClientRect(), lb = bulle.offsetWidth, hb = bulle.offsetHeight;
      let x = e.clientX - rv.left + 14, y = e.clientY - rv.top + 14;
      if (x + lb > rv.width) x = Math.max(0, e.clientX - rv.left - lb - 14);
      if (y + hb > rv.height) y = Math.max(0, e.clientY - rv.top - hb - 14);
      bulle.style.left = x + 'px'; bulle.style.top = y + 'px';
    }
    vue.addEventListener('pointermove', montrerBulle);
    vue.addEventListener('pointerdown', montrerBulle);   // écrans tactiles : toucher une case
    vue.addEventListener('pointerleave', () => { bulle.hidden = true; });

    /* --- simulation et affichage --- */
    function legendeTexte() {
      const { K, E, C, A } = sim.fo;
      const d = virgule(Number(vitesse.value));
      return TXT.legende(K, E, C, virgule(A), sim.graine, sim.S, sim.identique, d, Number(vitesse.value));
    }
    function afficherBilan() {
      const ligne = (m, k) => `<tr><td><i style="background:${COULEURS[k]}"></i>${k}</td><td>${virgule(m.x)}</td><td>${virgule(m.y.toFixed(3))}</td>`
        + `<td>${m.rameaux}</td><td>${m.hauteur}</td><td>${virgule(m.cime.toFixed(3))}</td><td>${m.bourgeons}</td><td>${virgule(m.extension.toFixed(3))}</td></tr>`;
      bilan.innerHTML = `<table><caption>${TXT.bilan(sim.S)}</caption>`
        + `<thead><tr>${TXT.entetes.map(t => `<th>${t}</th>`).join('')}</tr></thead>`
        + `<tbody>${sim.mesures().map(ligne).join('')}</tbody></table>`;
    }
    function montrer() {
      vue.querySelector('svg')?.remove();
      vue.insertAdjacentHTML('afterbegin', dessin.svg);
      svgEl = vue.querySelector('svg');
      svgEl.removeAttribute('width'); svgEl.removeAttribute('height');
      svgEl.style.maxWidth = dessin.W + 'px';
      svgEl.setAttribute('role', 'img');
      svgEl.setAttribute('aria-label', TXT.aria(legendeTexte()));
      img.hidden = true; vue.hidden = false; bulle.hidden = true;
      anims = []; ref = null;
      // les animations CSS existent une fois les styles calculés
      requestAnimationFrame(() => {
        if (!svgEl.getAnimations) { lecteur.hidden = true; return; }
        anims = svgEl.getAnimations({ subtree: true });
        fins = anims.map(a => a.effect.getComputedTiming().endTime);
        ref = anims[fins.indexOf(Math.max(...fins))] || null;
        lecteur.hidden = !ref;
        enLecture = true;
        appliquerVitesse();
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) allerSaison(dessin.geo.S);
      });
    }

    async function lancer() {
      if (enCours) return;
      enCours = true; go.disabled = true; hasard.disabled = true;
      const K = valeur.K(), E = valeur.E(), A = valeur.A(), S = valeur.S(), graine = valeur.graine(), identique = valeur.identique();
      champ('graine').value = graine;   // valeur saisie invalide : on montre la graine utilisée
      const nouvelle = new Simulation(K, E, A, S, graine, rangeesPour(S), identique);
      nouvelle.graine = graine; nouvelle.identique = identique;
      for (let s = 1; s <= S; s++) {
        nouvelle.saison();
        barre.style.width = (100 * s / (S + 1)) + '%';
        etatSim.textContent = TXT.enCours(s, S);
        await pause(30);
      }
      sim = nouvelle;
      dessin = construireSvg(sim);
      barre.style.width = '100%';
      etatSim.textContent = TXT.fini;
      legende.textContent = legendeTexte();
      afficherBilan();
      montrer();
      enCours = false; go.disabled = false; hasard.disabled = false;
    }

    ctrl.hidden = false; $('.sim-avance').hidden = false;
    ctrl.addEventListener('input', afficherValeurs);
    afficherValeurs();
    go.addEventListener('click', lancer);
    hasard.addEventListener('click', () => { champ('graine').value = Math.floor(Math.random() * 100000); lancer(); });
    champ('graine').addEventListener('keydown', e => { if (e.key === 'Enter') lancer(); });
    requestAnimationFrame(majLecteur);
    // première simulation, avec les réglages de départ, quand la figure arrive à l'écran
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => {
        if (entries.some(e => e.isIntersecting)) { io.disconnect(); lancer(); }
      }, { threshold: 0.3 });
      io.observe(fig);
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Simulation, construireSvg, texteLumiere, rangeesPour, choisirLangue };   // contrôles et image de départ, avec node
  } else {
    document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('.fig.sim').forEach(brancher));
  }
})();
