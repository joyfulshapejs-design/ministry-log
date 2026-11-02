// What is happening on a given day, worked out from contacts. Nothing here is stored.
import { byName } from './util.js';

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
