import { get, put, remove } from '../db.js';
import { h } from '../ui.js';
import { todayISO } from '../util.js';
import { goBack, returnHash } from '../nav.js';

// arg is the event id when editing, "date/YYYY-MM-DD" when adding for a chosen day, or '' for today.
export async function render(arg) {
  const chosen = arg.startsWith('date/') && /^\d{4}-\d{2}-\d{2}$/.test(arg.slice(5)) ? arg.slice(5) : null;
  const id = arg && !arg.startsWith('date/') ? Number(arg) : null;
  const existing = id ? await get('events', id) : null;
  if (id && !existing) return h('p', { class: 'muted' }, 'That event no longer exists.');

  const event = existing || { title: '', date: chosen || todayISO(), endDate: null, time: null, note: '' };

  const title = h('input', { type: 'text', required: true, maxLength: 100, autocapitalize: 'sentences', autocomplete: 'off', placeholder: 'e.g. Circuit assembly', value: event.title });
  const date = h('input', { type: 'date', required: true, value: event.date });
  const endDate = h('input', { type: 'date', value: event.endDate || '' });
  const time = h('input', { type: 'time', value: event.time || '' });
  const note = h('textarea', { rows: 3, maxLength: 500, placeholder: 'Optional', value: event.note });
  const error = h('p', { class: 'form-error', role: 'alert' });

  async function save(submit) {
    submit.preventDefault();
    if (!title.value.trim()) return fail('Enter a title.');
    if (!date.value) return fail('Pick a date.');
    if (endDate.value && endDate.value < date.value) return fail('The end date cannot be before the start date.');

    await put('events', {
      ...(id ? { id } : {}),
      title: title.value.trim(),
      date: date.value,
      // A "last day" equal to the first day is just a one-day event.
      endDate: endDate.value && endDate.value !== date.value ? endDate.value : null,
      time: time.value || null,
      note: note.value.trim(),
    });
    return goBack('#calendar');
  }

  function fail(message) {
    error.textContent = message;
  }

  async function discard() {
    if (!confirm('Delete this event? This cannot be undone.')) return;
    await remove('events', id);
    goBack('#calendar');
  }

  return h('form', { onsubmit: save, novalidate: true },
    h('div', { class: 'card form-group' },
      field('Title', title),
      field('Starts', date),
      field('Last day', endDate),
      field('Time', time)),
    h('p', { class: 'muted hint' }, 'Leave "Last day" empty for a one-day event.'),
    h('div', { class: 'card form-group' }, h('label', { class: 'field stacked' }, h('span', { class: 'field-label' }, 'Note'), note)),
    error,
    h('button', { class: 'button primary', type: 'submit' }, 'Save'),
    h('a', { class: 'button', href: returnHash('#calendar') }, 'Cancel'),
    id ? h('button', { class: 'button danger', type: 'button', onclick: discard }, 'Delete event') : null);
}

function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control);
}
