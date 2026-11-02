import { get, put, remove, getAll, getAllByIndex } from '../db.js';
import { h, card } from '../ui.js';
import { WEEKDAYS, dateLabel, phoneDigits, messengerHandle, messengerLink } from '../util.js';
import { goBack, returnHash } from '../nav.js';

// arg is the contact id when viewing/editing, or '' when adding.
export async function render(arg) {
  const id = arg ? Number(arg) : null;
  const existing = id ? await get('contacts', id) : null;
  if (id && !existing) return h('p', { class: 'muted' }, 'That contact no longer exists.');

  const contact = existing || {
    name: '', address: '', phone: '', messenger: '', notes: '', isStudy: false, nextVisitDate: null,
    studyDay: null, studyTime: null, publication: '', lessonNumber: null,
  };

  const name = h('input', { type: 'text', required: true, autocapitalize: 'words', autocomplete: 'off', placeholder: 'Name', value: contact.name });
  const address = h('input', { type: 'text', autocomplete: 'off', placeholder: 'Optional', value: contact.address });
  const phone = h('input', { type: 'tel', autocomplete: 'off', placeholder: 'Optional', value: contact.phone });
  const messenger = h('input', { type: 'text', autocapitalize: 'none', autocorrect: 'off', autocomplete: 'off', spellcheck: false, placeholder: 'Username or link', value: contact.messenger || '' });
  const nextVisit = h('input', { type: 'date', value: contact.nextVisitDate || '' });
  const notes = h('textarea', { rows: 3, placeholder: 'Optional', value: contact.notes });

  const isStudy = h('input', { type: 'checkbox', role: 'switch', checked: contact.isStudy, 'aria-label': 'Bible study' });
  const publication = h('input', { type: 'text', placeholder: 'e.g. Enjoy Life Forever!', value: contact.publication });
  const lesson = h('input', { type: 'number', inputMode: 'numeric', min: 1, step: 1, placeholder: 'Optional', value: contact.lessonNumber ?? '' });
  const studyDay = h('select', {},
    h('option', { value: '', selected: contact.studyDay == null }, 'Not set'),
    WEEKDAYS.map((day, index) => h('option', { value: index, selected: contact.studyDay === index }, day)));
  const studyTime = h('input', { type: 'time', value: contact.studyTime || '' });
  const studyFields = h('div', { class: 'card form-group', hidden: !contact.isStudy },
    field('Publication', publication), field('Lesson', lesson), field('Study day', studyDay), field('Study time', studyTime));
  isStudy.addEventListener('change', () => { studyFields.hidden = !isStudy.checked; });

  const error = h('p', { class: 'form-error', role: 'alert' });

  async function save(event) {
    event.preventDefault();
    if (!name.value.trim()) {
      error.textContent = 'Enter a name.';
      name.focus();
      return;
    }
    // A pasted Messenger link is reduced to just the username.
    const handle = messengerHandle(messenger.value);
    if (handle === null) {
      error.textContent = 'That does not look like a Messenger username or link. Use the name from their profile link (facebook.com/their.name) or paste their m.me link.';
      messenger.focus();
      return;
    }
    const now = new Date().toISOString();
    const key = await put('contacts', {
      ...(existing || {}),
      ...(id ? { id } : {}),
      name: name.value.trim(),
      address: address.value.trim(),
      phone: phone.value.trim(),
      messenger: handle,
      notes: notes.value.trim(),
      isStudy: isStudy.checked,
      nextVisitDate: nextVisit.value || null,
      studyDay: studyDay.value === '' ? null : Number(studyDay.value),
      studyTime: studyTime.value || null,
      publication: publication.value.trim(),
      lessonNumber: parseInt(lesson.value, 10) || null,
      createdAt: existing ? existing.createdAt : now,
      updatedAt: now,
    });
    // A new contact opens its card so study notes can be added right away.
    if (id) goBack('#contacts');
    else location.hash = `#contact/${key}`;
  }

  async function discard() {
    if (!confirm(`Delete ${contact.name}? Their study notes will be deleted too. Logged time stays, just unlinked.`)) return;
    await deleteContact(id);
    goBack('#contacts');
  }

  const digits = contact.phone ? phoneDigits(contact.phone) : '';
  const children = [];
  if (existing && (digits || existing.messenger)) {
    children.push(h('div', { class: 'actions' },
      digits ? h('a', { class: 'button', href: `tel:${digits}` }, 'Call') : null,
      digits ? h('a', { class: 'button', href: `sms:${digits}` }, 'Text') : null,
      existing.messenger ? h('a', { class: 'button', href: messengerLink(existing.messenger), target: '_blank', rel: 'noopener' }, 'Messenger') : null));
  }
  children.push(
    h('div', { class: 'card form-group' }, field('Name', name), field('Address', address), field('Phone', phone), field('Messenger', messenger), field('Next visit', nextVisit)),
    h('div', { class: 'card form-group' }, h('label', { class: 'field stacked' }, h('span', { class: 'field-label' }, 'Notes'), notes)),
    h('div', { class: 'card form-group' }, h('label', { class: 'field' }, h('span', { class: 'field-label' }, 'Bible study'), h('span', { class: 'switch' }, isStudy, h('span', { class: 'switch-track' })))),
    studyFields,
    error,
    h('button', { class: 'button primary', type: 'submit' }, 'Save'),
    h('a', { class: 'button', href: returnHash('#contacts') }, 'Cancel'),
  );

  const form = h('form', { onsubmit: save, novalidate: true }, ...children);
  const page = h('div', {}, form);

  if (existing && existing.isStudy) page.append(await sessionsSection(id));
  if (existing) page.append(h('button', { class: 'button danger', type: 'button', onclick: discard }, 'Delete contact'));
  return page;
}

async function sessionsSection(contactId) {
  const sessions = await getAllByIndex('studySessions', 'contactId', contactId);
  sessions.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const rows = sessions.map((session) => {
    const what = [session.publication, session.lessonNumber ? `Lesson ${session.lessonNumber}` : ''].filter(Boolean).join(' · ');
    return h('a', { class: 'row', href: `#session/${contactId}/${session.id}` },
      h('span', { class: 'row-main' },
        h('span', { class: 'row-title' }, dateLabel(session.date)),
        what || session.note ? h('span', { class: 'row-sub' }, [what, session.note].filter(Boolean).join(' · ')) : null),
      h('span', { class: 'chevron', 'aria-hidden': 'true' }, '›'));
  });

  return h('div', {},
    h('h2', { class: 'section-title' }, 'Study notes'),
    rows.length ? h('div', { class: 'list' }, rows) : card(h('p', { class: 'muted' }, 'No study notes yet.')),
    h('a', { class: 'button', href: `#session/${contactId}` }, 'Add study note'),
  );
}

// Removes a contact, its study notes, and its links from logged time (the time itself is kept).
async function deleteContact(id) {
  const sessions = await getAllByIndex('studySessions', 'contactId', id);
  for (const session of sessions) await remove('studySessions', session.id);

  const entries = await getAll('serviceEntries');
  for (const entry of entries) {
    if (entry.contactIds && entry.contactIds.includes(id)) {
      await put('serviceEntries', { ...entry, contactIds: entry.contactIds.filter((other) => other !== id) });
    }
  }
  await remove('contacts', id);
}

function field(label, control) {
  return h('label', { class: 'field' }, h('span', { class: 'field-label' }, label), control);
}
