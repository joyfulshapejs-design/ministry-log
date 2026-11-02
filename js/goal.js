// Goal maths. The service year runs September to August. Everything is calculated from time entries;
// no totals are stored.
import { monthOf, sumMinutes } from './util.js';

export const DEFAULT_GOAL_HOURS = 600;

// The calendar year a service year starts in: Sept 2026 - Aug 2027 is 2026.
export function serviceYearStart(iso) {
  const year = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 9 ? year : year - 1;
}

export const serviceYearRange = (startYear) => ({ from: `${startYear}-09-01`, to: `${startYear + 1}-08-31` });

export const serviceYearLabel = (startYear) => `${startYear}–${startYear + 1}`;

// entries: any service entries; only those inside today's service year are counted.
export function computeGoal({ goalHours, entries, today }) {
  const startYear = serviceYearStart(today);
  const { from, to } = serviceYearRange(startYear);
  const inYear = entries.filter((entry) => entry.date >= from && entry.date <= to);

  const goalMinutes = Math.round(goalHours * 60);
  const monthTarget = Math.round(goalMinutes / 12);
  const month = monthOf(today);

  const yearMinutes = sumMinutes(inYear);
  const monthMinutes = sumMinutes(inYear.filter((entry) => monthOf(entry.date) === month));

  // Months finished before this one: September = 0 ... August = 11.
  const monthsDone = (Number(month.slice(5)) - 9 + 12) % 12;
  const remainingMonths = 12 - monthsDone; // includes the current month

  const neededMinutes = Math.max(0, goalMinutes - yearMinutes);
  const perMonthMinutes = neededMinutes === 0 ? 0 : Math.ceil(neededMinutes / remainingMonths);

  // Positive = ahead of an even pace, judged on the months already finished.
  const expectedBefore = Math.round((goalMinutes * monthsDone) / 12);
  const paceDiff = yearMinutes - monthMinutes - expectedBefore;

  return {
    startYear, goalMinutes, monthTarget, yearMinutes, monthMinutes,
    monthsDone, remainingMonths, neededMinutes, perMonthMinutes, paceDiff,
  };
}

// Where a month stands against its target. For the current month it also works out roughly how much a
// day is needed to finish, counting today. Past months just report how far short or over they ended.
export function monthStatus({ month, monthMinutes, monthTarget, today }) {
  const thisMonth = monthOf(today);
  const left = Math.max(0, monthTarget - monthMinutes);
  const over = Math.max(0, monthMinutes - monthTarget);
  const status = { left, over, isCurrent: month === thisMonth, isPast: month < thisMonth, perDay: null, daysLeft: null };
  if (status.isCurrent && left > 0) {
    const [year, m, day] = today.split('-').map(Number);
    status.daysLeft = new Date(year, m, 0).getDate() - day + 1;
    status.perDay = Math.ceil(left / status.daysLeft);
  }
  return status;
}
