/* TI301 — Projet « La forêt et la lumière », partie 1.
   - thème clair / sombre / Neon (mémorisé, même clé que les Ateliers TI301)
   - formules LaTeX rendues par KaTeX
   - sommaire actif, boutons « Copier », coloration du code C */

const THEME_KEY = 'ateliers-ti301-theme';
try {
  let t = localStorage.getItem(THEME_KEY);
  if (t === 'neo') t = 'neon';   // ancien thème « Neo » des Ateliers, remplacé par « Neon »
  if (t === 'light' || t === 'dark' || t === 'neon') document.documentElement.dataset.theme = t;
} catch (e) {}

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

  // formules : \( … \) dans le texte, $$ … $$ centrées (pre et code sont ignorés par KaTeX)
  if (window.renderMathInElement) {
    renderMathInElement(document.body, {
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '\\(', right: '\\)', display: false }],
      throwOnError: false,
    });
  }

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
