import { getAll } from '../db.js';
import { h, card } from '../ui.js';
import { byName, dateLabel, formatTime, phoneDigits, WEEKDAYS } from '../util.js';

// Kept while the app stays open so returning from a contact card keeps your search.
let query = '';

export async function render() {
  const contacts = (await getAll('contacts')).sort(byName);

  const search = h('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search contacts', autocomplete: 'off', value: query });
  const list = h('div', {});
  const draw = () => list.replaceChildren(...buildList(contacts, search.value));
  search.addEventListener('input', () => {
    query = search.value;
    draw();
  });
  draw();

  return h('div', {},
    h('a', { class: 'button primary no-top', href: '#contact' }, 'Add contact'),
    h('div', { class: 'search-row' }, search),
    list,
  );
}

function matches(contact, text) {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  const digits = phoneDigits(needle);
  return contact.name.toLowerCase().includes(needle)
    || contact.address.toLowerCase().includes(needle)
    || (contact.messenger || '').toLowerCase().includes(needle)
    || (digits.length > 0 && phoneDigits(contact.phone).includes(digits));
}

function buildList(contacts, text) {
  if (!contacts.length) {
    return [card(h('p', { class: 'muted' }, 'No contacts yet. Add a return visit or Bible study to get started.'))];
  }
  const shown = contacts.filter((contact) => matches(contact, text));
  if (!shown.length) return [card(h('p', { class: 'muted' }, 'No matches.'))];

  // Group under letter headings; anything not starting with A-Z goes under #.
  const groups = new Map();
  for (const contact of shown) {
    const first = contact.name.trim().charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(first) ? first : '#';
    if (!groups.has(letter)) groups.set(letter, []);
    groups.get(letter).push(contact);
  }
  const letters = [...groups.keys()].sort((a, b) => (a === '#') - (b === '#') || a.localeCompare(b));
  return letters.flatMap((letter) => [
    h('h3', { class: 'letter' }, letter),
    h('div', { class: 'list' }, groups.get(letter).map(contactRow)),
  ]);
}

function contactRow(contact) {
  const details = [];
  if (contact.isStudy) {
    let study = 'Bible study';
    if (contact.studyDay != null) study += ` · ${WEEKDAYS[contact.studyDay].slice(0, 3)}`;
    if (contact.studyTime) study += ` ${formatTime(contact.studyTime)}`;
    details.push(study);
  }
  if (contact.nextVisitDate) details.push(`Visit ${dateLabel(contact.nextVisitDate)}`);
  if (!details.length && contact.address) details.push(contact.address);

  return h('a', { class: 'row', href: `#contact/${contact.id}` },
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, contact.name),
      details.length ? h('span', { class: 'row-sub' }, details.join(' · ')) : null,
    ),
    h('span', { class: 'chevron', 'aria-hidden': 'true' }, '›'),
  );
}
