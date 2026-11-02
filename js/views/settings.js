import { getSetting, setSetting, count, getAll, replaceAll } from '../db.js';
import { h, card } from '../ui.js';
import { formatDuration } from '../util.js';
import { DEFAULT_GOAL_HOURS } from '../goal.js';
import { hasPin, setPin, removePin, verifyPin } from '../pin.js';
import { askPin } from '../lock.js';
import {
  createBackup, backupFileName, validateBackup, MAX_BACKUP_BYTES, MAX_GOAL_HOURS, DEVICE_ONLY_SETTINGS,
} from '../backup.js';

export async function render() {
  const root = h('div', {});
  await show(root);
  return root;
}

// Rebuilds the whole screen; notice is a one-line message shown at the top.
async function show(root, notice = '') {
  const [goalHours, pinOn, lastExportAt] = await Promise.all([
    getSetting('yearlyGoalHours', DEFAULT_GOAL_HOURS), hasPin(), getSetting('lastExportAt'),
  ]);
  // Built ahead of the tap so the share sheet opens straight from the tap, which iPhone requires.
  const backupFile = new File([JSON.stringify(await createBackup())], backupFileName(), { type: 'application/json' });

  // replaceChildren turns null into the text "null", so an empty notice is simply left out.
  root.replaceChildren(...[
    notice ? h('p', { class: 'notice', role: 'status' }, notice) : null,
    goalSection(goalHours),
    pinSection(root, pinOn),
    backupSection(root, backupFile, lastExportAt),
    h('div', {},
      h('h2', { class: 'section-title spaced' }, 'About'),
      card(
        h('p', {}, await appVersion()),
        h('p', { class: 'muted' }, 'All records stay on this phone. Nothing is sent anywhere.'))),
  ].filter(Boolean));
}

// The service worker's cache is named after the release ("ministry-log-v9"), so it doubles as the version.
async function appVersion() {
  try {
    const numbers = (await caches.keys())
      .map((name) => /^ministry-log-v(\d+)$/.exec(name))
      .filter(Boolean)
      .map((match) => Number(match[1]));
    return numbers.length ? `Version ${Math.max(...numbers)}` : 'Version unknown';
  } catch {
    return 'Version unknown';
  }
}

// ---- Goal ----

function goalSection(goalHours) {
  const goal = h('input', { type: 'number', inputMode: 'numeric', min: 1, max: MAX_GOAL_HOURS, step: 1, value: goalHours, 'aria-label': 'Yearly goal in hours' });
  const monthly = h('p', { class: 'muted' });
  const status = h('p', { class: 'muted', role: 'status' });
  const error = h('p', { class: 'form-error', role: 'alert' });

  const parsed = () => {
    const value = Number(goal.value);
    return Number.isInteger(value) && value >= 1 && value <= MAX_GOAL_HOURS ? value : null;
  };
  const refresh = () => {
    const value = parsed();
    monthly.textContent = value ? `That is ${formatDuration(Math.round((value * 60) / 12))} a month over the September–August service year.` : '';
    status.textContent = '';
  };
  goal.addEventListener('input', () => {
    error.textContent = '';
    refresh();
  });

  async function save(event) {
    event.preventDefault();
    const value = parsed();
    if (!value) {
      error.textContent = `Enter a whole number of hours from 1 to ${MAX_GOAL_HOURS}.`;
      return;
    }
    await setSetting('yearlyGoalHours', value);
    refresh();
    status.textContent = 'Saved.';
  }

  refresh();
  return h('form', { onsubmit: save, novalidate: true },
    h('h2', { class: 'section-title' }, 'Goal'),
    h('div', { class: 'card form-group' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Yearly goal (hours)'), goal)),
    monthly, error,
    h('button', { class: 'button primary', type: 'submit' }, 'Save goal'),
    status);
}

// ---- PIN lock ----

async function choosePin() {
  const first = await askPin({ title: 'Choose a PIN', subtitle: 'Pick 4 digits you will remember.', cancellable: true });
  if (!first) return false;
  const second = await askPin({
    title: 'Confirm PIN', subtitle: 'Enter the same 4 digits again.', cancellable: true,
    wrongMessage: 'Those do not match', verify: async (pin) => pin === first,
  });
  if (!second) return false;
  await setPin(first);
  return true;
}

const askCurrentPin = () => askPin({ title: 'Enter current PIN', verify: verifyPin, throttle: true, cancellable: true });
const SECURE_ONLY = 'The PIN could not be saved. PIN lock needs the app to be opened over a secure (https) connection.';

function pinSection(root, pinOn) {
  async function turnOn() {
    try {
      if (await choosePin()) await show(root, 'PIN lock is on.');
    } catch {
      await show(root, SECURE_ONLY);
    }
  }
  async function change() {
    if (!(await askCurrentPin())) return;
    try {
      if (await choosePin()) await show(root, 'PIN changed.');
    } catch {
      await show(root, SECURE_ONLY);
    }
  }
  async function turnOff() {
    if (!(await askCurrentPin())) return;
    await removePin();
    await show(root, 'PIN lock is off.');
  }

  return h('div', {},
    h('h2', { class: 'section-title spaced' }, 'PIN lock'),
    card(
      h('p', {}, pinOn ? 'PIN lock is on.' : 'PIN lock is off.'),
      h('p', { class: 'muted' }, 'Asks for a 4-digit PIN when the app opens, and again after it has been in the background for a minute. It keeps casual snoopers out; it does not encrypt your records.')),
    pinOn
      ? h('div', {},
        h('button', { class: 'button', type: 'button', onclick: change }, 'Change PIN'),
        h('button', { class: 'button danger', type: 'button', onclick: turnOff }, 'Turn off PIN'))
      : h('button', { class: 'button primary', type: 'button', onclick: turnOn }, 'Set PIN'));
}

// ---- Backup ----

async function shareOrDownload(file) {
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Ministry Log backup' });
      return 'shared';
    }
  } catch (error) {
    if (error.name === 'AbortError') return 'cancelled';
    // Any other sharing problem falls through to a plain download.
  }
  const url = URL.createObjectURL(file);
  const link = h('a', { href: url, download: file.name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function describe({ entries, contacts, notes, remarks }) {
  return `${plural(entries, 'time entry', 'time entries')}, ${plural(contacts, 'contact')}, ${plural(notes, 'study note')}, ${plural(remarks, 'monthly remark')}`;
}

function backupSection(root, backupFile, lastExportAt) {
  const importArea = h('div', {});
  const importError = h('p', { class: 'form-error', role: 'alert' });

  async function onExport() {
    const result = await shareOrDownload(backupFile);
    if (result === 'cancelled') return;
    await setSetting('lastExportAt', new Date().toISOString());
    await show(root, result === 'shared'
      ? 'Backup shared. Keep the file somewhere private.'
      : 'Backup saved to your downloads. Keep the file somewhere private.');
  }

  const fileInput = h('input', { type: 'file', class: 'visually-hidden', accept: 'application/json,.json,text/plain' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    importArea.replaceChildren();
    importError.textContent = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      importError.textContent = 'That file is too large to be a backup.';
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      importError.textContent = 'That file could not be read as a backup.';
      return;
    }
    const result = validateBackup(parsed);
    if (!result.ok) {
      importError.textContent = result.error;
      return;
    }
    await showPreview(result);
  });

  async function showPreview(result) {
    const current = {
      entries: await count('serviceEntries'),
      contacts: await count('contacts'),
      notes: await count('studySessions'),
      remarks: await count('monthlyRemarks'),
    };
    const when = result.exportedAt ? new Date(result.exportedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : 'an unknown date';

    async function restore() {
      try {
        // PIN and last-backup date belong to this phone, so they survive a restore.
        const keep = (await getAll('settings')).filter((row) => DEVICE_ONLY_SETTINGS.includes(row.key));
        await replaceAll({ ...result.data, settings: [...result.data.settings, ...keep] });
      } catch {
        importArea.replaceChildren();
        importError.textContent = 'The restore failed. Your existing records were not changed.';
        return;
      }
      const repaired = result.repaired.links + result.repaired.notes;
      await show(root, `Restored ${describe(result.summary)}.${repaired ? ` ${plural(repaired, 'broken link')} in the file ${repaired === 1 ? 'was' : 'were'} cleaned up.` : ''}`);
    }

    importArea.replaceChildren(
      card(
        h('h2', {}, 'Replace everything on this phone?'),
        h('p', { class: 'muted' }, `Backup from ${when}`),
        h('p', {}, `Contains: ${describe(result.summary)}.`),
        h('p', { class: 'muted' }, `This phone now has: ${describe(current)}. All of it will be replaced.`)),
      h('button', { class: 'button danger', type: 'button', onclick: restore }, 'Replace everything with this backup'),
      h('button', { class: 'button', type: 'button', onclick: () => importArea.replaceChildren() }, 'Cancel'));
    importArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const last = lastExportAt
    ? new Date(lastExportAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Never';

  return h('div', {},
    h('h2', { class: 'section-title spaced' }, 'Backup'),
    card(
      h('p', {}, `Last backup: ${last}`),
      h('p', { class: 'muted' }, 'The backup file holds all your records and is not encrypted. Keep it somewhere private.')),
    h('button', { class: 'button primary', type: 'button', onclick: onExport }, 'Export backup'),
    h('label', { class: 'button' }, 'Import backup…', fileInput),
    importError,
    importArea);
}
