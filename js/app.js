// qal ✦ — point d'entrée : navigation entre les écrans
import { $, dateStr, mealForNow, sparkles, splash, closeSheet, sheetOpen, toast } from './ui.js';
import { getState, subscribe } from './store.js';
import { renderToday } from './views/today.js';
import { renderAdd, stopScanner } from './views/add.js';
import { renderProfile } from './views/profile.js';
import { renderMicros } from './views/micros.js';
import { renderRecipes, renderRecipeEditor } from './views/recipes.js';
import { renderChat } from './views/chat.js';
import { startOnboarding, renderOnboarding } from './views/onboarding.js';
import { openFoodSheet } from './sheets.js';
import { loadCiqual } from './foods.js';
import * as drive from './drive.js';
import { applyPeriod, bigStars } from './fx.js';

const root = $('#app');
const ui = {
  date: dateStr(),
  addMeal: mealForNow(),
  addTab: 'search',
  query: '',
  showMicros: false,
};

const route = () => (location.hash || '#/').split('?')[0];

const nav = {
  go(hash) {
    if (location.hash === hash) render();
    else location.hash = hash;
  },
  render,
  openAdd(meal, tab) {
    ui.addMeal = meal || (ui.date === dateStr() ? mealForNow() : 'lunch');
    ui.addTab = tab || 'search';
    ui.query = '';
    nav.go('#/add');
  },
  editEntry(id) {
    const e = getState().entries[id];
    if (!e || e.deleted) return;
    openFoodSheet({ food: e, grams: e.grams, meal: e.meal, date: e.date, entryId: id, onDone: () => { ui.justAdded = !getState().entries[id]?.deleted; render(); } });
  },
};

function render() {
  const r = route();
  if (r !== '#/add') stopScanner();
  if (sheetOpen()) closeSheet({ silent: true });

  if (!getState().profile && r !== '#/onboarding') { location.replace('#/onboarding'); return; }
  if (r === '#/onboarding') {
    startOnboarding();
    renderOnboarding(root, (finished) => nav.go('#/'));
  } else if (r === '#/add') renderAdd(root, ui, nav);
  else if (r === '#/profile') renderProfile(root, ui, nav);
  else if (r === '#/micros') renderMicros(root, ui, nav);
  else if (r === '#/recipes') renderRecipes(root, ui, nav);
  else if (r === '#/recipe') renderRecipeEditor(root, ui, nav);
  else if (r === '#/chat') renderChat(root, ui, nav);
  else renderToday(root, ui, nav);
  renderTabbar(r);
}

/* ---------- Barre d'onglets ---------- */
const TABS = [
  { hash: '#/', label: 'journal', icon: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>' },
  { hash: '#/micros', label: 'micros', icon: '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>' },
  { hash: '#/chat', label: 'ia', center: true },
  { hash: '#/recipes', label: 'recettes', icon: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M8 7c0-1.5 1-2 1-3M12 7c0-1.5 1-2 1-3M16 7c0-1.5 1-2 1-3"/>' },
  { hash: '#/profile', label: 'profil', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>' },
];
const SHOW_TABBAR = ['#/', '#/micros', '#/recipes', '#/profile'];
function renderTabbar(r) {
  let bar = document.getElementById('tabbar');
  if (!bar) {
    bar = document.createElement('nav');
    bar.id = 'tabbar';
    bar.setAttribute('aria-label', 'Navigation');
    bar.innerHTML = TABS.map((t) => t.center
      ? `<a href="${t.hash}" class="tab-ai" aria-label="Parler à l'IA"><span class="tab-ai-star">✦</span></a>`
      : `<a href="${t.hash}" class="tab-item" data-hash="${t.hash}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${t.icon}</svg><span>${t.label}</span></a>`).join('');
    document.body.appendChild(bar);
  }
  const route = r === '' ? '#/' : r;
  bar.hidden = !SHOW_TABBAR.includes(route);
  document.body.classList.toggle('has-tabbar', !bar.hidden);
  document.body.classList.toggle('page-chat', route === '#/chat');
  bar.querySelectorAll('.tab-item').forEach((a) => a.classList.toggle('on', a.dataset.hash === route));
}

// Changement d'écran : instantané, sans animation
window.addEventListener('hashchange', () => {
  stopScanner();
  render();
  window.scrollTo(0, 0);
});

// Re-dessine le journal quand les données changent (ex : après une synchro)
subscribe(({ fromSync }) => {
  const r = route();
  if (fromSync && (r === '#/' || r === '')) { if (!sheetOpen()) render(); }
  if (!fromSync) drive.scheduleSync(onSyncDone);
});

function onSyncDone(err) {
  if (err?.auth) toast('synchro en pause : reconnecte Google dans ton profil');
}

// Revenir sur l'appli : nouveau jour + synchro
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const today = dateStr();
    if (ui.lastSeenDay && ui.lastSeenDay !== today && ui.date === ui.lastSeenDay) { ui.date = today; if (route() === '#/') render(); }
    ui.lastSeenDay = today;
    applyPeriod();
    if (drive.isConnected() && drive.hasValidToken()) drive.sync().catch(() => {});
  } else {
    stopScanner();
  }
});
ui.lastSeenDay = dateStr();

/* ---------- Démarrage ---------- */
applyPeriod();
setInterval(applyPeriod, 60_000);
sparkles();
bigStars();
render();
splash();
loadCiqual().catch(() => {});
if (drive.isConnected() && drive.hasValidToken()) drive.sync().catch(() => {});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
