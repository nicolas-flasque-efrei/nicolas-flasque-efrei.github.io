/* TI301 — créer le dépôt Git de l'équipe (pages FR et EN)
   - thème Automatique / Clair / Sombre / Neon / Klear (mémorisé, même clé que le sujet et les Ateliers TI301)
   - sommaire actif, générateur du nom du dépôt, boutons « Copier » (lien du dépôt modèle, blocs de commandes) */

const THEME_KEY = 'ateliers-ti301-theme';
try {
  let t = localStorage.getItem(THEME_KEY);
  if (t === 'neo') t = 'neon';   // ancien thème « Neo » des Ateliers, remplacé par « Neon »
  if (t === 'light' || t === 'dark' || t === 'neon' || t === 'klear') document.documentElement.dataset.theme = t;
} catch (e) {}

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

  // sommaire : surligne la section en cours de lecture
  const liens = new Map([...document.querySelectorAll('.toc a')].map(a => [a.getAttribute('href').slice(1), a]));
  const sections = [...document.querySelectorAll('main section[id]')].filter(s => liens.has(s.id));
  const marquer = () => {
    let actif = sections[0];
    for (const s of sections) if (s.getBoundingClientRect().top < window.innerHeight * 0.3) actif = s;
    liens.forEach(a => a.classList.remove('active'));
    if (actif) liens.get(actif.id).classList.add('active');
  };
  window.addEventListener('scroll', marquer, { passive: true });
  marquer();

  // générateur du nom du dépôt : TI301_projet_<groupe>_<nom1>_<nom2>_<nom3>[_<nom4>]
  // noms en minuscules, sans accents ; espaces, tirets et apostrophes internes remplacés par « - »
  const nettoyer = n => n.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  document.querySelectorAll('.gen').forEach(gen => {
    const groupe = gen.querySelector('.gen-groupe');
    const noms = [...gen.querySelectorAll('.gen-nom')];
    const sortie = gen.querySelector('.gen-nomdepot');
    const bouton = gen.querySelector('.gen-out .copy');
    const maj = () => {
      const n = noms.map(i => nettoyer(i.value)).filter(x => x);
      const complet = groupe.value && n.length >= 3;
      sortie.textContent = complet ? ['TI301_projet', groupe.value, ...n].join('_') : gen.dataset.incomplet;
      sortie.classList.toggle('vide', !complet);
      bouton.disabled = !complet;
    };
    groupe.addEventListener('change', maj);
    noms.forEach(i => i.addEventListener('input', maj));
    maj();
  });

  // boutons « Copier » : un par bloc de commandes, plus ceux déjà présents dans la page (data-copy)
  const lib = document.documentElement.lang === 'en' ? ['Copy', 'Copied'] : ['Copier', 'Copié'];
  document.querySelectorAll('pre').forEach(pre => {
    const b = document.createElement('button');
    b.className = 'copy';
    b.type = 'button';
    b.textContent = lib[0];
    pre.appendChild(b);
  });
  document.addEventListener('click', ev => {
    const b = ev.target.closest('.copy');
    if (!b || b.disabled) return;
    const text = b.dataset.copy || b.parentElement.querySelector('code').textContent;
    navigator.clipboard.writeText(text).then(() => {
      b.textContent = lib[1];
      b.classList.add('ok');
      setTimeout(() => { b.textContent = lib[0]; b.classList.remove('ok'); }, 1500);
    });
  });
});
