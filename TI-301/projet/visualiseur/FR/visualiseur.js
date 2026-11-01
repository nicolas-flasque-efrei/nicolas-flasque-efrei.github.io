/* TI301 — Projet « La forêt et la lumière » : visualiseur d'arbres et de forêts.
   On dépose un fichier écrit par saveTree (partie 1) ou par saveForest (partie 2) ; le navigateur en tire une
   image PNG et un GIF animé des saisons. Tout est calculé ici, dans le navigateur : aucun fichier n'est envoyé.

   Le moteur (fabriqueMoteur) dessine pixel par pixel, en double précision, sans aucun tirage au hasard :
   le même fichier donne toujours exactement la même image.
   Il tourne dans un Web Worker pour ne pas figer la page. */

function fabriqueMoteur() {
  'use strict';
  const f = Math.fround;
  const PI = 3.14159265358979;          // valeur de arbre.h
  const RAYON_BOURGEON = 0.035;
  const MAX_RAMEAUX = 3000000;
  let EN = false;                       // messages en anglais (options.en)
  const msg = (fr, en) => (EN ? en : fr);

  /* ------------------------------------------------------------------ hachage et lecture du fichier */

  // hachage sur 32 bits : un nombre entre 0 et 1, reproductible, tiré d'un arbre, d'un rameau et d'un canal
  function hash01(arbre, num, canal) {
    let h = (Math.imul(arbre, 0x9E3779B1) ^ Math.imul(num, 0x85EBCA77) ^ Math.imul(canal, 0xC2B2AE3D)) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    h = Math.imul(h, 0x7FEB352D) >>> 0;
    h = (h ^ (h >>> 15)) >>> 0;
    h = Math.imul(h, 0x846CA68B) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return (h >>> 8) / 16777216;
  }

  function erreur(message) {
    const e = new Error(message);
    e.lisible = true;
    return e;
  }

  // nombres d'une ligne : réels (comme %f, lus en float) ou entiers
  function nombres(ligne) {
    return ligne.trim().split(/\s+/);
  }

  /* une scène : les rameaux de un ou plusieurs arbres, arbre par arbre, chacun en largeur (un parent avant ses fils) ;
     les positions sont recalculées comme readTree (growBranch, en float) depuis l'extrémité du pied */
  function lireFichier(texte) {
    const lignes = texte.split(/\r?\n/);
    let i = 0;
    while (i < lignes.length && lignes[i].trim() === '') i++;
    if (i === lignes.length) throw erreur(msg('Le fichier est vide.', 'The file is empty.'));
    const max = Math.min(lignes.length, MAX_RAMEAUX + 1);
    const s = {
      nb: 0, K: 0, C: 0, saisonMax: 0, foret: false,
      x: new Float32Array(max), y: new Float32Array(max), parent: new Int32Array(max), arbre: new Int32Array(max),
      num: new Int32Array(max), saison: new Int32Array(max), r: new Float64Array(max),
      present: new Uint8Array(max), bourgeon: new Uint8Array(max), xmin: 0, xmax: 0, ymax: 0,
    };
    let indice = new Map();   // numéro d'un rameau de l'arbre en cours -> indice dans la scène
    let attendPied = false;
    function ajouterPied(champs, n) {
      if (champs.length < 2 || isNaN(parseFloat(champs[0])) || isNaN(parseFloat(champs[1])))
        throw erreur(msg(`Ligne ${n} : on attend la position du pied « x y ».`, `Line ${n}: expected the trunk position “x y”.`));
      const k = s.nb++;
      s.x[k] = f(parseFloat(champs[0]));
      s.y[k] = f(parseFloat(champs[1]));
      s.parent[k] = -1; s.arbre[k] = s.K - 1; s.num[k] = 0; s.saison[k] = 0;
      indice = new Map([[0, k]]);
    }
    function ajouterRameau(champs, n) {
      if (champs.length !== 7) throw erreur(msg(`Ligne ${n} : on attend « num saison parent dir longueur gen etat ».`, `Line ${n}: expected “num saison parent dir longueur gen etat”.`));
      if (s.nb >= MAX_RAMEAUX) throw erreur(msg(`Fichier trop gros : plus de ${MAX_RAMEAUX} rameaux.`, `File too large: more than ${MAX_RAMEAUX} branches.`));
      const num = parseInt(champs[0], 10), sa = parseInt(champs[1], 10), par = parseInt(champs[2], 10);
      const dir = f(parseFloat(champs[3])), longueur = f(parseFloat(champs[4]));
      if ([num, sa, par].some(isNaN) || isNaN(dir) || isNaN(longueur)) throw erreur(msg(`Ligne ${n} : nombre illisible.`, `Line ${n}: unreadable number.`));
      const p = indice.get(par);
      if (p === undefined) throw erreur(msg(`Ligne ${n} : parent ${par} du rameau ${num} introuvable (fichier pas en largeur ?).`,
        `Line ${n}: parent ${par} of branch ${num} not found (file not in breadth-first order?).`));
      const k = s.nb++;
      s.x[k] = f(s.x[p] + f(longueur * f(Math.sin(dir * PI / 180))));
      s.y[k] = f(s.y[p] + f(longueur * f(Math.cos(dir * PI / 180))));
      s.parent[k] = p; s.arbre[k] = s.K - 1; s.num[k] = num; s.saison[k] = sa;
      indice.set(num, k);
      if (sa > s.saisonMax) s.saisonMax = sa;
    }
    const tete = nombres(lignes[i]);
    if (tete[0] === 'FORET') {
      s.foret = true;
      if (tete.length < 8) throw erreur(msg(`Ligne ${i + 1} : on attend « FORET K E C HMAX A P_max saison ».`, `Line ${i + 1}: expected “FORET K E C HMAX A P_max saison”.`));
      s.C = f(parseInt(tete[3], 10));
      for (i++; i < lignes.length; i++) {
        if (lignes[i].trim() === '') continue;
        const champs = nombres(lignes[i]);
        if (champs[0] === 'ARBRE') { s.K++; attendPied = true; }
        else if (s.K === 0) throw erreur(msg(`Ligne ${i + 1} : on attend une ligne « ARBRE id tronque nb_rameaux ».`, `Line ${i + 1}: expected a line “ARBRE id tronque nb_rameaux”.`));
        else if (attendPied) { ajouterPied(champs, i + 1); attendPied = false; }
        else ajouterRameau(champs, i + 1);
      }
      if (s.K === 0) throw erreur(msg('Aucun arbre dans la forêt.', 'No tree in the forest.'));
    } else {
      s.K = 1;
      ajouterPied(tete, i + 1);
      for (i++; i < lignes.length; i++) {
        if (lignes[i].trim() === '') continue;
        ajouterRameau(nombres(lignes[i]), i + 1);
      }
    }
    return s;
  }

  /* ------------------------------------------------------------------ géométrie de la scène */

  // rameaux présents à la saison donnée, bourgeons, rayons (règle de Léonard) et encombrement
  function computeRadii(s, saison) {
    const acc = new Float64Array(s.nb), fils = new Int32Array(s.nb);
    s.xmin = f(1e30); s.xmax = f(-1e30); s.ymax = 0;
    for (let i = s.nb - 1; i >= 0; i--) {
      s.present[i] = s.saison[i] <= saison ? 1 : 0;
      if (s.present[i]) {
        s.bourgeon[i] = fils[i] === 0 ? 1 : 0;
        s.r[i] = s.bourgeon[i] ? RAYON_BOURGEON : Math.sqrt(acc[i]);
        const p = s.parent[i];
        if (p >= 0) { acc[p] += s.r[i] * s.r[i]; fils[p]++; }
        if (s.x[i] < s.xmin) s.xmin = s.x[i];
        if (s.x[i] > s.xmax) s.xmax = s.x[i];
        if (s.y[i] > s.ymax) s.ymax = s.y[i];
      }
    }
  }

  // cadrage : px = ox + x * sx, py = sol - y * sx
  function setupView(s, w) {
    const v = {};
    let x0, x1, hauteurUtile;
    const haut = s.ymax + 1.5;
    if (s.C > 0) { x0 = 0; x1 = s.C; }
    else {
      const marge = 0.08 * f(s.xmax - s.xmin) + 1.5;
      x0 = s.xmin - marge; x1 = s.xmax + marge;
    }
    v.w = w;
    v.sx = w / (x1 - x0);
    v.h = Math.trunc(haut * v.sx / 0.86);
    if (v.h > Math.trunc(1.25 * w)) v.h = Math.trunc(1.25 * w);
    if (v.h < Math.trunc(0.20 * w)) v.h = Math.trunc(0.20 * w);
    v.sol = 0.88 * v.h;
    hauteurUtile = 0.84 * v.h;
    if (haut * v.sx > hauteurUtile) v.sx = hauteurUtile / haut;
    v.ox = 0.5 * (w - (x0 + x1) * v.sx);
    return v;
  }

  function treeStarts(s) {
    const debut = new Int32Array(s.K + 1);
    for (let k = 0, i = 0; k <= s.K; k++) {
      while (i < s.nb && s.arbre[i] < k) i++;
      debut[k] = i;
    }
    return debut;
  }

  function treeDepth(s, arbre) { return s.K > 1 ? hash01(arbre, 0, 7) : 0; }

  // arbres du plus lointain au plus proche
  function treeOrder(s) {
    const ordre = new Int32Array(s.K);
    for (let a = 0; a < s.K; a++) {
      let b = a - 1;
      while (b >= 0 && treeDepth(s, ordre[b]) < treeDepth(s, a)) { ordre[b + 1] = ordre[b]; b--; }
      ordre[b + 1] = a;
    }
    return ordre;
  }

  /* ------------------------------------------------------------------ image et primitives */

  function createImage(w, h) { return { w, h, pix: new Float64Array(w * h * 3) }; }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function rgb(r, g, b) { return [r, g, b]; }
  function mixColor(c0, c1, t) {
    return [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t, c0[2] + (c1[2] - c0[2]) * t];
  }
  function blend(im, x, y, r, g, b, alpha) {
    if (x >= 0 && y >= 0 && x < im.w && y < im.h && alpha > 0) {
      const p = 3 * (y * im.w + x), q = im.pix;
      alpha = clamp01(alpha);
      q[p] += (r - q[p]) * alpha;
      q[p + 1] += (g - q[p + 1]) * alpha;
      q[p + 2] += (b - q[p + 2]) * alpha;
    }
  }
  function blendPixel(im, x, y, c, alpha) { blend(im, x, y, c[0], c[1], c[2], alpha); }

  function fillVerticalGradient(im, y0, y1, c0, c1) {
    for (let y = y0 < 0 ? 0 : y0; y <= y1 && y < im.h; y++) {
      const c = mixColor(c0, c1, y1 > y0 ? (y - y0) / (y1 - y0) : 0);
      for (let x = 0; x < im.w; x++) blendPixel(im, x, y, c, 1);
    }
  }

  function drawDisc(im, cx, cy, r, c, alpha) {
    const x0 = Math.floor(cx - r - 1), x1 = Math.ceil(cx + r + 1);
    const y0 = Math.floor(cy - r - 1), y1 = Math.ceil(cy + r + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const cov = clamp01(r - Math.sqrt(dx * dx + dy * dy) + 0.5);
        blendPixel(im, x, y, c, cov * alpha);
      }
    }
  }

  function drawSoftEllipse(im, cx, cy, rx, ry, c, alpha) {
    const x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1) blendPixel(im, x, y, c, alpha * (1 - d2) * (1 - d2));
      }
    }
  }

  // feuille d'érable : cinq lobes (direction depuis le haut, longueur relative), contour calculé une fois pour toutes
  const LOBE_ANGLE = [0.0, -0.85, 0.85, -1.80, 1.80];
  const LOBE_LONGUEUR = [1.0, 0.86, 0.86, 0.52, 0.52];
  const NB_DIRECTIONS = 720;
  const CONTOUR_ERABLE = new Float64Array(NB_DIRECTIONS + 1);
  for (let i = 0; i <= NB_DIRECTIONS; i++) {
    const t = -3.14159265 + 6.28318531 * i / NB_DIRECTIONS;
    let res = 0.38;
    for (let k = 0; k < 5; k++) {
      let d = Math.abs(t - LOBE_ANGLE[k]);
      d = d > 3.14159265 ? 6.28318531 - d : d;
      const b = 1 - d / 0.60;
      if (b > 0) {
        const r = 0.38 + (LOBE_LONGUEUR[k] - 0.38) * Math.pow(b, 1.15);
        res = r > res ? r : res;
      }
    }
    if (res > 0.45) res *= 1 + 0.05 * Math.abs(Math.sin(t * 18.0));
    CONTOUR_ERABLE[i] = res;
  }
  function mapleRadius(theta) {
    return CONTOUR_ERABLE[Math.trunc((theta + 3.14159265) / 6.28318531 * NB_DIRECTIONS + 0.5)];
  }

  function drawMapleLeaf(im, cx, cy, taille, angle, c, alpha) {
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const ext = taille * 1.12;
    const x0 = Math.floor(cx - ext), x1 = Math.ceil(cx + ext);
    const y0 = Math.floor(cy - ext), y1 = Math.ceil(cy + ext);
    const nervure = mixColor(c, [0.10, 0.12, 0.05], 0.45);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - cx, py = y + 0.5 - cy;
        const u = px * ca + py * sa, w = px * sa - py * ca;
        const rho = Math.sqrt(u * u + w * w);
        const theta = rho > 1.07 * taille + 0.5 ? 0 : Math.atan2(u, w);
        const cov = rho > 1.07 * taille + 0.5 ? 0 : clamp01((mapleRadius(theta) * taille - rho) + 0.5);
        if (cov > 0) {
          const lum = (u > 0 ? 0.88 : 1.0) * (0.90 + 0.18 * rho / taille);
          let k = [clamp01(c[0] * lum), clamp01(c[1] * lum), clamp01(c[2] * lum)];
          if (taille >= 7) {
            for (let l = 0; l < 5; l++) {
              const ax = Math.sin(LOBE_ANGLE[l]), aw = Math.cos(LOBE_ANGLE[l]);
              const le = u * ax + w * aw, perp = Math.abs(u * aw - w * ax);
              if (le > 0 && le < 0.75 * LOBE_LONGUEUR[l] * taille && perp < 0.6) k = mixColor(k, nervure, 0.7 * (1 - perp / 0.6));
            }
          }
          blendPixel(im, x, y, k, cov * alpha);
        } else if (w < 0 && w > -0.32 * taille && Math.abs(u) < 0.45) {
          blendPixel(im, x, y, nervure, alpha * (1 - Math.abs(u) / 0.45));
        }
      }
    }
  }

  function hashGrid(x, y, graine) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(graine, 2246822519 | 0)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    h = (h ^ (h >>> 16)) >>> 0;
    return (h & 0xFFFFFF) / 16777216;
  }

  function valueNoise(x, y, graine) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    const a = hashGrid(ix, iy, graine), b = hashGrid(ix + 1, iy, graine);
    const c = hashGrid(ix, iy + 1, graine), d = hashGrid(ix + 1, iy + 1, graine);
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
  }

  // segment effilé éclairé comme un cylindre, texturé (écorce) ; départ plat sauf arrondiDebut
  function drawBranch(im, ax, ay, ra, bx, by, rb, c, alpha, graine, arrondiDebut) {
    const vx = bx - ax, vy = by - ay;
    let l2 = vx * vx + vy * vy, l = Math.sqrt(l2);
    const rmax = ra > rb ? ra : rb;
    const x0 = Math.floor((ax < bx ? ax : bx) - rmax - 1), x1 = Math.ceil((ax > bx ? ax : bx) + rmax + 1);
    const y0 = Math.floor((ay < by ? ay : by) - rmax - 1), y1 = Math.ceil((ay > by ? ay : by) + rmax + 1);
    const lx = -0.55, ly = -0.45, lz = 0.70;
    if (l2 < 1e-6) { l2 = 1e-6; l = 1e-3; }
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5 - ax, py = y + 0.5 - ay;
        const tBrut = (px * vx + py * vy) / l2;
        const t = clamp01(tBrut);
        const qx = px - t * vx, qy = py - t * vy;
        const d = Math.sqrt(qx * qx + qy * qy);
        const r = ra + (rb - ra) * t;
        let cov = clamp01(r - d + 0.5);
        if (tBrut < 0 && !arrondiDebut) cov = 0;
        if (cov > 0) {
          let s = (px * (-vy) + py * vx) / (l * (r > 0.5 ? r : 0.5));
          s = s < -1 ? -1 : (s > 1 ? 1 : s);
          const nz = Math.sqrt(1 - s * s);
          let lum = s * ((-vy / l) * lx + (vx / l) * ly) + nz * lz;
          lum = 0.35 + 0.75 * clamp01(lum);
          const bruit = valueNoise(s * 2.5 + graine * 13.0, ((x + 0.5) * vx + (y + 0.5) * vy) / (l * (r * 0.8 + 4.0)), 7);
          lum *= 0.80 + 0.35 * bruit;
          blend(im, x, y, clamp01(c[0] * lum), clamp01(c[1] * lum), clamp01(c[2] * lum), cov * alpha);
        }
      }
    }
  }

  /* ------------------------------------------------------------------ la scène dessinée */

  function drawBackground(im, v) {
    const horizon = rgb(0.80, 0.87, 0.90);
    fillVerticalGradient(im, 0, Math.trunc(v.sol), rgb(0.38, 0.58, 0.82), horizon);
    drawSoftEllipse(im, 0.16 * v.w, 0.14 * v.h, 0.30 * v.w, 0.30 * v.w, rgb(1.0, 0.97, 0.85), 0.55);
    for (let couche = 0; couche < 2; couche++) {
      const c = couche === 0 ? rgb(0.62, 0.72, 0.74) : rgb(0.50, 0.62, 0.58);
      for (let x = 0; x < v.w; x++) {
        const u = x / v.w;
        const hcol = (0.07 + 0.05 * couche) + 0.06 * valueNoise(u * 5.0, 0.5, 11 + couche) + 0.02 * valueNoise(u * 23.0, 0.5, 17 + couche);
        const y0 = Math.trunc(v.sol - hcol * v.h);
        for (let y = y0; y < Math.trunc(v.sol); y++) blendPixel(im, x, y, c, 0.85);
      }
    }
    fillVerticalGradient(im, Math.trunc(v.sol), v.h - 1, rgb(0.40, 0.50, 0.25), rgb(0.26, 0.34, 0.16));
    const herbe = rgb(0.20, 0.27, 0.12);
    for (let y = Math.trunc(v.sol); y < v.h; y++) {
      for (let x = 0; x < v.w; x++) blendPixel(im, x, y, herbe, 0.35 * valueNoise(x * 0.35, y * 1.4, 5));
    }
  }

  // couleur d'une feuille : le vert de l'arbre, un peu de variété, un éclat propre à la feuille
  function leafColor(fonce, clair, ton, u, e) {
    let c = mixColor(fonce, clair, ton < 0 ? 0 : (ton > 1 ? 1 : ton));
    if (u < 0.16) c = mixColor(c, rgb(0.72, 0.76, 0.20), 0.55);
    else if (u < 0.28) c = mixColor(c, rgb(0.30, 0.34, 0.10), 0.50);
    else if (u < 0.32) c = mixColor(c, rgb(0.86, 0.52, 0.12), 0.55);
    else if (u < 0.34) c = mixColor(c, rgb(0.72, 0.16, 0.10), 0.55);
    c[0] *= 0.90 + 0.20 * e;
    c[1] *= 0.90 + 0.20 * e;
    c[2] *= 0.90 + 0.20 * e;
    return c;
  }

  function drawTree(im, v, s, debut, fin, dx, saison, brume) {
    const ciel = rgb(0.78, 0.85, 0.88);
    let hauteurArbre = 0.1;
    for (let i = debut; i < fin; i++) if (s.present[i] && s.y[i] > hauteurArbre) hauteurArbre = s.y[i];
    for (let i = debut; i < fin; i++) {
      if (!s.present[i]) continue;
      let ax, ay, ra, alpha = 1;
      const bx = v.ox + (s.x[i] + dx) * v.sx, by = v.sol - s.y[i] * v.sx;
      let rb = s.r[i] * v.sx;
      const age = (saison - s.saison[i]) / 6.0;
      const c = mixColor(rgb(0.50, 0.44, 0.24), rgb(0.33, 0.24, 0.17), age > 1 ? 1 : age);
      const p = s.parent[i];
      if (p < 0) { ax = bx; ay = v.sol; ra = 1.35 * rb; }
      else { ax = v.ox + (s.x[p] + dx) * v.sx; ay = v.sol - s.y[p] * v.sx; ra = s.r[p] * v.sx; }
      if (rb < 0.45) { alpha = rb / 0.45; rb = 0.45; }
      ra = ra < rb ? rb : ra;
      drawBranch(im, ax, ay, ra, bx, by, rb, mixColor(c, ciel, brume), alpha, hash01(s.arbre[i], 0, 3), 0);
    }
    const teinte = hash01(s.arbre[debut], 0, 5);
    const fonce = mixColor(rgb(0.08, 0.20, 0.07), rgb(0.06, 0.18, 0.12), teinte);
    const clair = mixColor(rgb(0.58, 0.70, 0.22), rgb(0.40, 0.62, 0.32), teinte);
    const erable = 0.30 * v.sx >= 4;
    for (let i = debut; i < fin; i++) {
      const nbFeuilles = !s.present[i] ? 0 : (s.bourgeon[i] ? (erable ? 8 : 12) : (saison - s.saison[i] < 3 ? (erable ? 3 : 4) : 0));
      const ar = s.arbre[i], nu = s.num[i];
      for (let k = 0; k < nbFeuilles; k++) {
        const a = 6.2832 * hash01(ar, nu, 10 + k), d = 0.48 * Math.sqrt(hash01(ar, nu, 20 + k));
        const cx = s.x[i] + dx + d * Math.cos(a), cy = s.y[i] + 0.08 + 0.8 * d * Math.sin(a);
        const ton = 0.05 + 0.65 * (cy / hauteurArbre) + 0.25 * hash01(ar, nu, 40 + k) - 0.12 * Math.cos(a);
        const c = leafColor(fonce, clair, ton, hash01(ar, nu, 60 + k), hash01(ar, nu, 70 + k));
        const px = v.ox + cx * v.sx, py = v.sol - cy * v.sx;
        if (erable) {
          const taille = (0.26 + 0.14 * hash01(ar, nu, 30 + k)) * v.sx;
          const angle = 1.5708 - a + (hash01(ar, nu, 80 + k) - 0.5) * 1.4;
          drawMapleLeaf(im, px + 0.12 * taille, py + 0.15 * taille, taille, angle, mixColor(fonce, ciel, brume), 0.30);
          drawMapleLeaf(im, px, py, taille, angle, mixColor(c, ciel, brume), 0.95);
        } else {
          let r = (0.09 + 0.10 * hash01(ar, nu, 30 + k)) * v.sx;
          r = r < 0.8 ? 0.8 : r;
          drawDisc(im, px + 0.3 * r, py + 0.35 * r, r, mixColor(mixColor(fonce, c, 0.3), ciel, brume), 0.45);
          drawDisc(im, px, py, r, mixColor(c, ciel, brume), 0.85);
        }
      }
    }
  }

  function renderScene(im, v, s, saison, progres) {
    computeRadii(s, saison);
    drawBackground(im, v);
    const debut = treeStarts(s);
    for (let k = 0; k < s.K; k++) {
      const pied = debut[k];
      let large = 0;
      for (let i = debut[k]; i < debut[k + 1]; i++) {
        const e = Math.abs(f(s.x[i] - s.x[pied]));
        if (s.present[i] && e > large) large = e;
      }
      drawSoftEllipse(im, v.ox + s.x[pied] * v.sx, v.sol + 0.01 * v.h, (large + 0.8) * v.sx, 0.022 * v.h, rgb(0.12, 0.15, 0.07), 0.55);
    }
    const ordre = treeOrder(s);
    for (let a = 0; a < s.K; a++) {
      const k = ordre[a], brume = 0.45 * treeDepth(s, k);
      drawTree(im, v, s, debut[k], debut[k + 1], 0, saison, brume);
      if (s.C > 0) {
        drawTree(im, v, s, debut[k], debut[k + 1], -s.C, saison, brume);
        drawTree(im, v, s, debut[k], debut[k + 1], s.C, saison, brume);
      }
      if (progres) progres((a + 1) / s.K);
    }
  }

  // composantes de l'image en octets RGBA (comme l'écriture du PNG : arrondi au plus proche)
  function toRGBA(im) {
    const n = im.w * im.h, o = new Uint8ClampedArray(4 * n), q = im.pix;
    for (let i = 0; i < n; i++) {
      o[4 * i] = Math.floor(clamp01(q[3 * i]) * 255 + 0.5);
      o[4 * i + 1] = Math.floor(clamp01(q[3 * i + 1]) * 255 + 0.5);
      o[4 * i + 2] = Math.floor(clamp01(q[3 * i + 2]) * 255 + 0.5);
      o[4 * i + 3] = 255;
    }
    return o;
  }

  /* ------------------------------------------------------------------ GIF animé : palette adaptée, tramage, LZW */

  function Octets() { this.buf = new Uint8Array(1 << 16); this.n = 0; this.acc = 0; this.nbits = 0; }
  Octets.prototype.push = function (v) {
    if (this.n === this.buf.length) { const b = new Uint8Array(this.buf.length * 2); b.set(this.buf); this.buf = b; }
    this.buf[this.n++] = v;
  };
  Octets.prototype.bits = function (v, n) {
    this.acc |= v << this.nbits; this.nbits += n;
    while (this.nbits >= 8) { this.push(this.acc & 0xFF); this.acc >>>= 8; this.nbits -= 8; }
  };
  Octets.prototype.flush = function () { if (this.nbits > 0) this.push(this.acc & 0xFF); this.acc = 0; this.nbits = 0; };
  Octets.prototype.le16 = function (v) { this.push(v & 0xFF); this.push((v >> 8) & 0xFF); };
  Octets.prototype.octets = function () { return this.buf.slice(0, this.n); };

  function buildPalette(ref) {
    const nb = new Float64Array(32768), ordre = new Int32Array(32768);
    const palette = [], table = new Uint8Array(32768), q = ref.pix;
    for (let i = 0; i < ref.w * ref.h; i++) {
      nb[(Math.trunc(clamp01(q[3 * i]) * 31 + 0.5) << 10) | (Math.trunc(clamp01(q[3 * i + 1]) * 31 + 0.5) << 5) | Math.trunc(clamp01(q[3 * i + 2]) * 31 + 0.5)]++;
    }
    let m = 0;
    for (let k = 0; k < 32768; k++) {
      if (nb[k] > 0) {
        let j = m - 1;
        while (j >= 0 && nb[ordre[j]] < nb[k]) { ordre[j + 1] = ordre[j]; j--; }
        ordre[j + 1] = k; m++;
      }
    }
    for (let passe = 0; passe < 2 && palette.length < 256; passe++) {
      for (let a = 0; a < m && palette.length < 256; a++) {
        const k = ordre[a];
        let loin = true;
        for (let c = 0; c < palette.length && loin; c++) {
          const dr = (k >> 10) - palette[c][0], dv = ((k >> 5) & 31) - palette[c][1], db = (k & 31) - palette[c][2];
          const d2 = dr * dr + dv * dv + db * db;
          loin = passe === 0 ? d2 >= 4 : d2 > 0;
        }
        if (loin) palette.push([k >> 10, (k >> 5) & 31, k & 31]);
      }
    }
    for (let c = palette.length; c < 256; c++) { const g = (c - palette.length) % 32; palette.push([g, g, g]); }
    for (let k = 0; k < 32768; k++) {
      let meilleur = 0, dmin = 1 << 30;
      const r = k >> 10, v = (k >> 5) & 31, b = k & 31;
      for (let c = 0; c < 256; c++) {
        const dr = r - palette[c][0], dv = v - palette[c][1], db = b - palette[c][2];
        const d = 3 * dr * dr + 4 * dv * dv + 2 * db * db;
        if (d < dmin) { dmin = d; meilleur = c; }
      }
      table[k] = meilleur;
    }
    return { palette, table };
  }

  function openGif(w, h, ref) {
    const g = { w, h, o: new Octets(), ...buildPalette(ref) };
    for (const c of 'GIF89a') g.o.push(c.charCodeAt(0));
    g.o.le16(w); g.o.le16(h); g.o.push(0xF7); g.o.push(0); g.o.push(0);
    for (const c of g.palette) for (let k = 0; k < 3; k++) g.o.push(Math.trunc(c[k] * 255 / 31));
    const ext = [0x21, 0xFF, 0x0B, ...'NETSCAPE2.0'.split('').map(c => c.charCodeAt(0)), 0x03, 0x01, 0x00, 0x00, 0x00];
    for (const b of ext) g.o.push(b);
    return g;
  }

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function addGifFrame(g, im, delai) {
    const n = g.w * g.h, idx = new Uint8Array(n), fils = new Int16Array(4096 * 256), q = im.pix;
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const p = 3 * (y * im.w + x), s = (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16.0;
        let r = Math.trunc(clamp01(q[p]) * 31 + s), v = Math.trunc(clamp01(q[p + 1]) * 31 + s), b = Math.trunc(clamp01(q[p + 2]) * 31 + s);
        r = r > 31 ? 31 : r; v = v > 31 ? 31 : v; b = b > 31 ? 31 : b;
        idx[y * g.w + x] = g.table[(r << 10) | (v << 5) | b];
      }
    }
    const o = g.o;
    for (const b of [0x21, 0xF9, 0x04, 0x00]) o.push(b);
    o.le16(delai); o.push(0); o.push(0);
    o.push(0x2C); o.le16(0); o.le16(0); o.le16(g.w); o.le16(g.h); o.push(0); o.push(8);
    const z = new Octets();
    let taille = 9, maxCode = 257, cur = idx[0];
    z.bits(256, taille);
    for (let i = 1; i < n; i++) {
      const c = idx[i];
      if (fils[cur * 256 + c] !== 0) cur = fils[cur * 256 + c];
      else {
        z.bits(cur, taille);
        fils[cur * 256 + c] = ++maxCode;
        if (maxCode >= (1 << taille)) taille++;
        if (maxCode === 4095) { z.bits(256, taille); fils.fill(0); taille = 9; maxCode = 257; }
        cur = c;
      }
    }
    z.bits(cur, taille); z.bits(257, taille); z.flush();
    for (let i = 0; i < z.n; i += 255) {
      const k = Math.min(255, z.n - i);
      o.push(k);
      for (let j = 0; j < k; j++) o.push(z.buf[i + j]);
    }
    o.push(0);
  }

  function closeGif(g) { g.o.push(0x3B); return g.o.octets(); }

  /* ------------------------------------------------------------------ rendu complet */

  /* options : largeur (px), gif (booléen), delai (centièmes de seconde par saison) ; progres(etape, fraction) */
  function rendre(texte, options, progres) {
    EN = !!(options && options.en);
    const s = lireFichier(texte);
    const w = options.largeur || 1600;
    const signaler = progres || (() => {});
    computeRadii(s, s.saisonMax);
    let v = setupView(s, w);
    let im = createImage(v.w, v.h);
    renderScene(im, v, s, s.saisonMax, fr => signaler('png', fr));
    const res = { infos: { foret: s.foret, K: s.K, nb: s.nb, saisons: s.saisonMax }, png: { w: v.w, h: v.h, rgba: toRGBA(im) }, gif: null };
    if (options.gif) {
      const wg = w > 800 ? 800 : w;
      computeRadii(s, s.saisonMax);
      v = setupView(s, wg);
      im = createImage(v.w, v.h);
      renderScene(im, v, s, s.saisonMax);
      const g = openGif(v.w, v.h, im);
      // au plus une quarantaine d'images : une saison sur pas, puis toujours la dernière, affichée plus longtemps
      const pas = Math.max(1, Math.trunc((s.saisonMax + 39) / 40));
      let nbImages = 0;
      for (let saison = 0; saison < s.saisonMax; saison += pas) {
        renderScene(im, v, s, saison);
        addGifFrame(g, im, Math.min(655, (options.delai || 15) * pas));
        nbImages++;
        signaler('gif', saison / s.saisonMax);
      }
      renderScene(im, v, s, s.saisonMax);
      addGifFrame(g, im, 250);
      signaler('gif', 1);
      res.gif = closeGif(g);
      res.gifTaille = { w: v.w, h: v.h, images: nbImages + 1, pas };
    }
    return res;
  }

  return { rendre, lireFichier, hash01 };
}

if (typeof module !== 'undefined' && module.exports) module.exports = { fabriqueMoteur };

/* ==================================================================== la page */
if (typeof document !== 'undefined') {
  (function () {
    'use strict';
    const zone = document.getElementById('depot');
    if (!zone) return;
    const choix = document.getElementById('vzFichier');
    const largeur = document.getElementById('vzLargeur');
    const avecGif = document.getElementById('vzGif');
    const duree = document.getElementById('vzDuree');
    const avance = document.querySelector('.vz-avance');
    const barre = document.querySelector('.vz-prog > span');
    const etat = document.querySelector('.vz-etat');
    const resultat = document.getElementById('resultat-vue');
    const imgPng = document.getElementById('vzPng'), imgGif = document.getElementById('vzImgGif');
    const lienPng = document.getElementById('vzLienPng'), lienGif = document.getElementById('vzLienGif');
    const figGif = document.getElementById('vzFigGif');
    const infos = document.querySelector('.vz-infos');
    let urls = [], travail = null;
    // langue de la page : textes, séparateur décimal, unités
    const EN = document.documentElement.lang === 'en';
    const T = (fr, en) => (EN ? en : fr);
    const decimal = (v, n) => (EN ? v.toFixed(n) : v.toFixed(n).replace('.', ','));
    const entier = v => v.toLocaleString(EN ? 'en-GB' : 'fr-FR');

    function message(texte, erreurVisible) {
      etat.textContent = texte;
      etat.classList.toggle('vz-erreur', !!erreurVisible);
    }
    function nomDeBase(nom) { return (nom || 'arbre').replace(/\.[^.]*$/, '') || 'arbre'; }
    // fichier illisible : on efface le résultat précédent, pour ne pas le confondre avec celui du fichier déposé
    function echec(texte) {
      message(texte, true);
      resultat.hidden = true;
      document.getElementById('resultat-vide').hidden = false;
    }

    // le moteur dans un Web Worker (créé depuis le texte de fabriqueMoteur : fonctionne aussi en file://)
    function creerWorker() {
      try {
        const code = `const M = (${fabriqueMoteur.toString()})();
self.onmessage = e => {
  try {
    const r = M.rendre(e.data.texte, e.data.options, (etape, fr) => self.postMessage({ type: 'progres', etape, fr }));
    const transfert = [r.png.rgba.buffer];
    if (r.gif) transfert.push(r.gif.buffer);
    self.postMessage({ type: 'fini', r }, transfert);
  } catch (err) { self.postMessage({ type: 'erreur', message: err.lisible ? err.message : (e.data.options.en ? 'Unexpected error: ' : 'Erreur inattendue : ') + err.message }); }
};`;
        return new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
      } catch (e) {
        return null;
      }
    }

    function afficher(r, nom) {
      urls.forEach(u => URL.revokeObjectURL(u));
      urls = [];
      const c = document.createElement('canvas');
      c.width = r.png.w; c.height = r.png.h;
      c.getContext('2d').putImageData(new ImageData(r.png.rgba, r.png.w, r.png.h), 0, 0);
      c.toBlob(b => {
        const u = URL.createObjectURL(b);
        urls.push(u);
        imgPng.src = u;
        lienPng.href = u;
        lienPng.download = nomDeBase(nom) + '.png';
        lienPng.textContent = T(`Télécharger le PNG (${r.png.w} × ${r.png.h}, ${decimal(b.size / 1e6, 1)} Mo)`,
          `Download the PNG (${r.png.w} × ${r.png.h}, ${decimal(b.size / 1e6, 1)} MB)`);
      }, 'image/png');
      if (r.gif) {
        const b = new Blob([r.gif], { type: 'image/gif' }), u = URL.createObjectURL(b);
        urls.push(u);
        imgGif.src = u;
        lienGif.href = u;
        lienGif.download = nomDeBase(nom) + '.gif';
        const g = r.gifTaille;
        lienGif.textContent = T(`Télécharger le GIF (${g.w} × ${g.h}, ${g.images} images${g.pas > 1 ? ', une saison sur ' + g.pas : ''}, ${decimal(b.size / 1e6, 1)} Mo)`,
          `Download the GIF (${g.w} × ${g.h}, ${g.images} frames${g.pas > 1 ? ', one season in ' + g.pas : ''}, ${decimal(b.size / 1e6, 1)} MB)`);
        figGif.hidden = false;
      } else {
        figGif.hidden = true;
      }
      const i = r.infos;
      infos.textContent = i.foret
        ? T(`Une forêt de ${i.K} arbres, ${entier(i.nb)} rameaux, ${i.saisons} saisons.`, `A forest of ${i.K} trees, ${entier(i.nb)} branches, ${i.saisons} seasons.`)
        : T(`Un arbre de ${entier(i.nb)} rameaux, ${i.saisons} saisons.`, `A tree of ${entier(i.nb)} branches, ${i.saisons} seasons.`);
      resultat.hidden = false;
      document.getElementById('resultat-vide').hidden = true;
    }

    function traiter(fichier) {
      if (!fichier) return;
      if (travail) travail.terminate();
      const options = { largeur: Number(largeur.value), gif: avecGif.checked, delai: Math.round(Number(duree.value) * 100), en: EN };
      avance.hidden = false;
      barre.style.width = '0%';
      message(T(`Lecture de ${fichier.name}…`, `Reading ${fichier.name}…`));
      const t0 = performance.now();
      fichier.text().then(texte => {
        const fin = r => {
          barre.style.width = '100%';
          const t = decimal((performance.now() - t0) / 1000, 1);
          message(T(`${fichier.name} : terminé en ${t} s.`, `${fichier.name}: done in ${t} s.`));
          afficher(r, fichier.name);
        };
        travail = creerWorker();
        if (travail) {
          travail.onmessage = e => {
            const d = e.data;
            if (d.type === 'progres') {
              const part = options.gif ? (d.etape === 'png' ? 0.5 * d.fr : 0.5 + 0.5 * d.fr) : d.fr;
              barre.style.width = (100 * part).toFixed(1) + '%';
              message(d.etape === 'png' ? T('Dessin de l\'image…', 'Drawing the image…') : T('Dessin des saisons du GIF…', 'Drawing the GIF seasons…'));
            } else if (d.type === 'fini') { fin(d.r); travail.terminate(); travail = null; }
            else { echec(d.message); travail.terminate(); travail = null; }
          };
          travail.postMessage({ texte, options });
        } else {
          // sans Web Worker : calcul dans la page (elle reste figée pendant le calcul)
          setTimeout(() => {
            try { fin(fabriqueMoteur().rendre(texte, options)); }
            catch (err) { echec(err.lisible ? err.message : T('Erreur inattendue : ', 'Unexpected error: ') + err.message); }
          }, 30);
        }
      });
    }

    zone.addEventListener('click', () => choix.click());
    zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choix.click(); } });
    choix.addEventListener('change', () => traiter(choix.files[0]));
    ['dragenter', 'dragover'].forEach(t => zone.addEventListener(t, e => { e.preventDefault(); zone.classList.add('vz-survol'); }));
    ['dragleave', 'drop'].forEach(t => zone.addEventListener(t, e => { e.preventDefault(); zone.classList.remove('vz-survol'); }));
    zone.addEventListener('drop', e => traiter(e.dataTransfer.files[0]));
  })();
}
