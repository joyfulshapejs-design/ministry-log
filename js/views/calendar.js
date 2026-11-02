import { getByIndexRange, getAll } from '../db.js';
import { h, card } from '../ui.js';
import { opens } from '../nav.js';
import {
  todayISO, monthOf, shiftMonth, monthLabel, fullDateLabel, formatDuration, formatTime,
  weekdayOf, activityLabel,
} from '../util.js';
import { studiesOnWeekday, visitsDueOn, eventsOn, eventDayInfo } from '../schedule.js';

// Remembered while the app stays open, so coming back from a form shows the same month and day.
let shownMonth = null;
let selected = null;

const FROM_CALENDAR = opens('#calendar');

export async function render() {
  const today = todayISO();
  if (!shownMonth) shownMonth = monthOf(today);
  if (!selected) selected = today;
  const root = h('div', {});
  await show(root);
  return root;
}

async function show(root) {
  const month = shownMonth;
  const today = todayISO();
  const [entries, contacts, sessions, events] = await Promise.all([
    getByIndexRange('serviceEntries', 'date', `${month}-01`, `${month}-31`),
    getAll('contacts'),
    getByIndexRange('studySessions', 'date', `${month}-01`, `${month}-31`),
    getAll('events'),
  ]);
  const names = new Map(contacts.map((contact) => [contact.id, contact.name]));

  const entriesByDate = group(entries, (entry) => entry.date);
  const sessionsByDate = group(sessions, (session) => session.date);
  const visitDates = new Set(contacts.map((contact) => contact.nextVisitDate).filter(Boolean));

  function change(delta) {
    shownMonth = shiftMonth(month, delta);
    selected = monthOf(today) === shownMonth ? today : `${shownMonth}-01`;
    show(root);
  }

  function jumpToToday() {
    shownMonth = monthOf(today);
    selected = today;
    show(root);
  }

  function select(iso) {
    selected = iso;
    draw();
  }

  function draw() {
    root.replaceChildren(
      h('div', { class: 'month-nav' },
        h('button', { class: 'nav-button', type: 'button', 'aria-label': 'Previous month', onclick: () => change(-1) }, '‹'),
        h('button', { class: 'month-title', type: 'button', 'aria-label': `${monthLabel(month)}. Go to today`, onclick: jumpToToday }, monthLabel(month)),
        h('button', { class: 'nav-button', type: 'button', 'aria-label': 'Next month', onclick: () => change(1) }, '›'),
      ),
      grid(),
      h('p', { class: 'legend' },
        h('i', { class: 'dot study' }), ' Bible study  ', h('i', { class: 'dot visit' }), ' Visit due  ', h('i', { class: 'dot event' }), ' Event'),
      detail(),
    );
  }

  function grid() {
    const [year, m] = month.split('-').map(Number);
    const blanks = new Date(year, m - 1, 1).getDay();
    const days = new Date(year, m, 0).getDate();
    const cells = [];

    for (let i = 0; i < blanks; i += 1) cells.push(h('span', { class: 'day empty' }));
    for (let d = 1; d <= days; d += 1) {
      const iso = `${month}-${String(d).padStart(2, '0')}`;
      const minutes = (entriesByDate.get(iso) || []).reduce((sum, entry) => sum + entry.minutes, 0);
      const hasStudy = studiesOnWeekday(contacts, weekdayOf(iso)).length > 0;
      const hasVisit = visitDates.has(iso);
      const hasEvent = eventsOn(events, iso).length > 0;

      const spoken = [fullDateLabel(iso)];
      if (minutes) spoken.push(`${formatDuration(minutes)} hours`);
      if (hasStudy) spoken.push('Bible study');
      if (hasVisit) spoken.push('visit due');
      if (hasEvent) spoken.push('event');

      cells.push(h('button', {
        class: `day${iso === today ? ' today' : ''}${iso === selected ? ' selected' : ''}`,
        type: 'button',
        'aria-label': spoken.join(', '),
        'aria-pressed': String(iso === selected),
        onclick: () => select(iso),
      },
      h('span', { class: 'day-num' }, d),
      minutes ? h('span', { class: 'day-hours' }, formatDuration(minutes)) : null,
      hasStudy || hasVisit || hasEvent
        ? h('span', { class: 'dots' },
          hasStudy ? h('i', { class: 'dot study' }) : null,
          hasVisit ? h('i', { class: 'dot visit' }) : null,
          hasEvent ? h('i', { class: 'dot event' }) : null)
        : null));
    }

    return h('div', { class: 'calendar' },
      ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((letter) => h('span', { class: 'weekday', 'aria-hidden': 'true' }, letter)),
      cells);
  }

  function detail() {
    const dayEntries = entriesByDate.get(selected) || [];
    const dayMinutes = dayEntries.reduce((sum, entry) => sum + entry.minutes, 0);
    const scheduled = studiesOnWeekday(contacts, weekdayOf(selected));
    const held = sessionsByDate.get(selected) || [];
    const due = visitsDueOn(contacts, selected);
    const dayEvents = eventsOn(events, selected);
    const empty = !dayEntries.length && !scheduled.length && !held.length && !due.length && !dayEvents.length;

    const sections = [
      h('h2', { class: 'section-title' }, `${fullDateLabel(selected)}${dayMinutes ? ` · ${formatDuration(dayMinutes)}` : ''}`),
    ];

    if (dayEvents.length) {
      sections.push(h('div', { class: 'list' }, dayEvents.map((event) =>
        row(`#event/${event.id}`, event.title,
          [event.time ? formatTime(event.time) : '', eventDayInfo(event, selected), event.note].filter(Boolean).join(' · ') || 'Event'))));
    }

    if (dayEntries.length) {
      sections.push(h('div', { class: 'list' }, dayEntries.map((entry) => {
        const visited = (entry.contactIds || []).map((id) => names.get(id)).filter(Boolean);
        const text = [activityLabel(entry.activityType), visited.join(', '), entry.note].filter(Boolean).join(' · ');
        return row(`#entry/${entry.id}`, 'Service', text, formatDuration(entry.minutes));
      })));
    }
    if (scheduled.length || held.length) {
      sections.push(h('div', { class: 'list' },
        scheduled.map((contact) => row(`#contact/${contact.id}`, contact.name, `Bible study${contact.studyTime ? ` · ${formatTime(contact.studyTime)}` : ''}`)),
        held.map((session) => row(`#session/${session.contactId}/${session.id}`, names.get(session.contactId) || 'Study note',
          ['Study note', session.lessonNumber ? `Lesson ${session.lessonNumber}` : ''].filter(Boolean).join(' · ')))));
    }
    if (due.length) {
      sections.push(h('div', { class: 'list' }, due.map((contact) => row(`#contact/${contact.id}`, contact.name, 'Visit due'))));
    }
    if (empty) sections.push(card(h('p', { class: 'muted' }, 'Nothing on this day.')));

    sections.push(
      h('a', { class: 'button primary', href: `#entry/date/${selected}`, onclick: FROM_CALENDAR }, 'Add time for this day'),
      h('a', { class: 'button', href: `#event/date/${selected}`, onclick: FROM_CALENDAR }, 'Add event for this day'));
    return h('div', {}, ...sections);
  }

  draw();
}

function row(href, title, sub, value) {
  return h('a', { class: 'row', href, onclick: FROM_CALENDAR },
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, title),
      sub ? h('span', { class: 'row-sub' }, sub) : null),
    value ? h('span', { class: 'row-value' }, value) : h('span', { class: 'chevron', 'aria-hidden': 'true' }, '›'));
}

function group(items, keyOf) {
  const map = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}
