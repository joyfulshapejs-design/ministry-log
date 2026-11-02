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

export function addDays(iso, days) {
  const [year, m, d] = iso.split('-').map(Number);
  return todayISO(new Date(year, m - 1, d + days));
}

// Whole days from a to b (b later = positive).
export function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

// Turns what someone typed or pasted for Messenger into a bare username/ID, or null if it is not usable.
// Accepts: "maria.lopez", "@maria.lopez", m.me/maria.lopez, facebook.com/maria.lopez,
// messenger.com/t/maria.lopez, facebook.com/profile.php?id=1000123. Empty input gives ''.
export function messengerHandle(input) {
  const raw = input.trim();
  if (!raw) return '';
  let handle = raw.replace(/^@/, '');

  if (/[/?]/.test(raw) || /^(https?:|(www\.|m\.)?(facebook|fb|messenger)\.com|m\.me)/i.test(raw)) {
    let url;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    } catch {
      return null;
    }
    const host = url.hostname.toLowerCase();
    const bare = host.replace(/^(www|m)\./, ''); // "m.facebook.com" -> "facebook.com" (but not "m.me")
    const parts = url.pathname.split('/').filter(Boolean);
    if (host === 'm.me') handle = parts[0] || '';
    else if (bare === 'messenger.com') handle = parts[0] === 't' ? parts[1] || '' : '';
    else if (bare === 'facebook.com' || bare === 'fb.com') {
      if (parts[0] === 'profile.php') handle = url.searchParams.get('id') || '';
      else if (parts[0] === 'people') handle = [...parts].reverse().find((part) => /^\d+$/.test(part)) || '';
      else handle = parts[0] || '';
    } else return null;
  }
  return /^[A-Za-z0-9.\-_]{1,100}$/.test(handle) ? handle : null;
}

export const messengerLink = (handle) => `https://m.me/${encodeURIComponent(handle)}`;
