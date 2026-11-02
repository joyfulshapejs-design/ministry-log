import { h } from './ui.js';
import { formatDuration } from './util.js';

// A labelled progress bar: "label ... 2:30 of 50:00" over a bar that fills up to 100%.
export function progress(label, done, target) {
  const percent = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0;
  return h('div', { class: 'progress-block' },
    h('div', { class: 'progress-text' },
      h('span', {}, label),
      h('span', { class: 'progress-numbers' }, `${formatDuration(done)} of ${formatDuration(target)}`)),
    h('div', { class: 'progress', role: 'progressbar', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(percent) },
      h('div', { class: 'progress-bar', style: `width:${percent}%` })));
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  children.forEach((child) => node.append(child));
  return node;
}

// A ring that fills clockwise as done approaches target, with the percent in the middle.
// The ring stops at 100% but the number keeps counting, so going over the goal is still visible.
export function ring(done, target, label) {
  const percent = target > 0 ? Math.round((done / target) * 100) : 0;
  const filled = target > 0 ? Math.min(1, done / target) : 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;

  return svg('svg', {
    class: 'ring', viewBox: '0 0 140 140', role: 'progressbar', 'aria-label': label,
    'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.min(100, percent)),
  },
  svg('circle', { class: 'ring-track', cx: 70, cy: 70, r: radius }),
  svg('circle', {
    class: `ring-bar${filled >= 1 ? ' done' : ''}`, cx: 70, cy: 70, r: radius, transform: 'rotate(-90 70 70)',
    'stroke-dasharray': circumference.toFixed(2), 'stroke-dashoffset': (circumference * (1 - filled)).toFixed(2),
  }),
  svg('text', { class: 'ring-percent', x: 70, y: 74, 'text-anchor': 'middle' }, document.createTextNode(`${percent}%`)),
  svg('text', { class: 'ring-sub', x: 70, y: 94, 'text-anchor': 'middle' }, document.createTextNode(`${formatDuration(done)} of ${formatDuration(target)}`)));
}
