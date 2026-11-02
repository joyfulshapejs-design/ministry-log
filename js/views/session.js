import { get, put, remove } from '../db.js';
import { h } from '../ui.js';
import { todayISO } from '../util.js';

// arg is "contactId" to add a note, or "contactId/sessionId" to edit one.
export async function render(arg) {
  const [contactPart, sessionPart] = arg.split('/');
  const contactId = Number(contactPart);
  const sessionId = sessionPart ? Number(sessionPart) : null;

  const contact = await get('contacts', contactId);
  if (!contact) return h('p', { class: 'muted' }, 'That contact no longer exists.');
  const existing = sessionId ? await get('studySessions', sessionId) : null;
  if (sessionId && !existing) return h('p', { class: 'muted' }, 'That study note no longer exists.');

  // New notes start from the contact's current publication and lesson.
  const session = existing || { date: todayISO(), publication: contact.publication, lessonNumber: contact.lessonNumber, note: '' };

  const date = h('input', { type: 'date', required: true, value: session.date });
  const publication = h('input', { type: 'text', placeholder: 'Optional', value: session.publication });
  const lesson = h('input', { type: 'number', inputMode: 'numeric', min: 1, step: 1, placeholder: 'Optional', value: session.lessonNumber ?? '' });
  const note = h('textarea', { rows: 4, maxLength: 1000, placeholder: 'What you covered, questions, follow-up', value: session.note });
  const error = h('p', { class: 'form-error', role: 'alert' });
  const back = `#contact/${contactId}`;

  async function save(event) {
    event.preventDefault();
    if (!date.value) {
      error.textContent = 'Pick a date.';
      return;
    }
    await put('studySessions', {
      ...(sessionId ? { id: sessionId } : {}),
      contactId,
      date: date.value,
      publication: publication.value.trim(),
      lessonNumber: parseInt(lesson.value, 10) || null,
      note: note.value.trim(),
    });
    location.hash = back;
  }

  async function discard() {
    if (!confirm('Delete this study note? This cannot be undone.')) return;
    await remove('studySessions', sessionId);
    location.hash = back;
  }

  return h('form', { onsubmit: save, novalidate: true },
    h('p', { class: 'section-title' }, contact.name),
    h('div', { class: 'card form-group' }, field('Date', date), field('Publication', publication), field('Lesson', lesson)),
    h('div', { class: 'card form-group' }, h('label', { class: 'field stacked' }, h('span', { class: 'field-label' }, 'Note'), note)),
    error,
    h('button', { class: 'button primary', type: 'submit' }, 'Save'),
    h('a', { class: 'button', href: back }, 'Cancel'),
    sessionId ? h('button', { class: 'button danger', type: 'button', onclick: discard }, 'Delete note') : null,
  );
}

function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control);
}
