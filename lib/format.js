// lib/format.js
// Small display helpers shared by client pages. No server imports.

export function timeAgo(iso) {
  if (!iso) return '';
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return shortDate(iso);
}

export function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function fullDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function relativeDay(iso) {
  if (!iso) return 'Never';
  const days = Math.floor((Date.now() - new Date(iso)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} wk ago`;
  if (days < 365) return `${Math.floor(days / 30)} mo ago`;
  return `${Math.floor(days / 365)} yr ago`;
}

export function dueLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000);
  if (diff < 0) return `Overdue · ${shortDate(iso)}`;
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function isOverdue(iso) {
  if (!iso) return false;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return new Date(iso) < start;
}

export function duration(seconds) {
  const s = Math.round(seconds || 0);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m < 60) return r ? `${m}m ${r}s` : `${m}m`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function personName(p) {
  if (!p) return '';
  const first = p['First Name'] ?? p.name ?? '';
  const last = p['Last Name'] ?? p.surname ?? '';
  return `${first} ${last}`.trim() || p.Email || p.email || '';
}

// ── Engagement vocabulary ───────────────────────────────────────────────────
// Rank decides which signal "wins" when a person did several things.
export const SIGNAL = {
  'Inquire Click':      { rank: 6, step: 5, noun: 'Inquiry',        verb: 'inquired about' },
  'WhatsApp Click':     { rank: 6, step: 5, noun: 'WhatsApp',       verb: 'messaged on WhatsApp about' },
  'Long Visit':         { rank: 5, step: 4, noun: 'Long visit',     verb: 'spent a long time in' },
  'Artwork View':       { rank: 4, step: 4, noun: 'Artwork view',   verb: 'looked closely at' },
  'Lightbox Open':      { rank: 4, step: 4, noun: 'Zoomed in',      verb: 'zoomed into' },
  'PDF Download':       { rank: 3, step: 3, noun: 'PDF download',   verb: 'downloaded the PDF of' },
  'Viewing Room Open':  { rank: 3, step: 3, noun: 'Viewing room',   verb: 'opened the viewing room of' },
  'Related Room Click': { rank: 3, step: 3, noun: 'Related room',   verb: 'moved to a related room from' },
  'Click':              { rank: 2, step: 2, noun: 'Clicked',        verb: 'clicked a link in' },
  'Multiple Opens':     { rank: 1, step: 1, noun: 'Opened often',   verb: 'kept reopening' },
  'Open':               { rank: 1, step: 1, noun: 'Opened',         verb: 'opened' },
  'Booth Lead':         { rank: 5, step: 4, noun: 'Booth lead',     verb: 'left their email at the booth for' },
};

export function signalOf(type) {
  return SIGNAL[type] || { rank: 0, step: 1, noun: type, verb: 'engaged with' };
}

// Tailwind class for a dot of the given signal strength (1..5)
export function stepDot(step) {
  return ['bg-signal-1', 'bg-signal-1', 'bg-signal-2', 'bg-signal-3', 'bg-signal-4', 'bg-signal-5'][step] || 'bg-signal-1';
}

export const PIPELINE_STAGES = ['Prospect', 'Warm', 'Interested', 'Negotiating', 'Collector', 'Inactive'];
