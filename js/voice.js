// Dictée vocale : bouton micro pour remplir un champ en parlant.
// Utilise la reconnaissance vocale du navigateur (Safari iOS 14.5+, Chrome).
// Si elle n'est pas dispo (certaines web apps installées), on ouvre le clavier pour son micro.
import { toast } from './ui.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const voiceSupported = () => !!SR;

export const micSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';

let current = null;

export function attachMic(button, field, { onUpdate } = {}) {
  if (!button || !field) return;
  button.addEventListener('click', (e) => {
    e.preventDefault();
    if (current) { current.stop(); return; }
    if (!SR) {
      field.focus();
      toast('touche le micro 🎤 du clavier pour dicter');
      return;
    }
    const rec = new SR();
    rec.lang = 'fr-FR';
    rec.interimResults = true;
    rec.continuous = false;
    const base = field.value ? field.value.replace(/\s*$/, ' ') : '';
    const max = +field.getAttribute('maxlength') || 5000;
    rec.onresult = (ev) => {
      let txt = '';
      for (const r of ev.results) txt += r[0].transcript;
      field.value = (base + txt).slice(0, max);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      onUpdate?.(field.value);
    };
    rec.onerror = (ev) => {
      if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') toast('autorise le micro dans les réglages, ou utilise le micro du clavier');
      else if (ev.error !== 'aborted' && ev.error !== 'no-speech') toast('dictée impossible, essaie le micro du clavier');
    };
    rec.onend = () => { button.classList.remove('listening'); current = null; };
    try {
      rec.start();
      current = rec;
      button.classList.add('listening');
    } catch {
      field.focus();
      toast('touche le micro 🎤 du clavier pour dicter');
    }
  });
}
