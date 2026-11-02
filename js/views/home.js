import { getByIndexRange, getAll, getSetting, count } from '../db.js';
import { backupNudge } from '../backup.js';
import { computeGoal, serviceYearRange, serviceYearLabel, serviceYearStart, DEFAULT_GOAL_HOURS } from '../goal.js';
import { h, card } from '../ui.js';
import { opens } from '../nav.js';
import { todayISO, monthOf, monthLabel, dateLabel, formatDuration, formatTime, weekdayOf, sumMinutes, activityLabel, needsHomeScreenInstall } from '../util.js';
import { studiesOnWeekday, visitsDueBy, eventsOn, upcomingEvents, eventDayInfo } from '../schedule.js';

const FROM_HOME = opens('#home');

export async function render() {
  const today = todayISO();
  const month = monthOf(today);
  const entries = await getByIndexRange('serviceEntries', 'date', `${month}-01`, `${month}-31`);
  const contacts = await getAll('contacts');
  const names = new Map(contacts.map((contact) => [contact.id, contact.name]));
  const events = await getAll('events');

  const { from, to } = serviceYearRange(serviceYearStart(today));
  const goal = computeGoal({
    goalHours: await getSetting('yearlyGoalHours', DEFAULT_GOAL_HOURS),
    entries: await getByIndexRange('serviceEntries', 'date', from, to),
    today,
  });
  // Newest day first; within a day, most recently added first.
  entries.sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id);

  const summary = card(
    h('p', { class: 'muted' }, `${monthLabel(month)} hours`),
    h('p', { class: 'big-number' }, formatDuration(sumMinutes(entries))),
    h('a', { class: 'button primary', href: '#entry' }, 'Add time'),
  );

  const list = entries.length
    ? h('div', { class: 'list' }, entries.map((entry) => entryRow(entry, names)))
    : card(h('p', { class: 'muted' }, 'No time logged this month yet. Tap "Add time" after your next day in service.'));

  const nudge = backupNudge({
    today,
    lastExportAt: await getSetting('lastExportAt'),
    hasData: contacts.length > 0 || (await count('serviceEntries')) > 0,
  });

  return h('div', {},
    needsHomeScreenInstall() ? installBanner() : null,
    nudge ? backupBanner(nudge) : null,
    summary,
    goalCard(goal),
    h('h2', { class: 'section-title' }, 'Due today'),
    dueList(contacts, events, today),
    comingUp(events, today),
    h('h2', { class: 'section-title' }, 'This month'),
    list);
}

function installBanner() {
  return h('div', { class: 'banner static' },
    h('strong', {}, 'Install this app to keep your records safe'),
    h('span', {}, 'Tap the Share button in Safari, choose Add to Home Screen, then open the app from its icon. Safari can clear a website’s saved data after a week without use; an installed app is not affected.'));
}

function backupBanner(nudge) {
  const why = nudge.never ? 'You have not made a backup yet.' : `Your last backup was ${nudge.days} days ago.`;
  return h('a', { class: 'banner', href: '#settings' },
    h('strong', {}, 'Time to back up'),
    h('span', {}, `${why} Tap to export one from Settings.`));
}

function progress(label, done, target) {
  const percent = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  return h('div', { class: 'progress-block' },
    h('div', { class: 'progress-text' },
      h('span', {}, label),
      h('span', { class: 'progress-numbers' }, `${formatDuration(done)} of ${formatDuration(target)}`)),
    h('div', { class: 'progress', role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent) },
      h('div', { class: 'progress-bar', style: `width:${percent}%` })));
}

function goalCard(goal) {
  const lines = [];
  if (goal.neededMinutes === 0) {
    lines.push('Yearly goal reached.');
  } else {
    const where = goal.remainingMonths === 1 ? 'in this last month' : `in each of the ${goal.remainingMonths} months left, including this one`;
    lines.push(`To finish the year: ${formatDuration(goal.perMonthMinutes)} ${where}.`);
  }
  if (goal.monthsDone > 0 && goal.neededMinutes > 0) {
    const gap = Math.abs(goal.paceDiff);
    lines.push(goal.paceDiff === 0 ? 'Right on pace.' : goal.paceDiff > 0 ? `${formatDuration(gap)} ahead of pace.` : `${formatDuration(gap)} behind pace.`);
  }
  return card(
    h('h2', {}, `Service year ${serviceYearLabel(goal.startYear)}`),
    progress('Year', goal.yearMinutes, goal.goalMinutes),
    progress('This month', goal.monthMinutes, goal.monthTarget),
    lines.map((line) => h('p', { class: 'muted goal-line' }, line)),
  );
}

// Events happening today, then studies scheduled for today's weekday, then visits due today or overdue.
function dueList(contacts, events, today) {
  const todays = eventsOn(events, today);
  const studies = studiesOnWeekday(contacts, weekdayOf(today));
  const visits = visitsDueBy(contacts, today);
  if (!todays.length && !studies.length && !visits.length) return card(h('p', { class: 'muted' }, 'Nothing due today.'));

  const rows = [
    ...todays.map((event) => dueRow(`#event/${event.id}`, event.title,
      ['Event today', event.time ? formatTime(event.time) : '', eventDayInfo(event, today)].filter(Boolean).join(' · '))),
    ...studies.map((contact) => dueRow(`#contact/${contact.id}`, contact.name, `Bible study today${contact.studyTime ? ` · ${formatTime(contact.studyTime)}` : ''}`)),
    ...visits.map((contact) => dueRow(`#contact/${contact.id}`, contact.name, contact.nextVisitDate === today ? 'Visit due today' : `Visit overdue · was ${dateLabel(contact.nextVisitDate)}`)),
  ];
  return h('div', { class: 'list' }, rows);
}

// Events starting in the next two weeks, so an assembly or convention is not a surprise.
function comingUp(events, today) {
  const soon = upcomingEvents(events, today, 14).slice(0, 5);
  if (!soon.length) return null;
  return h('div', {},
    h('h2', { class: 'section-title' }, 'Coming up'),
    h('div', { class: 'list' }, soon.map((event) =>
      dueRow(`#event/${event.id}`, event.title, [dateLabel(event.date), event.time ? formatTime(event.time) : ''].filter(Boolean).join(' · ')))));
}

function dueRow(href, title, sub) {
  return h('a', { class: 'row', href, onclick: FROM_HOME },
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, title),
      h('span', { class: 'row-sub' }, sub)),
    h('span', { class: 'chevron', 'aria-hidden': 'true' }, '›'));
}

function entryRow(entry, names) {
  const visited = (entry.contactIds || []).map((id) => names.get(id)).filter(Boolean);
  const detail = [activityLabel(entry.activityType), visited.join(', '), entry.note].filter(Boolean).join(' · ');
  return h('a', { class: 'row', href: `#entry/${entry.id}` },
    h('span', { class: 'row-main' },
      h('span', { class: 'row-title' }, dateLabel(entry.date)),
      h('span', { class: 'row-sub' }, detail),
    ),
    h('span', { class: 'row-value' }, formatDuration(entry.minutes)),
  );
}
