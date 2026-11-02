// Date and duration helpers. Dates are ISO strings (YYYY-MM-DD) in the device's local time zone;
// durations are whole minutes.

export const ACTIVITY_TYPES = [
  { value: 'house-to-house', label: 'House-to-house' },
  { value: 'cart', label: 'Cart witnessing' },
  { value: 'informal', label: 'Informal' },
  { value: 'letter', label: 'Letter writing' },
  { value: 'phone', label: 'Phone' },
];

export const activityLabel = (value) =>
  (ACTIVITY_TYPES.find((type) => type.value === value) || { label: value }).label;

const pad = (n) => String(n).padStart(2, '0');

export function todayISO(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export const monthOf = (iso) => iso.slice(0, 7);

export function shiftMonth(month, delta) {
  const [year, m] = month.split('-').map(Number);
  const date = new Date(year, m - 1 + delta, 1);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

export function monthLabel(month) {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function dateLabel(iso) {
  const [year, m, d] = iso.split('-').map(Number);
  return new Date(year, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// 750 minutes -> "12:30"
export const formatDuration = (minutes) => `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;

export const sumMinutes = (entries) => entries.reduce((total, entry) => total + entry.minutes, 0);

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// "19:00" -> "7:00 PM"
export function formatTime(hhmm) {
  const [hour, minute] = hhmm.split(':').map(Number);
  return `${hour % 12 || 12}:${pad(minute)} ${hour < 12 ? 'AM' : 'PM'}`;
}

// Keeps only what a tel:/sms: link can use.
export const phoneDigits = (phone) => phone.replace(/[^\d+]/g, '');

export const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

// 0 = Sunday ... 6 = Saturday, matching WEEKDAYS.
export function weekdayOf(iso) {
  const [year, m, d] = iso.split('-').map(Number);
  return new Date(year, m - 1, d).getDay();
}

export function fullDateLabel(iso) {
  const [year, m, d] = iso.split('-').map(Number);
  return new Date(year, m - 1, d).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// True on an iPhone/iPad that opened the page in Safari rather than from the Home Screen icon.
export function needsHomeScreenInstall() {
  const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installed = navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  return iOS && !installed;
}
