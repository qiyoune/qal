// Chat avec l'IA
import { esc, icons, $ } from '../ui.js';
import { loadChat, saveChat, clearChat, ask, isOnline } from '../ai.js';
import { getState } from '../store.js';
import { resolveCalls, proposalHtml, applyProposal, canApply, proposalSummary } from '../aiactions.js';
import { toast } from '../ui.js';
import { attachMic, micSvg } from '../voice.js';

const SUGGESTIONS = [
  'J\'ai mangé 200 g de riz et un blanc de poulet ce midi',
  'Qu\'est-ce que je mange ce soir ?',
  'Fais-moi un bilan de la semaine',
  'Crée-moi une recette de bowl protéiné pour 2',
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
        <label class="chat-photo" aria-label="Envoyer une photo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>
          <input type="file" id="c-photo" accept="image/*" hidden />
        </label>
        <div class="chat-thumb" id="c-thumb" hidden></div>
        <textarea id="c-in" rows="1" maxlength="1000" placeholder="Pose ta question…" enterkeyhint="send"></textarea>
        <button type="button" class="mic-btn" id="c-mic" aria-label="Dicter">${micSvg}</button>
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
          ${isOnline() ? '' : '<p class="small muted">L\'IA n\'est pas encore branchée : ajoute ta clé Gemini gratuite dans <a href="#/settings">Options → IA</a>.</p>'}
          <div class="chat-sugg">${SUGGESTIONS.map((s) => `<button class="chip" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        </div>`;
      list.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => send(b.dataset.s)));
      return;
    }
    setTimeout(() => list.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
      const [mi, ai, what] = b.dataset.act.split(':');
      const a = msgs[+mi]?.actions?.[+ai];
      if (!a || a.status !== 'pending') return;
      if (what === 'ok') { a.done = applyProposal(a.p); a.status = 'done'; toast(a.done); }
      else a.status = 'cancelled';
      saveChat(msgs); draw();
    })), 0);
    list.innerHTML = msgs.map((m, mi) => `${m.image ? `<img class="msg-img" src="${m.image}" alt="photo envoyée" />` : ''}${m.text ? `<div class="msg ${m.role}${m.error ? ' error' : ''}">${esc(m.text).replace(/\n/g, '<br>')}</div>` : ''}${(m.actions || []).map((a, ai) => `
      <div class="action-card ${a.status}">
        ${proposalHtml(a.p)}
        ${a.status === 'pending'
          ? `<div class="ac-btns"><button class="btn btn-ghost btn-sm" data-act="${mi}:${ai}:no">annuler</button><button class="btn btn-primary btn-sm" data-act="${mi}:${ai}:ok" ${canApply(a.p) ? '' : 'disabled'}>valider</button></div>`
          : `<div class="ac-status">${a.status === 'done' ? '✓ ' + esc(a.done || 'fait') : 'annulé'}</div>`}
      </div>`).join('')}`).join('')
      + (busy ? '<div class="msg assistant typing"><i>✦</i><i>✦</i><i>✦</i></div>' : '');
    requestAnimationFrame(() => list.lastElementChild?.scrollIntoView({ block: 'end', behavior: 'smooth' }));
  };

  let pendingImage = null;
  const send = async (text) => {
    text = text.trim();
    if ((!text && !pendingImage) || busy) return;
    const image = pendingImage;
    pendingImage = null; $('#c-thumb', root).hidden = true; $('#c-thumb', root).innerHTML = '';
    msgs.push({ role: 'user', text: text || (image ? 'Voilà une photo.' : ''), image, at: Date.now() });
    input.value = ''; grow();
    busy = true; draw(); saveChat(msgs);
    try {
      const clean = msgs.filter((m) => !m.error);
      const history = clean.map((m, k) => ({
        role: m.role,
        text: [m.text, m.image && k !== clean.length - 1 ? '[photo envoyée plus tôt]' : '', ...(m.actions || []).map((a) => proposalSummary(a.p, a.status))].filter(Boolean).join(' ') || '…',
        image: k === clean.length - 1 ? m.image : null,
      }));
      const reply = await ask(history);
      const proposals = reply.calls?.length ? await resolveCalls(reply.calls) : [];
      const text = reply.text || (proposals.length ? 'Voilà ce que je propose, valide si c\'est bon :' : '…');
      msgs.push({ role: 'assistant', text, actions: proposals.map((p) => ({ p, status: 'pending' })), at: Date.now() });
    } catch (e) {
      const text = e.badKey ? 'Ta clé Gemini est refusée. Vérifie-la dans Options → IA.'
        : e.quota ? 'Limite gratuite de Gemini atteinte pour le moment. Réessaie dans une minute (ou demain si c\'est la limite du jour).'
        : 'Je n\'arrive pas à joindre l\'IA. Vérifie ta connexion et réessaie.';
      const detail = e.detail ? `\n(Réponse de Google : ${e.detail})` : e.message && !e.badKey && !e.quota ? `\n(${e.message})` : '';
      msgs.push({ role: 'assistant', text: text + detail, error: true, at: Date.now() });
    }
    busy = false; saveChat(msgs); draw();
  };

  // Photo : on la réduit (1024 px max) avant de l'envoyer
  $('#c-photo', root).addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      pendingImage = await shrink(file);
      const th = $('#c-thumb', root);
      th.innerHTML = `<img src="${pendingImage}" alt="" /><button type="button" aria-label="Retirer la photo">×</button>`;
      th.hidden = false;
      th.querySelector('button').onclick = () => { pendingImage = null; th.hidden = true; th.innerHTML = ''; };
      input.placeholder = 'Un détail ? (facultatif)';
      input.focus();
    } catch { toast('photo illisible'); }
  });

  const grow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; };
  input.addEventListener('input', grow);
  attachMic($('#c-mic', root), input);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input.value); } });
  $('#c-form', root).onsubmit = (e) => { e.preventDefault(); send(input.value); };
  $('#c-back', root).onclick = () => (history.length > 1 ? history.back() : nav.go('#/'));
  $('#c-clear', root).onclick = () => { if (!msgs.length) return; clearChat(); msgs = []; draw(); };
  draw();
}

function shrink(file, max = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = url;
  });
}
