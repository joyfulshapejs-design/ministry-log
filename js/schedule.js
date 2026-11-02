// What is happening on a given day, worked out from contacts. Nothing here is stored.
import { byName, addDays, daysBetween } from './util.js';

// Bible studies held every week on this weekday (0 = Sunday), earliest time first.
export function studiesOnWeekday(contacts, weekday) {
  return contacts
    .filter((contact) => contact.isStudy && contact.studyDay === weekday)
    .sort((a, b) => (a.studyTime || '99:99').localeCompare(b.studyTime || '99:99') || byName(a, b));
}

export const visitsDueOn = (contacts, iso) =>
  contacts.filter((contact) => contact.nextVisitDate === iso).sort(byName);

// Visits due today or earlier. Missed ones stay listed until the next visit date is updated.
export const visitsDueBy = (contacts, iso) =>
  contacts
    .filter((contact) => contact.nextVisitDate && contact.nextVisitDate <= iso)
    .sort((a, b) => a.nextVisitDate.localeCompare(b.nextVisitDate) || byName(a, b));

// ---- Calendar events (a one-day event has no endDate; a multi-day one runs date..endDate) ----
const lastDay = (event) => event.endDate || event.date;
const byTimeThenTitle = (a, b) => (a.time || '').localeCompare(b.time || '') || a.title.localeCompare(b.title);

// Events happening on this day, including multi-day events that started earlier.
export const eventsOn = (events, iso) =>
  events.filter((event) => event.date <= iso && iso <= lastDay(event)).sort(byTimeThenTitle);

// Events starting after today and within the next `days` days, soonest first.
export function upcomingEvents(events, today, days) {
  const limit = addDays(today, days);
  return events
    .filter((event) => event.date > today && event.date <= limit)
    .sort((a, b) => a.date.localeCompare(b.date) || byTimeThenTitle(a, b));
}

// "Day 2 of 3" for multi-day events, '' for one-day events.
export function eventDayInfo(event, iso) {
  if (!event.endDate) return '';
  return `Day ${daysBetween(event.date, iso) + 1} of ${daysBetween(event.date, event.endDate) + 1}`;
}
