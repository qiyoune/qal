// Chat avec l'IA
import { esc, icons, $ } from '../ui.js';
import { loadChat, saveChat, clearChat, ask, isOnline } from '../ai.js';
import { getState } from '../store.js';

const SUGGESTIONS = [
  'Qu\'est-ce que je mange ce soir ?',
  'Il me manque combien de protéines ?',
  'Analyse ma journée',
  'Une collation rapide sous 200 kcal ?',
];

let busy = false;

export function renderChat(root, ui, nav) {
  let msgs = loadChat();
  const name = getState().profile?.name;

  root.innerHTML = `
    <div class="chat">
      <header class="topbar">
        <button class="icon-btn" id="c-back" aria-label="Retour">${icons.back}</button>
        <div class="chat-title"><span class="chat-orb">✦</span><span class="head">qal ia</span></div>
        <button class="icon-btn" id="c-clear" aria-label="Effacer la conversation">${icons.trash}</button>
      </header>
      <div class="chat-list" id="c-list"></div>
      <form class="chat-input" id="c-form" autocomplete="off">
        <textarea id="c-in" rows="1" maxlength="1000" placeholder="Pose ta question…" enterkeyhint="send"></textarea>
        <button class="chat-send" id="c-send" aria-label="Envoyer">${icons.next}</button>
      </form>
    </div>`;

  const list = $('#c-list', root);
  const input = $('#c-in', root);

  const draw = () => {
    if (!msgs.length) {
      list.innerHTML = `
        <div class="chat-empty">
          <div class="chat-big">✦</div>
          <h2>${name ? 'salut ' + esc(name.toLowerCase()) : 'salut'}</h2>
          <p class="muted">Je connais ton profil, tes objectifs et ce que tu as mangé aujourd'hui. Demande-moi ce que tu veux.</p>
          ${isOnline() ? '' : '<p class="small muted">L\'IA n\'est pas encore branchée : ajoute ta clé Gemini gratuite dans <a href="#/profile">Profil → IA</a>.</p>'}
          <div class="chat-sugg">${SUGGESTIONS.map((s) => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        </div>`;
      list.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => send(b.dataset.s)));
      return;
    }
    list.innerHTML = msgs.map((m) => `<div class="msg ${m.role}${m.error ? ' error' : ''}">${esc(m.text).replace(/\n/g, '<br>')}</div>`).join('')
      + (busy ? '<div class="msg assistant typing"><i>✦</i><i>✦</i><i>✦</i></div>' : '');
    requestAnimationFrame(() => list.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  };

  const send = async (text) => {
    text = text.trim();
    if (!text || busy) return;
    msgs.push({ role: 'user', text, at: Date.now() });
    input.value = ''; grow();
    busy = true; draw(); saveChat(msgs);
    try {
      const reply = await ask(msgs.filter((m) => !m.error));
      msgs.push({ role: 'assistant', text: reply, at: Date.now() });
    } catch (e) {
      const text = e.badKey ? 'Ta clé Gemini est refusée. Vérifie-la dans Profil → IA.'
        : e.quota ? 'Limite gratuite de Gemini atteinte pour le moment. Réessaie dans une minute (ou demain si c\'est la limite du jour).'
        : 'Je n\'arrive pas à joindre l\'IA. Vérifie ta connexion et réessaie.';
      msgs.push({ role: 'assistant', text, error: true, at: Date.now() });
    }
    busy = false; saveChat(msgs); draw();
  };

  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
  $('#c-form', root).onsubmit = (e) => { e.preventDefault(); send(input.value); };
  $('#c-back', root).onclick = () => (history.length > 1 ? history.back() : nav.go('#/'));
  $('#c-clear', root).onclick = () => { if (!msgs.length) return; clearChat(); msgs = []; draw(); };
  draw();
}
