import Airtable from 'airtable';

const base = new Airtable({ apiKey: process.env.AIRTABLE_PAT }).base(
  process.env.AIRTABLE_BASE_ID
);

const TABLES = {
  people: 'People',
  campaigns: 'Campaigns',
  emailEvents: 'Email Events',
};

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
  const record = await base(tableName).create(fields);
  return { id: record.id, ...record.fields };
}

async function createRecords(tableName, recordsData) {
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

// --- People ---
// Actual fields: First Name, Last Name, Email, Type (multiselect), Company, Phone, City, Notes

export async function getPeople(options = {}) {
  return fetchAll(TABLES.people, {
    fields: [
      'First Name', 'Last Name', 'Email', 'Phone',
      'City', 'Company', 'Type', 'Notes',
    ],
    sort: [{ field: 'Last Name', direction: 'asc' }],
    ...options,
  });
}

export async function getPerson(id) {
  return fetchOne(TABLES.people, id);
}

export async function getPeopleByRole(role) {
  return fetchAll(TABLES.people, {
    filterByFormula: `FIND("${role}", ARRAYJOIN(Type))`,
    sort: [{ field: 'Last Name', direction: 'asc' }],
  });
}

// --- Campaigns ---

export async function getCampaigns() {
  return fetchAll(TABLES.campaigns, {
    sort: [{ field: 'Name', direction: 'desc' }],
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
  // Fetch all events
  const allEvents = await fetchAll(TABLES.emailEvents, {
    sort: [{ field: 'Timestamp', direction: 'desc' }],
    maxRecords: 5000,
  });

  // If no campaignId, return all events (used for campaign list stats)
  if (!campaignId) return allEvents;

  // Filter by campaign link
  return allEvents.filter((event) => {
    const campaigns = event.Campaign;
    if (!campaigns || !Array.isArray(campaigns)) return false;
    return campaigns.includes(campaignId);
  });
}

export { base, TABLES, fetchAll, fetchOne, createRecord, createRecords, updateRecord };
