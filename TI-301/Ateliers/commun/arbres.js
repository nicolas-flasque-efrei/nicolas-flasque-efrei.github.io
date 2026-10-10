/* Ateliers TI301 — outils communs pour les arbres binaires : construction, analyse et dessin. */
window.Arbres = (() => {
'use strict';
const { S } = window.Atelier;
let nid = 1;
const reset = () => { nid = 1; };
const node = (v, left = null, right = null) => ({ id: nid++, v, left, right });
const MAXN = 31;

/* Notation parenthésée : (valeur gauche droit), « . » pour un sous-arbre vide, un symbole seul pour une feuille.
   Exemple : (- (+ 3 1) (/ 7 (x 3 2))) */
function parse(text) {
  const toks = text.match(/[()]|[^\s()]+/g) || [];
  let i = 0, count = 0;
  function T() {
    const t = toks[i];
    if (t == null) throw new Error('expression incomplète : il manque une parenthèse fermante ?');
    if (t === ')') throw new Error('parenthèse fermante inattendue.');
    if (t === '.' || t === '_' || t.toLowerCase() === 'null') { i++; return null; }
    if (t !== '(') { i++; count++; return node(t); }
    i++;
    const v = toks[i];
    if (v == null || v === '(' || v === ')') throw new Error('après « ( », on attend la valeur du nœud.');
    i++; count++;
    const n = node(v);
    if (toks[i] !== ')') n.left = T();
    if (toks[i] !== ')') n.right = T();
    if (toks[i] !== ')') throw new Error(`un nœud a au plus deux fils (près de « ${toks[i] || 'fin'} »).`);
    i++;
    return n;
  }
  const root = T();
  if (i < toks.length) throw new Error(`texte en trop après l'arbre : « ${toks.slice(i).join(' ')} ».`);
  if (count > MAXN) throw new Error(`arbre trop grand (${MAXN} nœuds au plus).`);
  return root;
}
const check = text => { const save = nid; try { parse(text); return ''; } catch (e) { return e.message; } finally { nid = save; } };

/* Arbre binaire de recherche construit par insertions successives (les doublons sont ignorés). */
function bst(vals) {
  let root = null; const dups = [];
  for (const v of vals) {
    if (!root) { root = node(v); continue; }
    let n = root;
    for (;;) {
      if (v === n.v) { dups.push(v); break; }
      const s = v < n.v ? 'left' : 'right';
      if (!n[s]) { n[s] = node(v); break; }
      n = n[s];
    }
  }
  return { root, dups };
}
const clone = n => n ? { id: n.id, v: n.v, left: clone(n.left), right: clone(n.right) } : null;
const height = n => n ? 1 + Math.max(height(n.left), height(n.right)) : -1;
const count = n => n ? 1 + count(n.left) + count(n.right) : 0;
const nodes = (n, out = []) => { if (n) { nodes(n.left, out); out.push(n); nodes(n.right, out); } return out; };
const toText = n => !n ? '.' : !n.left && !n.right ? String(n.v) : `(${n.v} ${toText(n.left)}${n.right ? ' ' + toText(n.right) : ''})`;

/* Disposition : abscisse = rang dans le parcours infixe, ordonnée = profondeur.
   Avec nulls, chaque sous-arbre vide occupe aussi une place (pour dessiner les NULL). */
function layout(root, o = {}) {
  const SX = o.sx || 54, SY = o.sy || 80, L = new Map();
  let x = null, prevNull = false;
  const place = isNull => {
    x = x === null ? 0 : x + ((isNull || prevNull) ? SX * 0.6 : SX);
    prevNull = isNull;
    return x;
  };
  (function walk(n, d, parent, side) {
    if (!n) {
      if (o.nulls && parent) L.set(`${parent.id}${side}`, { x: place(true), y: d * SY, depth: d, node: null, parent, side, isNull: true });
      return;
    }
    walk(n.left, d + 1, n, 'L');
    L.set(n.id, { x: place(false), y: d * SY, depth: d, node: n, parent, side });
    walk(n.right, d + 1, n, 'R');
  })(root, 0, null, null);
  return L;
}

/* Éléments de scène pour un arbre. o : prefix, x, y (décalage), hl {id: classe}, sub {id: texte}, sub2, ecls {id: classe du lien vers id},
   nulls (dessiner les sous-arbres vides), nullSub {cléNull: texte}, r (rayon) */
function draw(root, o = {}) {
  const pre = o.prefix || 'n', R = o.r || 20, ox = o.x || 0, oy = o.y || 0, items = [], arrows = [];
  const L = layout(root, o);
  for (const [id, p] of L) {
    if (p.isNull) {
      items.push(S.box(pre + id, ox + p.x - 17, oy + p.y - 11, 34, 22, 'NULL',
        { cls: 'ghost ' + ((o.hl && o.hl[id]) || ''), fs: 9.5, rx: 11, sub: o.nullSub && o.nullSub[id], subCls: o.subCls && o.subCls[id] }));
    } else {
      const v = String(p.node.v);
      items.push(S.circle(pre + id, ox + p.x, oy + p.y, R, v, { cls: o.hl && o.hl[id], fs: v.length > 3 ? 11 : v.length > 2 ? 13 : 15,
        sub: o.sub && o.sub[id], subCls: o.subCls && o.subCls[id], sub2: o.sub2 && o.sub2[id], sub2Pos: 'above-left', sub2Cls: o.sub2Cls && o.sub2Cls[id] }));
    }
    if (p.parent) arrows.push(S.arrow(pre + 'e' + id, pre + p.parent.id, pre + id, { nohead: !o.heads, cls: 'edge ' + ((o.ecls && o.ecls[id]) || '') + (p.isNull ? ' dash thin' : '') }));
  }
  let x0 = Infinity, x1 = -Infinity, y1 = 0;
  for (const p of L.values()) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { items, arrows, L, box: L.size ? { x0: ox + x0 - R, x1: ox + x1 + R, y0: oy - R, y1: oy + y1 + R } : { x0: ox, x1: ox, y0: oy, y1: oy } };
}

/* Commandes communes pour créer un arbre dans un script */
const commands = {
  tree: { args: 'text', argName: 'un arbre en notation parenthésée', aliases: ['arbre'], check },
  bst: { args: 'nums', aliases: ['abr', 'insert', 'inserer', 'insérer'], check: v => v.length > MAXN ? `${MAXN} valeurs au plus.` : '' },
};
const help = `tree (- (+ 3 1) (/ 7 (x 3 2)))   arbre quelconque :
     (valeur gauche droit), « . » = vide
bst 8 3 10 1 6 14                 ABR par insertions`;
function fromCommand(o) {
  if (o.cmd === 'tree') return { root: parse(o.text), label: 'tree ' + o.text.trim() };
  const r = bst(o.vals);
  return { root: r.root, dups: r.dups, label: 'bst ' + o.vals.join(' ') };
}

return { reset, node, parse, check, bst, clone, height, count, nodes, layout, draw, commands, help, fromCommand, toText, MAXN };
})();
