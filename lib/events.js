// lib/events.js
// Email Events queries for 2.0. The 1.x code read "the newest 5,000 events"
// everywhere, which silently drops history once the table grows past that
// (scores drift down, old campaigns lose their stats). Every query here is
// either bounded by TIME (a window pushed down to Airtable as a formula) or
// trimmed to the few FIELDS it needs, never by a record count.
//
// Results are cached in memory for a short TTL keyed by the query, so the
// Today page, the nav badge and the people list share one fetch per minute.

import { fetchAll, TABLES, normEmail } from './airtable';
import { eventsVersion } from './cacheBus';

const DAY_MS = 24 * 60 * 60 * 1000;
const NO_CAP = 100000;

// Fields most views need. User Agent is included because bot filtering
// (lib/botDetection.js) reads it; Event ID because booth leads are detected
// from its "lead-" prefix.
export const CORE_FIELDS = [
  'Event ID', 'Event Type', 'Recipient Email', 'Timestamp', 'Tracking ID',
  'Campaign', 'Campaign ID', 'Person', 'Artwork ID', 'Artwork Title',
  'Clicked URL', 'Device', 'User Agent', 'Active Seconds', 'Session ID',
];

// Engagement event types (everything a human does after receiving mail)
export const ENGAGEMENT_TYPES = [
  'Open', 'Click', 'Viewing Room Open', 'Artwork View', 'Inquire Click',
  'WhatsApp Click', 'PDF Download', 'Lightbox Open', 'Related Room Click',
];

// Events that say something about a specific artwork
export const ARTWORK_TYPES = ['Artwork View', 'Lightbox Open', 'Inquire Click', 'WhatsApp Click'];

// ── tiny TTL cache ───────────────────────────────────────────────────────────
const cache = new Map();
async function cached(key, ttlMs, loader) {
  const hit = cache.get(key);
  if (hit && hit.v === eventsVersion() && Date.now() - hit.ts < ttlMs) return hit.value;
  // Store the promise itself so concurrent callers share one Airtable fetch
  const promise = loader().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, { ts: Date.now(), v: eventsVersion(), value: promise });
  return promise;
}

// Call after writing events so the next read is fresh
export function invalidateEventCache() {
  cache.clear();
}

function typeFormula(types) {
  if (!types || types.length === 0) return null;
  return `OR(${types.map((t) => `{Event Type}='${t.replace(/'/g, "\\'")}'`).join(',')})`;
}

function sinceFormula(days) {
  const iso = new Date(Date.now() - days * DAY_MS).toISOString();
  return `IS_AFTER({Timestamp}, '${iso}')`;
}

function and(...parts) {
  const p = parts.filter(Boolean);
  if (p.length === 0) return undefined;
  if (p.length === 1) return p[0];
  return `AND(${p.join(',')})`;
}

// Every event of the last `days` days, optionally only some types.
export async function getEventsSince(days, { types, fields = CORE_FIELDS, ttlMs = 60 * 1000 } = {}) {
  const key = `since:${days}:${(types || []).join('|')}:${fields.length}`;
  return cached(key, ttlMs, () =>
    fetchAll(TABLES.emailEvents, {
      filterByFormula: and(sinceFormula(days), typeFormula(types)),
      fields,
      sort: [{ field: 'Timestamp', direction: 'desc' }],
      maxRecords: NO_CAP,
    })
  );
}

// Events of some types over all time (no window). Used for the artwork
// view, which is small by nature: only room/artwork events.
export async function getEventsOfTypes(types, { fields = CORE_FIELDS, ttlMs = 5 * 60 * 1000 } = {}) {
  const key = `types:${types.join('|')}:${fields.length}`;
  return cached(key, ttlMs, () =>
    fetchAll(TABLES.emailEvents, {
      filterByFormula: typeFormula(types),
      fields,
      sort: [{ field: 'Timestamp', direction: 'desc' }],
      maxRecords: NO_CAP,
    })
  );
}

// Everything the engagement score needs, over the last two years, with only
// the fields scoring and bot filtering read. Sent stays in on purpose: the
// scanner check in botDetection measures time since Sent.
export async function getScoringEvents() {
  const types = [...ENGAGEMENT_TYPES, 'Sent', 'Bounced', 'Complained'];
  return fetchAll(TABLES.emailEvents, {
    filterByFormula: and(sinceFormula(730), typeFormula(types)),
    fields: ['Event ID', 'Event Type', 'Recipient Email', 'Timestamp', 'Tracking ID', 'Campaign', 'Campaign ID', 'User Agent'],
    maxRecords: NO_CAP,
  });
}

// All events for one person, matched on a normalized email
export async function getEventsForEmail(email) {
  const e = normEmail(email).replace(/'/g, "\\'");
  if (!e) return [];
  return fetchAll(TABLES.emailEvents, {
    filterByFormula: `LOWER(TRIM({Recipient Email})) = '${e}'`,
    fields: CORE_FIELDS,
    sort: [{ field: 'Timestamp', direction: 'desc' }],
    maxRecords: 5000,
  });
}

// Lightweight per-campaign stats over all time: only Sent/Open/Click with
// four fields each. Cached five minutes; powers the campaigns list.
export async function getDeliveryEvents() {
  return cached('delivery', 5 * 60 * 1000, () =>
    fetchAll(TABLES.emailEvents, {
      filterByFormula: typeFormula(['Sent', 'Open', 'Click']),
      fields: ['Event Type', 'Recipient Email', 'Timestamp', 'Tracking ID', 'Campaign', 'Campaign ID', 'User Agent', 'Event ID'],
      maxRecords: NO_CAP,
    })
  );
}

export const DAY = DAY_MS;
