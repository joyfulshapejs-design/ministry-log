import { getByIndexRange, getAll, getSetting, count } from '../db.js';
import { backupNudge } from '../backup.js';
import { computeGoal, serviceYearRange, serviceYearLabel, serviceYearStart, DEFAULT_GOAL_HOURS } from '../goal.js';
import { h, card } from '../ui.js';
import { progress } from '../progress.js';
import { opens } from '../nav.js';
import { todayISO, addDays, monthOf, monthLabel, dateLabel, formatDuration, formatTime, weekdayOf, sumMinutes, activityLabel, needsHomeScreenInstall } from '../util.js';
import { studiesOnWeekday, visitsDueBy, visitsDueOn, eventsOn, upcomingEvents, eventDayInfo } from '../schedule.js';

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

  // The first glance: today and tomorrow, so the plan is clear before anything else.
  const tomorrow = addDays(today, 1);

  return h('div', {},
    needsHomeScreenInstall() ? installBanner() : null,
    nudge ? backupBanner(nudge) : null,
    h('h2', { class: 'section-title first' }, 'Today'),
    dayPlan(contacts, events, today, today),
    h('h2', { class: 'section-title' }, 'Tomorrow'),
    dayPlan(contacts, events, tomorrow, today),
    summary,
    goalCard(goal),
    comingUp(events, tomorrow),
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

// A compact card: this month's bar, then one short line with the catch-up amount and pace.
function goalCard(goal) {
  let line;
  if (goal.neededMinutes === 0) {
    line = 'Yearly goal reached.';
  } else {
    const months = goal.remainingMonths === 1 ? 'in the last month' : `a month for ${goal.remainingMonths} months`;
    line = `Need ${formatDuration(goal.perMonthMinutes)} ${months}`;
    if (goal.monthsDone > 0) {
      const gap = formatDuration(Math.abs(goal.paceDiff));
      line += goal.paceDiff === 0 ? ' · on pace' : goal.paceDiff > 0 ? ` · ${gap} ahead` : ` · ${gap} behind`;
    }
    line += '.';
  }
  return h('section', { class: 'card compact' },
    h('h2', {}, `Service year ${serviceYearLabel(goal.startYear)}`),
    progress('This month', goal.monthMinutes, goal.monthTarget),
    h('p', { class: 'muted goal-line' }, line));
}

// What is planned for one day: its events, then studies scheduled for that weekday, then visits due.
// For today, visits that are overdue are included too, so a missed visit is not forgotten.
function dayPlan(contacts, events, iso, today) {
  const isToday = iso === today;
  const dayEvents = eventsOn(events, iso);
  const studies = studiesOnWeekday(contacts, weekdayOf(iso));
  const visits = isToday ? visitsDueBy(contacts, iso) : visitsDueOn(contacts, iso);
  const when = isToday ? ' today' : '';

  if (!dayEvents.length && !studies.length && !visits.length) {
    return h('p', { class: 'muted quiet' }, isToday ? 'Nothing due today.' : 'Nothing planned for tomorrow.');
  }

  const rows = [
    ...dayEvents.map((event) => dueRow(`#event/${event.id}`, event.title,
      [`Event${when}`, event.time ? formatTime(event.time) : '', eventDayInfo(event, iso)].filter(Boolean).join(' · '))),
    ...studies.map((contact) => dueRow(`#contact/${contact.id}`, contact.name, `Bible study${when}${contact.studyTime ? ` · ${formatTime(contact.studyTime)}` : ''}`)),
    ...visits.map((contact) => dueRow(`#contact/${contact.id}`, contact.name, contact.nextVisitDate === iso ? `Visit due${when}` : `Visit overdue · was ${dateLabel(contact.nextVisitDate)}`)),
  ];
  return h('div', { class: 'list' }, rows);
}

// Events starting in the next 30 days, so an assembly or convention is not a surprise. The heading
// is always shown so it is clear the app looked, even when nothing is coming up.
const COMING_UP_DAYS = 30;

// `tomorrow` is the starting point because today and tomorrow already have their own sections above.
function comingUp(events, tomorrow) {
  const soon = upcomingEvents(events, tomorrow, COMING_UP_DAYS - 1).slice(0, 5);
  return h('div', {},
    h('h2', { class: 'section-title' }, 'Coming up'),
    soon.length
      ? h('div', { class: 'list' }, soon.map((event) =>
        dueRow(`#event/${event.id}`, event.title, [dateLabel(event.date), event.time ? formatTime(event.time) : ''].filter(Boolean).join(' · '))))
      : h('p', { class: 'muted quiet' }, `Nothing in the next ${COMING_UP_DAYS} days.`));
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
