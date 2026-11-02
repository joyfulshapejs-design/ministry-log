import { get, put, getAll, getByIndexRange } from '../db.js';
import { h, card } from '../ui.js';
import { todayISO, monthOf, shiftMonth, monthLabel, formatDuration, sumMinutes } from '../util.js';

// Remembered while the app stays open, so coming back to Report shows the month you were on.
let shownMonth = null;

export function reportText({ month, minutes, studies, remarks }) {
  const lines = [
    `Field Service Report - ${monthLabel(month)}`,
    `Hours: ${formatDuration(minutes)}`,
    `Bible studies: ${studies}`,
  ];
  if (remarks.trim()) lines.push(`Remarks: ${remarks.trim()}`);
  return lines.join('\n');
}

export async function render() {
  const root = h('div', {});
  await show(root, shownMonth || monthOf(todayISO()));
  return root;
}

async function show(root, month) {
  shownMonth = month;
  const [entries, contacts, saved] = await Promise.all([
    getByIndexRange('serviceEntries', 'date', `${month}-01`, `${month}-31`),
    getAll('contacts'),
    get('monthlyRemarks', month),
  ]);
  const minutes = sumMinutes(entries);
  const studies = contacts.filter((contact) => contact.isStudy).length;

  const nav = h('div', { class: 'month-nav' },
    h('button', { class: 'nav-button', type: 'button', 'aria-label': 'Previous month', onclick: () => show(root, shiftMonth(month, -1)) }, '‹'),
    h('strong', {}, monthLabel(month)),
    h('button', { class: 'nav-button', type: 'button', 'aria-label': 'Next month', onclick: () => show(root, shiftMonth(month, 1)) }, '›'),
  );

  const remarks = h('textarea', { rows: 3, maxLength: 500, placeholder: 'Optional', 'aria-label': 'Remarks', value: saved ? saved.remarks : '' });
  const status = h('p', { class: 'muted', role: 'status' });
  const preview = h('pre', { class: 'preview' });

  const current = () => reportText({ month, minutes, studies, remarks: remarks.value });
  const refresh = () => { preview.textContent = current(); };

  async function saveRemarks() {
    await put('monthlyRemarks', { month, remarks: remarks.value.trim() });
    refresh();
  }
  remarks.addEventListener('input', refresh);
  remarks.addEventListener('change', saveRemarks);

  async function copy() {
    await saveRemarks();
    status.textContent = (await copyText(current())) ? 'Copied.' : 'Could not copy. Select the text above and copy it by hand.';
  }

  async function share() {
    await saveRemarks();
    try {
      await navigator.share({ text: current() });
      status.textContent = '';
    } catch (error) {
      // Closing the share sheet is not an error worth showing.
      if (error.name !== 'AbortError') status.textContent = 'Sharing is not available. Use Copy instead.';
    }
  }

  refresh();
  // replaceChildren turns null into the text "null", so empty slots are filtered out first.
  root.replaceChildren(...[
    nav,
    card(
      h('div', { class: 'stats' },
        h('div', {}, h('p', { class: 'big-number' }, formatDuration(minutes)), h('p', { class: 'muted' }, 'Hours')),
        h('div', {}, h('p', { class: 'big-number' }, studies), h('p', { class: 'muted' }, 'Bible studies')),
      ),
    ),
    card(h('label', { class: 'field stacked' }, h('span', { class: 'field-label' }, 'Remarks'), remarks)),
    h('h2', { class: 'section-title' }, 'Message'),
    card(preview),
    h('button', { class: 'button primary', type: 'button', onclick: copy }, 'Copy'),
    navigator.share ? h('button', { class: 'button', type: 'button', onclick: share }, 'Share') : null,
    status,
  ].filter(Boolean));
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older iOS versions only allow copying from a selected text field.
    const box = h('textarea', { value: text, readOnly: true, style: 'position:fixed;opacity:0;' });
    document.body.append(box);
    box.select();
    const ok = document.execCommand && document.execCommand('copy');
    box.remove();
    return Boolean(ok);
  }
}
