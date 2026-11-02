import { openDB } from './db.js';
import { h, card } from './ui.js';
import * as home from './views/home.js';
import * as entry from './views/entry.js';
import * as report from './views/report.js';
import * as contacts from './views/contacts.js';
import * as contact from './views/contact.js';
import * as session from './views/session.js';
import * as calendar from './views/calendar.js';
import * as event from './views/event.js';
import * as settings from './views/settings.js';
import { clearReturn } from './nav.js';
import { hasPin } from './pin.js';
import { unlock } from './lock.js';

// Each screen returns a DOM node. "tab" is which bottom tab to highlight.
const SCREENS = {
  home: { title: () => 'Home', tab: 'home', render: home.render },
  entry: { title: (arg) => (arg && !arg.startsWith('date/') ? 'Edit Entry' : 'Add Time'), tab: 'home', render: entry.render, form: true },
  calendar: { title: () => 'Calendar', tab: 'calendar', render: calendar.render },
  event: { title: (arg) => (arg && !arg.startsWith('date/') ? 'Edit Event' : 'Add Event'), tab: 'calendar', render: event.render, form: true },
  contacts: { title: () => 'Contacts', tab: 'contacts', render: contacts.render },
  contact: { title: (arg) => (arg ? 'Contact' : 'New Contact'), tab: 'contacts', render: contact.render, form: true },
  session: { title: (arg) => (arg.includes('/') ? 'Edit Study Note' : 'Study Note'), tab: 'contacts', render: session.render, form: true },
  report: { title: () => 'Report', tab: 'report', render: report.render },
  settings: { title: () => 'Settings', tab: 'settings', render: settings.render },
};

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('screen-title');
const tabs = document.querySelectorAll('.tab');

let renderId = 0;

function parseHash() {
  // "#session/4/9" -> screen "session" with arg "4/9"
  const [name, ...rest] = location.hash.slice(1).split('/');
  return name in SCREENS ? { name, arg: rest.join('/') } : { name: 'home', arg: '' };
}

async function render() {
  const { name, arg } = parseHash();
  const screen = SCREENS[name];
  const myRender = ++renderId;
  // Only form screens use the remembered "return to" place; leaving them for anywhere else forgets it.
  if (!screen.form) clearReturn();

  titleEl.textContent = screen.title(arg);
  document.title = `${screen.title(arg)} · Ministry Log`;
  tabs.forEach((tab) => {
    if (tab.dataset.tab === screen.tab) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });

  let content;
  try {
    content = await screen.render(arg);
  } catch {
    content = card(h('h2', {}, 'Something went wrong'), h('p', { class: 'muted' }, 'This screen could not load. Close and reopen the app, and if it keeps happening, export a backup from Settings.'));
  }
  // The user may have tapped another tab while this one was loading.
  if (myRender === renderId) viewEl.replaceChildren(content);
}

// Coming back from the background within this time does not ask for the PIN again, so a quick
// trip to Messages or Phone from a contact card is not interrupted.
const LOCK_AFTER_MS = 60 * 1000;

let locking = false;

// Hides the app and asks for the PIN, if one is set. Resolves true if the records were erased
// through "Forgot PIN?", in which case what is on screen is out of date.
async function lockApp() {
  if (locking) return false;
  locking = true;
  document.body.classList.add('locked');
  let erased = false;
  try {
    if (await hasPin()) erased = (await unlock()) === 'erased';
  } catch {
    // If the PIN cannot be read there is nothing to ask for.
  } finally {
    document.body.classList.remove('locked');
    locking = false;
  }
  return erased;
}

async function start() {
  // Hidden before anything else, so records never flash on screen before the PIN is asked for.
  document.body.classList.add('locked');
  try {
    await openDB();
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch {
    // Screens report their own load failures.
  }
  await lockApp();

  window.addEventListener('hashchange', () => {
    render();
    window.scrollTo(0, 0);
  });
  render();

  let hiddenAt = null;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) {
      hiddenAt = Date.now();
      return;
    }
    const wasAway = hiddenAt !== null && Date.now() - hiddenAt > LOCK_AFTER_MS;
    hiddenAt = null;
    if (wasAway && (await lockApp())) render();
  });
}

// An installed app can stay open for days, so a new version is offered rather than waiting for a restart.
function showUpdateNotice() {
  if (document.querySelector('.update-toast')) return;
  document.body.append(h('button', { class: 'update-toast', type: 'button', onclick: () => location.reload() },
    'A new version is ready. Tap to reload.'));
}

if ('serviceWorker' in navigator) {
  // A controller already present at load means a later change is an update, not the first install.
  const hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) showUpdateNotice();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

start();
