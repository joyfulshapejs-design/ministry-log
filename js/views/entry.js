import { get, put, remove, getAll } from '../db.js';
import { h } from '../ui.js';
import { todayISO, ACTIVITY_TYPES, byName } from '../util.js';
import { goBack, returnHash } from '../nav.js';

const MAX_MINUTES = 24 * 60;

// arg is the entry id when editing, "date/YYYY-MM-DD" when adding for a chosen day, or '' for today.
export async function render(arg) {
  const chosen = arg.startsWith('date/') && /^\d{4}-\d{2}-\d{2}$/.test(arg.slice(5)) ? arg.slice(5) : null;
  const id = arg && !arg.startsWith('date/') ? Number(arg) : null;
  const existing = id ? await get('serviceEntries', id) : null;
  if (id && !existing) return h('p', { class: 'muted' }, 'That entry no longer exists.');

  const entry = existing || { date: chosen || todayISO(), minutes: 0, activityType: ACTIVITY_TYPES[0].value, contactIds: [], note: '' };

  const date = h('input', { type: 'date', required: true, value: entry.date });
  const hours = h('input', { type: 'number', inputMode: 'numeric', min: 0, max: 24, step: 1, value: Math.floor(entry.minutes / 60), 'aria-label': 'Hours' });
  const minutes = h('input', { type: 'number', inputMode: 'numeric', min: 0, max: 59, step: 1, value: entry.minutes % 60, 'aria-label': 'Minutes' });
  const activity = h('select', {}, ACTIVITY_TYPES.map((type) =>
    h('option', { value: type.value, selected: type.value === entry.activityType }, type.label)));
  const note = h('textarea', { rows: 3, maxLength: 500, placeholder: 'Optional', value: entry.note });
  const error = h('p', { class: 'form-error', role: 'alert' });

  const contacts = (await getAll('contacts')).sort(byName);
  const checks = contacts.map((contact) => ({
    contact,
    box: h('input', { type: 'checkbox', checked: entry.contactIds.includes(contact.id), 'aria-label': contact.name }),
  }));
  const contactsCard = h('div', { class: 'card form-group' },
    h('span', { class: 'field-label field-heading' }, 'Contacts visited'),
    checks.length
      ? h('div', { class: 'check-list' }, checks.map(({ contact, box }) =>
        h('label', { class: 'check-row' }, box, h('span', {}, contact.name))))
      : h('p', { class: 'muted pad-bottom' }, 'Add contacts in the Contacts tab to link them here.'));

  async function save(event) {
    event.preventDefault();
    const total = (parseInt(hours.value || '0', 10) || 0) * 60 + (parseInt(minutes.value || '0', 10) || 0);
    if (!date.value) return showError('Pick a date.');
    if (total <= 0) return showError('Enter the time you spent.');
    if (total > MAX_MINUTES) return showError('A single entry can be at most 24 hours.');

    await put('serviceEntries', {
      ...(id ? { id } : {}),
      date: date.value,
      minutes: total,
      activityType: activity.value,
      contactIds: checks.filter(({ box }) => box.checked).map(({ contact }) => contact.id),
      note: note.value.trim(),
    });
    goBack('#home');
  }

  function showError(message) {
    error.textContent = message;
  }

  async function discard() {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    await remove('serviceEntries', id);
    goBack('#home');
  }

  return h('form', { onsubmit: save, novalidate: true },
    h('div', { class: 'card form-group' },
      field('Date', date),
      h('div', { class: 'field' },
        h('span', { class: 'field-label' }, 'Time'),
        h('span', { class: 'time-inputs' }, hours, h('span', {}, 'h'), minutes, h('span', {}, 'm')),
      ),
      field('Activity', activity),
    ),
    contactsCard,
    h('div', { class: 'card form-group' },
      h('label', { class: 'field stacked' }, h('span', { class: 'field-label' }, 'Note'), note),
    ),
    error,
    h('button', { class: 'button primary', type: 'submit' }, 'Save'),
    h('a', { class: 'button', href: returnHash('#home') }, 'Cancel'),
    id ? h('button', { class: 'button danger', type: 'button', onclick: discard }, 'Delete entry') : null,
  );
}

function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control);
}
