// qal ✦ — point d'entrée : navigation entre les écrans
import { $, dateStr, mealForNow, sparkles, splash, closeSheet, sheetOpen, toast } from './ui.js';
import { getState, subscribe } from './store.js';
import { renderToday } from './views/today.js';
import { renderAdd, stopScanner } from './views/add.js';
import { renderProfile } from './views/profile.js';
import { startOnboarding, renderOnboarding } from './views/onboarding.js';
import { openFoodSheet } from './sheets.js';
import { loadCiqual } from './foods.js';
import * as drive from './drive.js';

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
    openFoodSheet({ food: e, grams: e.grams, meal: e.meal, date: e.date, entryId: id, onDone: render });
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
  else renderToday(root, ui, nav);
}

window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

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
    if (drive.isConnected() && drive.hasValidToken()) drive.sync().catch(() => {});
  } else {
    stopScanner();
  }
});
ui.lastSeenDay = dateStr();

/* ---------- Démarrage ---------- */
sparkles();
render();
splash();
loadCiqual().catch(() => {});
if (drive.isConnected() && drive.hasValidToken()) drive.sync().catch(() => {});

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
