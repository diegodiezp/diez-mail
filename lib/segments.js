// lib/segments.js
// Recipient filters for the composer. A saved segment is just this object,
// stored as JSON in the "Segments" table. Client-safe.

export const EMPTY_FILTERS = {
  types: [],          // any of these Types
  stages: [],         // any of these Pipeline stages
  minScore: 0,        // engagement score at least
  city: '',           // city contains
  artist: '',         // has looked at works by this artist
  notEmailedDays: 0,  // no campaign sent to them in the last N days
  activeDays: 0,      // did something in the last N days
};

export function normalizeFilters(f = {}) {
  return { ...EMPTY_FILTERS, ...f, types: f.types || [], stages: f.stages || [] };
}

export function isEmpty(f) {
  const n = normalizeFilters(f);
  return !n.types.length && !n.stages.length && !n.minScore && !n.city && !n.artist && !n.notEmailedDays && !n.activeDays;
}

const DAY = 86400000;

export function matches(p, filters) {
  const f = normalizeFilters(filters);
  if (f.types.length && !f.types.some((t) => (p.types || [p.type]).includes(t))) return false;
  if (f.stages.length && !f.stages.includes(p.pipeline || '(none)')) return false;
  if (f.minScore && (p.engagementScore || 0) < f.minScore) return false;
  if (f.city && !(p.city || '').toLowerCase().includes(f.city.toLowerCase())) return false;
  if (f.artist && !(p.artists || []).includes(f.artist)) return false;
  if (f.notEmailedDays && p.lastSent && Date.now() - new Date(p.lastSent).getTime() < f.notEmailedDays * DAY) return false;
  if (f.activeDays && (!p.lastActive || Date.now() - new Date(p.lastActive).getTime() > f.activeDays * DAY)) return false;
  return true;
}

export function describe(filters) {
  const f = normalizeFilters(filters);
  const parts = [];
  if (f.types.length) parts.push(f.types.join(' or '));
  if (f.stages.length) parts.push(`stage ${f.stages.join('/')}`);
  if (f.minScore) parts.push(`score ≥ ${f.minScore}`);
  if (f.city) parts.push(`in ${f.city}`);
  if (f.artist) parts.push(`looked at ${f.artist}`);
  if (f.notEmailedDays) parts.push(`not emailed in ${f.notEmailedDays}d`);
  if (f.activeDays) parts.push(`active in ${f.activeDays}d`);
  return parts.join(' · ') || 'Everyone';
}
