// Backup file format, validation, and the month-end reminder rule.
// A backup is one JSON file: { app, formatVersion, exportedAt, data: { <store>: [records] } }.
import { exportAll } from './db.js';
import { todayISO } from './util.js';

export const BACKUP_APP = 'ministry-log';
export const BACKUP_FORMAT = 1;
export const MAX_GOAL_HOURS = 5000;
export const MAX_BACKUP_BYTES = 10 * 1024 * 1024;

// These belong to one phone, so they are neither exported nor overwritten by an import.
export const DEVICE_ONLY_SETTINGS = ['pinHash', 'pinSalt', 'lastExportAt'];

export async function createBackup() {
  const data = await exportAll();
  data.settings = data.settings.filter((row) => !DEVICE_ONLY_SETTINGS.includes(row.key));
  return { app: BACKUP_APP, formatVersion: BACKUP_FORMAT, exportedAt: new Date().toISOString(), data };
}

export const backupFileName = (date = new Date()) => `ministry-log-backup-${todayISO(date)}.json`;

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isInteger(v);
const isId = (v) => isInt(v) && v > 0;
const isText = (v) => typeof v === 'string';
const text = (v) => (isText(v) ? v : '');
const intOrNull = (v) => (isInt(v) ? v : null);

function isDate(value) {
  if (!isText(value) || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

const dateOrNull = (v) => (isDate(v) ? v : null);
const timeOrNull = (v) => (isText(v) && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null);

// Checks a parsed backup. On success returns cleaned data ready to restore; on failure returns a
// plain-language error. Broken links (a contact that no longer exists) are repaired and counted
// rather than rejected, so a backup made after an interrupted delete can still be restored.
export function validateBackup(raw) {
  const fail = (error) => ({ ok: false, error });

  if (!isObject(raw) || raw.app !== BACKUP_APP) return fail('This file is not a Ministry Log backup.');
  if (!isInt(raw.formatVersion) || raw.formatVersion < 1) return fail('This backup has no valid version number.');
  if (raw.formatVersion > BACKUP_FORMAT) return fail('This backup was made by a newer version of the app. Update the app, then try again.');
  if (!isObject(raw.data)) return fail('This backup has no data in it.');
  for (const name of ['serviceEntries', 'contacts', 'studySessions', 'monthlyRemarks', 'settings']) {
    if (!Array.isArray(raw.data[name])) return fail(`The backup is missing its "${name}" section.`);
  }

  const seen = (ids, id) => {
    if (ids.has(id)) return true;
    ids.add(id);
    return false;
  };

  const contactIds = new Set();
  const contacts = [];
  for (const [i, c] of raw.data.contacts.entries()) {
    if (!isObject(c) || !isId(c.id) || !isText(c.name)) return fail(`Contact ${i + 1} is damaged.`);
    if (seen(contactIds, c.id)) return fail(`Contact ${i + 1} repeats an earlier contact.`);
    contacts.push({
      ...c,
      name: c.name,
      address: text(c.address),
      phone: text(c.phone),
      notes: text(c.notes),
      isStudy: c.isStudy === true,
      nextVisitDate: dateOrNull(c.nextVisitDate),
      studyDay: isInt(c.studyDay) && c.studyDay >= 0 && c.studyDay <= 6 ? c.studyDay : null,
      studyTime: timeOrNull(c.studyTime),
      publication: text(c.publication),
      lessonNumber: intOrNull(c.lessonNumber),
      createdAt: text(c.createdAt),
      updatedAt: text(c.updatedAt),
    });
  }

  let removedLinks = 0;
  const entryIds = new Set();
  const serviceEntries = [];
  for (const [i, e] of raw.data.serviceEntries.entries()) {
    if (!isObject(e) || !isId(e.id)) return fail(`Time entry ${i + 1} is damaged.`);
    if (!isDate(e.date)) return fail(`Time entry ${i + 1} has an invalid date.`);
    if (!isInt(e.minutes) || e.minutes < 1 || e.minutes > 24 * 60) return fail(`Time entry ${i + 1} has an invalid amount of time.`);
    if (!isText(e.activityType)) return fail(`Time entry ${i + 1} has no activity type.`);
    if (seen(entryIds, e.id)) return fail(`Time entry ${i + 1} repeats an earlier entry.`);
    const linked = Array.isArray(e.contactIds) ? e.contactIds.filter(isInt) : [];
    const kept = linked.filter((id) => contactIds.has(id));
    removedLinks += linked.length - kept.length;
    serviceEntries.push({ ...e, contactIds: kept, note: text(e.note) });
  }

  let removedNotes = 0;
  const sessionIds = new Set();
  const studySessions = [];
  for (const [i, s] of raw.data.studySessions.entries()) {
    if (!isObject(s) || !isId(s.id) || !isId(s.contactId)) return fail(`Study note ${i + 1} is damaged.`);
    if (!isDate(s.date)) return fail(`Study note ${i + 1} has an invalid date.`);
    if (seen(sessionIds, s.id)) return fail(`Study note ${i + 1} repeats an earlier note.`);
    if (!contactIds.has(s.contactId)) {
      removedNotes += 1;
      continue;
    }
    studySessions.push({ ...s, publication: text(s.publication), lessonNumber: intOrNull(s.lessonNumber), note: text(s.note) });
  }

  const months = new Set();
  const monthlyRemarks = [];
  for (const [i, r] of raw.data.monthlyRemarks.entries()) {
    if (!isObject(r) || !isText(r.month) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month)) return fail(`Monthly remark ${i + 1} is damaged.`);
    if (seen(months, r.month)) return fail(`Monthly remark ${i + 1} repeats an earlier month.`);
    monthlyRemarks.push({ ...r, remarks: text(r.remarks) });
  }

  // Only settings this version understands are restored; anything else in the file is ignored.
  const settings = [];
  for (const row of raw.data.settings) {
    if (!isObject(row) || !isText(row.key)) return fail('A setting in the backup is damaged.');
    if (row.key === 'yearlyGoalHours') {
      if (!isInt(row.value) || row.value < 1 || row.value > MAX_GOAL_HOURS) return fail('The yearly goal in the backup is not valid.');
      settings.push({ key: row.key, value: row.value });
    }
  }

  return {
    ok: true,
    data: { serviceEntries, contacts, studySessions, monthlyRemarks, settings },
    summary: {
      entries: serviceEntries.length,
      contacts: contacts.length,
      notes: studySessions.length,
      remarks: monthlyRemarks.length,
    },
    repaired: { links: removedLinks, notes: removedNotes },
    exportedAt: isText(raw.exportedAt) && !Number.isNaN(Date.parse(raw.exportedAt)) ? raw.exportedAt : null,
  };
}

// Show the "time to back up" banner only in the last five days of a month, when there is something
// worth saving and the last backup is more than a week old (or never happened).
export function backupNudge({ today, lastExportAt, hasData }) {
  if (!hasData) return null;
  const [y, m, d] = today.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  if (d <= daysInMonth - 5) return null;
  if (!lastExportAt) return { never: true };

  const [ly, lm, ld] = todayISO(new Date(lastExportAt)).split('-').map(Number);
  const days = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ly, lm - 1, ld)) / 86400000);
  return days > 7 ? { never: false, days } : null;
}
