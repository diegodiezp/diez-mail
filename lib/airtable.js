import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_PAT }).base(
  process.env.AIRTABLE_BASE_ID
);

const TABLES = {
  people: 'People',
  campaigns: 'Campaigns',
  emailEvents: 'Email Events',
};

// ── 60-second in-memory cache for the heavy "all events" query ──────────────
// The Activity page, campaigns list and per-campaign stats all need events.
// Fetching 5,000 records means ~50 paginated Airtable calls; doing that on
// every page view is slow and flirts with Airtable's 5 req/s limit. The cache
// makes repeat views within a minute instant. Vercel may cold-start and clear
// it at any time; that's fine, it just refetches.
let _eventsCache = { data: null, ts: 0 };
const EVENTS_CACHE_TTL = 60 * 1000;

async function fetchAll(tableName, options = {}) {
  const records = [];
  const query = base(tableName).select({
    maxRecords: options.maxRecords || 1000,
    ...(options.view && { view: options.view }),
    ...(options.filterByFormula && { filterByFormula: options.filterByFormula }),
    ...(options.fields && { fields: options.fields }),
    ...(options.sort && { sort: options.sort }),
  });

  await query.eachPage((page, fetchNext) => {
    records.push(...page.map((r) => ({ id: r.id, ...r.fields })));
    fetchNext();
  });

  return records;
}

async function fetchOne(tableName, recordId) {
  const record = await base(tableName).find(recordId);
  return { id: record.id, ...record.fields };
}

async function createRecord(tableName, fields) {
  // New events make the cache stale; drop it so fresh activity shows up
  if (tableName === TABLES.emailEvents) {
    _eventsCache = { data: null, ts: 0 };
  }
  const record = await base(tableName).create(fields);
  return { id: record.id, ...record.fields };
}

async function createRecords(tableName, recordsData) {
  if (tableName === TABLES.emailEvents) {
    _eventsCache = { data: null, ts: 0 };
  }
  const results = [];
  for (let i = 0; i < recordsData.length; i += 10) {
    const batch = recordsData.slice(i, i + 10);
    const created = await base(tableName).create(
      batch.map((fields) => ({ fields }))
    );
    results.push(...created.map((r) => ({ id: r.id, ...r.fields })));
  }
  return results;
}

async function updateRecord(tableName, recordId, fields) {
  const record = await base(tableName).update(recordId, fields);
  return { id: record.id, ...record.fields };
}

// Batch update, mirroring createRecords: chunks of 10 to respect Airtable's
// per-request record limit and the 5 req/s rate limit.
async function updateRecords(tableName, recordUpdates) {
  if (tableName === TABLES.emailEvents) {
    _eventsCache = { data: null, ts: 0 };
  }
  const results = [];
  for (let i = 0; i < recordUpdates.length; i += 10) {
    const batch = recordUpdates.slice(i, i + 10);
    const updated = await base(tableName).update(
      batch.map(({ id, fields }) => ({ id, fields }))
    );
    results.push(...updated.map((r) => ({ id: r.id, ...r.fields })));
  }
  return results;
}

// --- People ---
// Actual fields: First Name, Last Name, Email, Type (multiselect), Company, Phone, City, Notes

export async function getPeople(options = {}) {
  return fetchAll(TABLES.people, {
    fields: [
      'First Name', 'Last Name', 'Email', 'Phone',
      'City', 'Company', 'Type', 'Notes', 'Pipeline', 'Interests',
      'Do Not Email', 'Engagement Score', 'Score Updated',
    ],
    sort: [{ field: 'Last Name', direction: 'asc' }],
    maxRecords: 10000,
    ...options,
  });
}

// Given a list of People record IDs, return the set of emails among them
// that are marked "Do Not Email". Used to enforce suppression server-side
// at send time, since the frontend sends recipient objects that may be stale.
export async function getSuppressedEmails(personIds) {
  const ids = (personIds || []).filter(Boolean);
  if (ids.length === 0) return new Set();

  const suppressed = new Set();
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const formula = `OR(${chunk.map((id) => `RECORD_ID()='${id}'`).join(',')})`;
    const records = await fetchAll(TABLES.people, {
      filterByFormula: formula,
      fields: ['Email', 'Do Not Email'],
      maxRecords: 50,
    });
    for (const r of records) {
      if (r['Do Not Email'] && r.Email) suppressed.add(r.Email);
    }
  }
  return suppressed;
}

export async function getPerson(id) {
  return fetchOne(TABLES.people, id);
}

export async function updatePerson(id, fields) {
  return updateRecord(TABLES.people, id, fields);
}

export async function getPersonByEmail(email) {
  const escaped = email.replace(/'/g, "\\'");
  const records = await fetchAll(TABLES.people, {
    filterByFormula: `{Email} = '${escaped}'`,
    maxRecords: 1,
  });
  return records[0] || null;
}

export async function getPeopleByRole(role) {
  return fetchAll(TABLES.people, {
    filterByFormula: `FIND("${role}", ARRAYJOIN(Type))`,
    sort: [{ field: 'Last Name', direction: 'asc' }],
    maxRecords: 10000,
  });
}

// People whose Next Action Date is overdue or within the next 7 days.
// Used by the dashboard's "Due this week" card.
export async function getPeopleDueForFollowUp() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + 7);
  const cutoffIso = cutoff.toISOString();

  return fetchAll(TABLES.people, {
    filterByFormula: `AND({Next Action Date} != '', IS_BEFORE({Next Action Date}, '${cutoffIso}'))`,
    fields: ['First Name', 'Last Name', 'Email', 'Next Action', 'Next Action Date'],
    sort: [{ field: 'Next Action Date', direction: 'asc' }],
    maxRecords: 500,
  });
}

// --- Campaigns ---

export async function getCampaigns() {
  return fetchAll(TABLES.campaigns, {
    sort: [{ field: 'Name', direction: 'desc' }],
    maxRecords: 2000,
  });
}

export async function getCampaign(id) {
  return fetchOne(TABLES.campaigns, id);
}

export async function createCampaign(fields) {
  return createRecord(TABLES.campaigns, fields);
}

export async function updateCampaign(id, fields) {
  return updateRecord(TABLES.campaigns, id, fields);
}

// --- Email Events ---

export async function logEmailEvent(fields) {
  return createRecord(TABLES.emailEvents, fields);
}

export async function getEventsForPerson(email) {
  return fetchAll(TABLES.emailEvents, {
    filterByFormula: `{Recipient Email} = '${email}'`,
    sort: [{ field: 'Timestamp', direction: 'desc' }],
  });
}

export async function getEventsForCampaign(campaignId) {
  // ── All events (activity feed + campaigns list stats), cached 60s ────────
  if (!campaignId) {
    if (_eventsCache.data && Date.now() - _eventsCache.ts < EVENTS_CACHE_TTL) {
      return _eventsCache.data;
    }
    const events = await fetchAll(TABLES.emailEvents, {
      sort: [{ field: 'Timestamp', direction: 'desc' }],
      maxRecords: 5000,
    });
    _eventsCache = { data: events, ts: Date.now() };
    return events;
  }

  // ── Single campaign ──────────────────────────────────────────────────────
  // Primary lookup: the Campaign ID text field, written directly on every
  // event created after this field was added. Cheap, exact, no ambiguity.
  const idEscaped = campaignId.replace(/'/g, "\\'");
  const byId = await fetchAll(TABLES.emailEvents, {
    filterByFormula: `{Campaign ID} = '${idEscaped}'`,
    sort: [{ field: 'Timestamp', direction: 'desc' }],
    maxRecords: 5000,
  });

  // Fallback for events logged before Campaign ID existed: linked record
  // fields resolve to the linked record's PRIMARY FIELD (the campaign Name)
  // inside filterByFormula, not the record id, so match on name and then
  // verify the actual record link (name match can over-include if one
  // campaign name is a substring of another). Remove this fallback once old
  // campaigns without Campaign ID go quiet.
  const campaign = await fetchOne(TABLES.campaigns, campaignId);
  const name = (campaign.Name || '').replace(/'/g, "\\'");

  const byName = await fetchAll(TABLES.emailEvents, {
    filterByFormula: `FIND('${name}', ARRAYJOIN({Campaign}))`,
    sort: [{ field: 'Timestamp', direction: 'desc' }],
    maxRecords: 5000,
  });

  const verifiedByName = byName.filter((event) => {
    const campaigns = event.Campaign;
    if (!campaigns || !Array.isArray(campaigns)) return false;
    return campaigns.includes(campaignId);
  });

  // Merge and dedupe by record id: a campaign may have a mix of events
  // logged before and after this change.
  const merged = new Map();
  for (const event of [...byId, ...verifiedByName]) {
    merged.set(event.id, event);
  }

  return Array.from(merged.values()).sort(
    (a, b) => new Date(b.Timestamp) - new Date(a.Timestamp)
  );
}

// ── Activity feed: only the events since `after` ────────────────────────────
// The activity page is incremental — past days are immutable and cached in the
// client's localStorage, so it only ever needs events from the last open day.
// Pushing that cutoff down to Airtable as a filter means we fetch a handful of
// rows instead of the whole (multi-thousand row) Email Events table, which is
// the difference between a cold load taking seconds vs. being near-instant.
//
// With no cutoff (first visit / cleared cache) we fall back to the cached full
// fetch, since that load genuinely needs the complete history.
export async function getRecentEvents(after) {
  if (!after) return getEventsForCampaign(null);

  const cutoff = new Date(after);
  if (isNaN(cutoff.getTime())) return getEventsForCampaign(null);

  // Nudge the cutoff back 1s so events sitting exactly on the boundary aren't
  // dropped. `after` is generated by us from a parsed Date (never the raw query
  // string), so there's nothing to escape in the formula.
  const iso = new Date(cutoff.getTime() - 1000).toISOString();

  return fetchAll(TABLES.emailEvents, {
    filterByFormula: `IS_AFTER({Timestamp}, '${iso}')`,
    sort: [{ field: 'Timestamp', direction: 'desc' }],
    maxRecords: 5000,
  });
}

// Get set of emails that already received a "Sent" event for a given campaign.
// Used by the incremental send feature to avoid sending duplicates.
export async function getAlreadySentEmails(campaignId) {
  const events = await getEventsForCampaign(campaignId);
  const sentEmails = new Set();
  for (const ev of events) {
    if (ev['Event Type'] === 'Sent' && ev['Recipient Email']) {
      sentEmails.add(ev['Recipient Email']);
    }
  }
  return sentEmails;
}

// --- Short Links (manual / WhatsApp shares) ---

export async function getOrCreateManualCampaign() {
  const NAME = 'Manual / WhatsApp Links';
  const existing = await fetchAll(TABLES.campaigns, {
    filterByFormula: `{Name} = '${NAME}'`,
    maxRecords: 1,
  });
  if (existing[0]) return existing[0];
  return createRecord(TABLES.campaigns, { Name: NAME });
}

export async function createShortLink(fields) {
  return createRecord('Short Links', fields);
}

export async function getShortLinkByCode(code) {
  const escaped = code.replace(/'/g, "\\'");
  const records = await fetchAll('Short Links', {
    filterByFormula: `{Code} = '${escaped}'`,
    maxRecords: 1,
  });
  return records[0] || null;
}

export async function getRecentShortLinks(limit = 20) {
  return fetchAll('Short Links', {
    sort: [{ field: 'Created', direction: 'desc' }],
    maxRecords: limit,
  });
}

// --- Templates ---

export async function getTemplates() {
  return fetchAll('Templates', {
    sort: [{ field: 'Name', direction: 'asc' }],
    maxRecords: 2000,
  });
}

export async function getTemplate(id) {
  return fetchOne('Templates', id);
}

export async function createTemplate(fields) {
  return createRecord('Templates', fields);
}

async function deleteRecord(tableName, recordId) {
  await base(tableName).destroy(recordId);
}

export async function deleteTemplate(id) {
  return deleteRecord('Templates', id);
}

export { base, TABLES, fetchAll, fetchOne, createRecord, createRecords, updateRecord, updateRecords };
