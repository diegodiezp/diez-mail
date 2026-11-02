// lib/model.js
// Shared, cached views of People and Campaigns plus the signal engine that
// powers Today, the person page and push notifications. One place decides
// what counts as "someone worth following up", so every screen agrees.

import { fetchAll, TABLES, normEmail } from './airtable';
import { filterBotNoise } from './botDetection';

const PEOPLE_TTL = 60 * 1000;
let peopleCache = { ts: 0, promise: null };
let campaignCache = { ts: 0, promise: null };

export const PEOPLE_FIELDS = [
  'First Name', 'Last Name', 'Email', 'Phone', 'City', 'Company', 'Type',
  'Notes', 'Pipeline', 'Interests', 'Do Not Email', 'Engagement Score',
  'Next Action', 'Next Action Date', 'Total Active Seconds', 'Max Session Seconds',
];

export function invalidatePeople() {
  peopleCache = { ts: 0, promise: null };
}

export async function getPeopleIndex() {
  if (peopleCache.promise && Date.now() - peopleCache.ts < PEOPLE_TTL) return peopleCache.promise;
  const promise = fetchAll(TABLES.people, {
    fields: PEOPLE_FIELDS,
    sort: [{ field: 'Last Name', direction: 'asc' }],
    maxRecords: 20000,
  }).then((people) => {
    const byId = new Map();
    const byEmail = new Map();
    for (const p of people) {
      p._name = `${p['First Name'] || ''} ${p['Last Name'] || ''}`.trim();
      p._types = Array.isArray(p.Type) ? p.Type : p.Type ? [p.Type] : [];
      byId.set(p.id, p);
      const e = normEmail(p.Email);
      if (e && !byEmail.has(e)) byEmail.set(e, p);
    }
    return { people, byId, byEmail };
  }).catch((err) => {
    peopleCache = { ts: 0, promise: null };
    throw err;
  });
  peopleCache = { ts: Date.now(), promise };
  return promise;
}

export async function getCampaignIndex() {
  if (campaignCache.promise && Date.now() - campaignCache.ts < 5 * 60 * 1000) return campaignCache.promise;
  const promise = fetchAll(TABLES.campaigns, {
    fields: ['Name', 'Subject', 'Status', 'Created', 'Sent Count', 'PDF Link'],
    maxRecords: 5000,
  }).then((campaigns) => {
    const byId = new Map(campaigns.map((c) => [c.id, c]));
    return { campaigns, byId };
  }).catch((err) => {
    campaignCache = { ts: 0, promise: null };
    throw err;
  });
  campaignCache = { ts: Date.now(), promise };
  return promise;
}

export function invalidateCampaigns() {
  campaignCache = { ts: 0, promise: null };
}

export function displayName(person, email) {
  return person?._name || person?.Email || email || 'Someone';
}

// ── Signal engine ───────────────────────────────────────────────────────────
// A "signal" is one person's engagement with one campaign (or booth room),
// summarized: strongest action, artworks they looked at, minutes in the
// viewing room, last activity. It stays on Today until it is marked done
// (a "Followed Up" event) or snoozed (which also turns it into a dated Next
// Action on the person).

export const LONG_VISIT_SECONDS = 120;

const RANK = {
  'Inquire Click': 6, 'WhatsApp Click': 6,
  'Long Visit': 5, 'Booth Lead': 5,
  'Artwork View': 4, 'Lightbox Open': 4,
  'PDF Download': 3, 'Viewing Room Open': 3, 'Related Room Click': 3,
  'Click': 2,
  'Multiple Opens': 1, 'Open': 1,
};

const ENGAGE = new Set([
  'Open', 'Click', 'Viewing Room Open', 'Artwork View', 'Inquire Click',
  'WhatsApp Click', 'PDF Download', 'Lightbox Open', 'Related Room Click',
]);

export function buildSignals(rawEvents, { peopleByEmail, campaignsById, windowDays = 30, includeDone = false } = {}) {
  const { events } = filterBotNoise(rawEvents);
  const groups = new Map();

  for (const e of events) {
    const email = normEmail(e['Recipient Email']);
    const cid = e['Campaign ID'] || e.Campaign?.[0];
    if (!email || !cid) continue;
    const key = `${email}::${cid}`;
    if (!groups.has(key)) groups.set(key, { email, campaignId: cid, events: [] });
    groups.get(key).events.push(e);
  }

  const cutoff = Date.now() - windowDays * 86400000;
  const out = [];

  for (const g of groups.values()) {
    const person = peopleByEmail?.get(g.email);
    if (person?.['Do Not Email'] && !includeDone) continue;

    const sent = g.events.find((e) => e['Event Type'] === 'Sent');
    const engagement = g.events.filter((e) => ENGAGE.has(e['Event Type']));
    const heartbeats = g.events.filter((e) => e['Event Type'] === 'Room Heartbeat');
    const isBoothLead = !!sent && String(sent['Event ID'] || '').startsWith('lead-');

    const roomSeconds = heartbeats.reduce((s, h) => s + (h['Active Seconds'] || 0), 0);
    const longestVisit = heartbeats.reduce((m, h) => Math.max(m, h['Active Seconds'] || 0), 0);

    if (engagement.length === 0 && !isBoothLead && roomSeconds === 0) continue;

    const allTimes = [...engagement, ...heartbeats].map((e) => new Date(e.Timestamp).getTime()).filter(Boolean);
    const lastActivity = allTimes.length ? Math.max(...allTimes) : new Date(sent?.Timestamp || 0).getTime();
    if (lastActivity < cutoff) continue;

    const followed = g.events
      .filter((e) => e['Event Type'] === 'Followed Up')
      .map((e) => new Date(e.Timestamp).getTime());
    const lastFollowUp = followed.length ? Math.max(...followed) : 0;
    // New activity after a follow-up brings the signal back
    const done = lastFollowUp > 0 && lastFollowUp >= lastActivity;
    if (done && !includeDone) continue;

    // Strongest signal
    const types = new Set(engagement.map((e) => e['Event Type']));
    const opens = engagement.filter((e) => e['Event Type'] === 'Open').length;
    if (opens >= 2) types.add('Multiple Opens');
    if (longestVisit >= LONG_VISIT_SECONDS) types.add('Long Visit');
    if (isBoothLead) types.add('Booth Lead');
    let strongest = 'Open';
    for (const t of types) if ((RANK[t] || 0) > (RANK[strongest] || 0)) strongest = t;

    // Artworks they looked at, most-viewed first
    const art = new Map();
    for (const e of engagement) {
      if (!e['Artwork ID'] && !e['Artwork Title']) continue;
      const k = e['Artwork ID'] || e['Artwork Title'];
      if (!art.has(k)) art.set(k, { id: e['Artwork ID'] || null, title: e['Artwork Title'] || '', views: 0, inquired: false });
      const a = art.get(k);
      if (e['Event Type'] === 'Artwork View' || e['Event Type'] === 'Lightbox Open') a.views++;
      if (e['Event Type'] === 'Inquire Click' || e['Event Type'] === 'WhatsApp Click') a.inquired = true;
    }
    const artworks = [...art.values()].sort((a, b) => (b.inquired - a.inquired) || (b.views - a.views));

    const campaign = campaignsById?.get(g.campaignId);
    out.push({
      key: `${g.email}::${g.campaignId}`,
      email: g.email,
      personId: person?.id || null,
      name: displayName(person, g.email),
      company: person?.Company || '',
      pipeline: person?.Pipeline || '',
      score: person?.['Engagement Score'] || 0,
      campaignId: g.campaignId,
      campaignName: campaign?.Name || (isBoothLead ? 'Booth QR' : 'Campaign'),
      campaignSubject: campaign?.Subject || '',
      signal: strongest,
      rank: RANK[strongest] || 0,
      counts: {
        opens,
        clicks: engagement.filter((e) => e['Event Type'] === 'Click').length,
        roomOpens: engagement.filter((e) => e['Event Type'] === 'Viewing Room Open').length,
        artworkViews: engagement.filter((e) => e['Event Type'] === 'Artwork View' || e['Event Type'] === 'Lightbox Open').length,
        pdf: engagement.filter((e) => e['Event Type'] === 'PDF Download').length,
        inquiries: engagement.filter((e) => e['Event Type'] === 'Inquire Click' || e['Event Type'] === 'WhatsApp Click').length,
      },
      roomSeconds,
      longestVisit,
      artworks: artworks.slice(0, 6),
      lastActivity: new Date(lastActivity).toISOString(),
      sentAt: sent?.Timestamp || null,
      boothLead: isBoothLead,
      done,
    });
  }

  out.sort((a, b) => (b.rank - a.rank) || (new Date(b.lastActivity) - new Date(a.lastActivity)));
  return out;
}
