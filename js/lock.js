// The PIN keypad overlay, used to unlock the app and in the Settings PIN flows.
import { h } from './ui.js';
import { verifyPin, PIN_LENGTH } from './pin.js';
import { clear, STORE_NAMES } from './db.js';

const MAX_FAILURES = 5;
const COOLDOWN_MS = 30 * 1000;

// Wrong-guess limiter for checking the existing PIN. Kept in memory only.
let failures = 0;
let blockedUntil = 0;

// Shows the keypad and resolves with the entered PIN, or null if cancelled.
// verify(pin) may reject a PIN (the keypad shakes and clears). throttle adds a cooldown after
// repeated wrong guesses. allowForgot adds the "Forgot PIN?" erase-everything escape.
export function askPin({ title, subtitle = '', verify = null, throttle = false, wrongMessage = 'Wrong PIN', cancellable = false, allowForgot = false }) {
  return new Promise((resolve) => {
    let entered = '';
    let busy = false;

    const dots = Array.from({ length: PIN_LENGTH }, () => h('i'));
    const dotsEl = h('div', { class: 'pin-dots', 'aria-hidden': 'true' }, dots);
    const error = h('p', { class: 'lock-error', role: 'alert' });

    const drawDots = () => dots.forEach((dot, i) => { dot.className = i < entered.length ? 'filled' : ''; });

    function finish(value) {
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    }

    function reject(message) {
      error.textContent = message;
      dotsEl.classList.remove('shake');
      void dotsEl.offsetWidth; // restart the animation
      dotsEl.classList.add('shake');
      entered = '';
      drawDots();
      busy = false;
    }

    async function submit() {
      busy = true;
      let ok = true;
      if (verify) {
        try {
          ok = await verify(entered);
        } catch {
          return reject('Could not check the PIN on this device.');
        }
      }
      if (ok) {
        if (throttle) {
          failures = 0;
          blockedUntil = 0;
        }
        return finish(entered);
      }
      if (throttle) {
        failures += 1;
        if (failures >= MAX_FAILURES) {
          failures = 0;
          blockedUntil = Date.now() + COOLDOWN_MS;
          return reject(`Too many wrong tries. Wait ${COOLDOWN_MS / 1000} seconds.`);
        }
      }
      return reject(wrongMessage);
    }

    function press(digit) {
      if (busy || entered.length >= PIN_LENGTH) return;
      if (throttle && Date.now() < blockedUntil) {
        error.textContent = `Too many wrong tries. Try again in ${Math.ceil((blockedUntil - Date.now()) / 1000)} seconds.`;
        return;
      }
      error.textContent = '';
      entered += digit;
      drawDots();
      if (entered.length === PIN_LENGTH) submit();
    }

    function backspace() {
      if (busy) return;
      entered = entered.slice(0, -1);
      drawDots();
    }

    function onKey(event) {
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === 'Backspace') backspace();
      else if (event.key === 'Escape' && cancellable) finish(null);
    }

    const key = (label, onclick, extra = {}) => h('button', { class: 'key', type: 'button', onclick, ...extra }, label);
    const digitKey = (n) => key(String(n), () => press(String(n)), { 'aria-label': String(n) });

    let cornerKey = h('span', { class: 'key spacer' });
    if (cancellable) cornerKey = key('Cancel', () => finish(null), { class: 'key text' });
    else if (allowForgot) cornerKey = key('Forgot PIN?', () => { padView.hidden = true; forgotView.hidden = false; }, { class: 'key text' });

    const padView = h('div', { class: 'lock-pad' },
      h('h2', { class: 'lock-title' }, title),
      h('p', { class: 'lock-sub' }, subtitle),
      dotsEl,
      error,
      h('div', { class: 'keypad' },
        [1, 2, 3, 4, 5, 6, 7, 8, 9].map(digitKey),
        cornerKey,
        digitKey(0),
        key('⌫', backspace, { 'aria-label': 'Delete', class: 'key text' })));

    async function eraseEverything() {
      for (const name of STORE_NAMES) await clear(name);
      failures = 0;
      finish('erased');
    }

    const forgotView = h('div', { class: 'lock-pad', hidden: true },
      h('h2', { class: 'lock-title' }, 'Forgot your PIN?'),
      h('p', { class: 'lock-sub' }, 'There is no way to recover a PIN. To get back in, this phone’s records must be erased. Then you can restore a backup file from Settings → Import.'),
      h('p', { class: 'lock-sub strong' }, 'Anything not backed up will be lost.'),
      h('button', { class: 'button danger', type: 'button', onclick: eraseEverything }, 'Erase everything and remove PIN'),
      h('button', { class: 'button', type: 'button', onclick: () => { forgotView.hidden = true; padView.hidden = false; } }, 'Back'));

    const overlay = h('div', { class: 'lock', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, tabindex: -1 }, padView, forgotView);
    document.body.append(overlay);
    document.addEventListener('keydown', onKey);
    overlay.focus();
  });
}

export const unlock = () => askPin({ title: 'Enter PIN', verify: verifyPin, throttle: true, allowForgot: true });
