// Ajouter un aliment : scanner, rechercher, récents, perso
import { esc, icons, $, toast, sheetOpen } from '../ui.js';
import { MEALS, recentFoods, customFoods, findFoodByCode, deleteFood } from '../store.js';
import { fmt } from '../nutrition.js';
import { searchCiqual, searchOFF, getProduct, norm, loadCiqual } from '../foods.js';
import { Scanner } from '../scanner.js';
import { openFoodSheet, openNotFoundSheet, openCustomFoodSheet } from '../sheets.js';

let scanner = null;
let offCtrl = null;
let typingTimer = null;

export function stopScanner() {
  scanner?.stop();
  scanner = null;
}

const badge = (src) => ({ ciqual: '<span class="badge ciqual">ciqual</span>', off: '<span class="badge off">off</span>', perso: '<span class="badge perso">perso</span>' }[src] || '');

function resultRow(f, idx, list) {
  const k = f.per100?.kcal;
  return `<button class="result" data-list="${list}" data-i="${idx}">
    ${f.img ? `<img class="thumb" src="${esc(f.img)}" alt="" loading="lazy" />` : ''}
    <span class="grow"><div class="t">${esc(f.name)}</div><div class="s">${badge(f.source)}${esc(f.brand || f.group || '')}</div></span>
    <span class="k">${fmt(k)}<small>kcal/100g</small></span>
  </button>`;
}

export function renderAdd(root, ui, nav) {
  stopScanner();
  const tab = ui.addTab || 'search';
  root.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="a-back" aria-label="Retour">${icons.back}</button>
      <div class="head" style="font-size:24px">ajouter ${'<span class="star">✦</span>'}</div>
      <span style="width:42px"></span>
    </header>
    <div class="chips section" id="a-meals">
      ${MEALS.map((m) => `<button class="chip ${m.id === ui.addMeal ? 'on' : ''}" data-meal="${m.id}">${m.label}</button>`).join('')}
    </div>
    <div class="tabs section">
      ${[['scan', 'scanner'], ['search', 'chercher'], ['recent', 'récents'], ['perso', 'perso']].map(([id, l]) => `<button class="tab ${tab === id ? 'on' : ''}" data-tab="${id}">${l}</button>`).join('')}
    </div>
    <div id="a-body" class="section"></div>`;

  $('#a-back', root).onclick = () => nav.go('#/');
  root.querySelectorAll('[data-meal]').forEach((b) => (b.onclick = () => {
    ui.addMeal = b.dataset.meal;
    root.querySelectorAll('[data-meal]').forEach((x) => x.classList.toggle('on', x === b));
  }));
  root.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { ui.addTab = b.dataset.tab; renderAdd(root, ui, nav); }));

  const body = $('#a-body', root);
  const lists = {};

  // Ouvre la fiche d'un aliment, et revient au journal après l'ajout
  const pick = (food, { resume } = {}) => {
    stopScanner();
    openFoodSheet({
      food, meal: ui.addMeal, date: ui.date,
      onDone: () => { ui.justAdded = true; nav.go('#/'); },
      onCancel: () => resume?.(),
    });
  };
  const bindResults = (el) => el.querySelectorAll('.result').forEach((b) => (b.onclick = () => pick(lists[b.dataset.list][+b.dataset.i])));

  /* ---------- Scanner ---------- */
  if (tab === 'scan') {
    body.innerHTML = `
      <div class="scanner" id="scan-box">
        <video id="scan-video" playsinline muted></video>
        <div class="scan-frame"></div><div class="scan-line"></div>
        <div class="scan-hint">vise le code-barres</div>
        <div class="scan-tools"><button class="icon-btn" id="torch" hidden aria-label="Lampe">${icons.flash}</button></div>
      </div>
      <div class="search section" style="margin-top:12px">
        ${icons.barcode}
        <input id="code-in" inputmode="numeric" placeholder="ou tape le code-barres" />
        <button class="btn btn-primary btn-sm" id="code-go">ok</button>
      </div>`;

    const lookup = async (code) => {
      code = String(code).replace(/\D/g, '');
      if (code.length < 6) { toast('code invalide'); return; }
      stopScanner();
      const local = findFoodByCode(code);
      if (local) return pick(local, { resume: start });
      toast('recherche…');
      try {
        const p = await getProduct(code);
        if (!p || p.incomplete) {
          openNotFoundSheet({
            code,
            onRetry: start,
            onCreate: () => openCustomFoodSheet({ code, onSaved: (f) => pick(f, { resume: start }), onCancel: start }),
          });
        } else pick(p, { resume: start });
      } catch (e) {
        toast('pas de connexion ?');
        start();
      }
    };

    async function start() {
      if (ui.addTab !== 'scan' || !document.body.contains(body) || sheetOpen()) return;
      const video = $('#scan-video', body);
      if (!video) return;
      stopScanner();
      scanner = new Scanner(video, lookup);
      try {
        await scanner.start();
        const tb = $('#torch', body);
        if (scanner?.torchSupported && tb) {
          tb.hidden = false; let on = false;
          tb.onclick = () => { on = !on; scanner.torch(on); };
        }
      } catch (e) {
        const box = $('#scan-box', body);
        if (box) box.innerHTML = `<div class="scan-msg">${e.name === 'NotAllowedError' ? "Autorise l'accès à la caméra dans les réglages de Safari pour scanner." : 'Caméra indisponible ici. Tape le code-barres juste en dessous.'}</div>`;
      }
    }
    $('#code-go', body).onclick = () => lookup($('#code-in', body).value);
    $('#code-in', body).addEventListener('keydown', (e) => { if (e.key === 'Enter') lookup(e.target.value); });
    start();
    return;
  }

  /* ---------- Recherche ---------- */
  if (tab === 'search') {
    body.innerHTML = `
      <form class="search" id="s-form" autocomplete="off">
        ${icons.search}
        <input id="s-in" type="search" enterkeyhint="search" placeholder="riz, poulet, skyr, nutella…" value="${esc(ui.query || '')}" />
      </form>
      <div id="s-res"></div>`;
    const input = $('#s-in', body);
    const res = $('#s-res', body);
    let offState = { q: '', items: [], loading: false, error: false };

    const draw = async (q) => {
      const nq = norm(q);
      if (!nq) {
        res.innerHTML = `<p class="muted small center" style="margin-top:28px">Les <b>aliments bruts</b> viennent de la table officielle Ciqual (ANSES).<br>Les <b>produits du commerce</b> viennent d'Open Food Facts.</p>`;
        return;
      }
      const mine = recentFoods(200).filter((f) => nq.split(' ').every((w) => norm(f.name + ' ' + (f.brand || '')).includes(w))).slice(0, 5);
      const raw = await searchCiqual(q, 20);
      if (norm(input.value) !== nq) return;
      lists.mine = mine; lists.raw = raw; lists.off = offState.q === nq ? offState.items : [];
      res.innerHTML = `
        ${mine.length ? `<div class="list-title">dans tes aliments</div><div class="card" style="padding:4px 16px">${mine.map((f, i) => resultRow(f, i, 'mine')).join('')}</div>` : ''}
        <div class="list-title"><span>produits du commerce</span>${offState.loading ? '<span class="loader"></span>' : ''}</div>
        <div class="card" style="padding:4px 16px">${offState.q === nq && offState.items.length ? offState.items.map((f, i) => resultRow(f, i, 'off')).join('') : `<p class="small muted" style="margin:12px 0">${offState.loading ? 'recherche dans Open Food Facts…' : offState.error ? 'Open Food Facts limite le nombre de recherches : attends une minute, ou scanne le produit (le scan n\'est pas limité).' : offState.q === nq ? 'Aucun produit trouvé. Essaie le scan, c\'est plus fiable.' : '<button class="add-pill" id="off-go">chercher dans les produits</button>'}</p>`}</div>
        <div class="list-title">aliments bruts · ciqual</div>
        <div class="card" style="padding:4px 16px">${raw.length ? raw.map((f, i) => resultRow(f, i, 'raw')).join('') : '<p class="small muted" style="margin:12px 0">Rien trouvé.</p>'}</div>`;
      bindResults(res);
      const go = $('#off-go', res);
      if (go) go.onclick = () => runOFF(input.value);
    };

    const runOFF = async (q) => {
      const nq = norm(q);
      if (nq.length < 3) return;
      offCtrl?.abort();
      offCtrl = new AbortController();
      offState = { q: nq, items: [], loading: true, error: false };
      draw(q);
      try {
        const items = await searchOFF(q, offCtrl.signal);
        offState = { q: nq, items, loading: false, error: false };
      } catch (e) {
        if (e.name === 'AbortError') return;
        offState = { q: nq, items: [], loading: false, error: true };
      }
      if (norm(input.value) === nq) draw(input.value);
    };

    input.addEventListener('input', () => {
      ui.query = input.value;
      clearTimeout(typingTimer);
      // Open Food Facts limite les recherches (~10/min) : on ne l'interroge qu'à la validation
      typingTimer = setTimeout(() => draw(input.value), 120);
    });
    $('#s-form', body).onsubmit = (e) => { e.preventDefault(); input.blur(); runOFF(input.value); };
    loadCiqual().then(() => draw(input.value));
    if (!ui.query) setTimeout(() => input.focus(), 200);
    return;
  }

  /* ---------- Récents ---------- */
  if (tab === 'recent') {
    const items = recentFoods(60);
    lists.recent = items;
    body.innerHTML = items.length
      ? `<div class="card" style="padding:4px 16px">${items.map((f, i) => resultRow(f, i, 'recent')).join('')}</div>`
      : `<p class="muted center" style="margin-top:30px">Tes aliments apparaîtront ici dès que tu en auras ajouté.</p>`;
    bindResults(body);
    return;
  }

  /* ---------- Perso ---------- */
  if (tab === 'perso') {
    const items = customFoods();
    lists.perso = items;
    body.innerHTML = `
      <button class="btn btn-primary" id="p-new">${icons.plus.replace('<svg', '<svg width="18" height="18"')} créer un aliment</button>
      <p class="small muted center" style="margin:10px 0 0">Pour un produit introuvable ou une recette maison.</p>
      ${items.length ? `<div class="card section" style="padding:4px 16px">${items.map((f, i) => resultRow(f, i, 'perso')).join('')}</div>` : ''}`;
    bindResults(body);
    $('#p-new', body).onclick = () => openCustomFoodSheet({ onSaved: (f) => pick(f) });
    // appui long : modifier / supprimer
    body.querySelectorAll('.result').forEach((b) => {
      let t;
      b.addEventListener('touchstart', () => { t = setTimeout(() => editCustom(lists.perso[+b.dataset.i]), 550); }, { passive: true });
      ['touchend', 'touchmove'].forEach((ev) => b.addEventListener(ev, () => clearTimeout(t), { passive: true }));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); editCustom(lists.perso[+b.dataset.i]); });
    });
    const editCustom = (f) => openCustomFoodSheet({ food: f, onSaved: () => renderAdd(root, ui, nav) });
  }
}
