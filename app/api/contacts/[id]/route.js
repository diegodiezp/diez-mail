import { NextResponse } from 'next/server';
import { getPerson, base, TABLES } from '@/lib/airtable';
import { getEventsForEmail } from '@/lib/events';
import { getCampaignIndex, buildSignals, invalidatePeople } from '@/lib/model';
import { getArtworks } from '@/lib/artworks';
import { filterBotNoise } from '@/lib/botDetection';
import { listThreads } from '@/lib/gmail-read';

export const dynamic = 'force-dynamic';

const ART_TYPES = new Set(['Artwork View', 'Lightbox Open', 'Inquire Click', 'WhatsApp Click']);

// The person page in one response: the record, a unified timeline (campaign
// mail, viewing-room visits, Gmail threads), the artworks they looked at
// with details from the inventory, campaigns received, and open signals.
export async function GET(request, { params }) {
  try {
    const { id } = params;
    const contact = await getPerson(id);
    const email = contact.Email || '';

    const [rawEvents, gmailResult, { byId: campaignsById }] = await Promise.all([
      email ? getEventsForEmail(email) : Promise.resolve([]),
      email
        ? listThreads({ query: `{from:${email} to:${email}}`, maxResults: 30, label: 'ALL' }).catch(() => ({ threads: [] }))
        : Promise.resolve({ threads: [] }),
      getCampaignIndex(),
    ]);
    const { events } = filterBotNoise(rawEvents);
    const gmailThreads = gmailResult.threads || [];

    // ── Viewing-room sessions (one Room Heartbeat row per visit) ────────────
    const sessions = events
      .filter((e) => e['Event Type'] === 'Room Heartbeat' && (e['Active Seconds'] || 0) > 0)
      .map((e) => ({
        id: e['Session ID'] || e.id,
        seconds: e['Active Seconds'] || 0,
        at: e.Timestamp,
        campaign: campaignsById.get(e['Campaign ID'] || e.Campaign?.[0])?.Name || '',
      }));

    // ── Artworks they looked at ────────────────────────────────────────────
    const art = new Map();
    for (const e of events) {
      if (!ART_TYPES.has(e['Event Type'])) continue;
      const key = e['Artwork ID'] || e['Artwork Title'];
      if (!key) continue;
      if (!art.has(key)) art.set(key, { id: e['Artwork ID'] || null, title: e['Artwork Title'] || '', views: 0, inquired: false, last: e.Timestamp });
      const a = art.get(key);
      if (e['Event Type'] === 'Inquire Click' || e['Event Type'] === 'WhatsApp Click') a.inquired = true;
      else a.views++;
      if (e.Timestamp > a.last) a.last = e.Timestamp;
    }
    const details = await getArtworks([...art.values()].map((a) => a.id).filter(Boolean));
    const artworks = [...art.values()]
      .map((a) => ({ ...a, ...(a.id && details.get(a.id) ? { ...details.get(a.id), title: details.get(a.id).title || a.title } : {}) }))
      .sort((a, b) => (b.inquired - a.inquired) || (b.views - a.views) || String(b.last).localeCompare(String(a.last)));

    // Artists they keep coming back to
    const artistCounts = {};
    for (const a of artworks) if (a.artist) artistCounts[a.artist] = (artistCounts[a.artist] || 0) + a.views + (a.inquired ? 5 : 0);
    const topArtists = Object.entries(artistCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name]) => name);

    // ── Campaigns received ──────────────────────────────────────────────────
    const byCampaign = new Map();
    for (const e of events) {
      const cid = e['Campaign ID'] || e.Campaign?.[0];
      if (!cid) continue;
      if (!byCampaign.has(cid)) byCampaign.set(cid, { id: cid, sentAt: null, opened: 0, clicked: 0, room: 0, inquired: false });
      const c = byCampaign.get(cid);
      const t = e['Event Type'];
      if (t === 'Sent' && (!c.sentAt || e.Timestamp < c.sentAt)) c.sentAt = e.Timestamp;
      if (t === 'Open') c.opened++;
      if (t === 'Click') c.clicked++;
      if (t === 'Viewing Room Open') c.room++;
      if (t === 'Inquire Click' || t === 'WhatsApp Click') c.inquired = true;
    }
    const campaigns = [...byCampaign.values()]
      .map((c) => ({ ...c, name: campaignsById.get(c.id)?.Name || 'Campaign' }))
      .sort((a, b) => String(b.sentAt || '').localeCompare(String(a.sentAt || '')));

    // ── Timeline ────────────────────────────────────────────────────────────
    const SHOW = new Set(['Sent', 'Open', 'Click', 'Viewing Room Open', 'Artwork View', 'Inquire Click', 'WhatsApp Click', 'PDF Download', 'Failed', 'Bounced', 'Complained', 'Followed Up']);
    const timeline = [];
    for (const e of events) {
      if (!SHOW.has(e['Event Type'])) continue;
      timeline.push({
        kind: 'event',
        type: e['Event Type'],
        at: e.Timestamp,
        campaign: campaignsById.get(e['Campaign ID'] || e.Campaign?.[0])?.Name || '',
        artwork: e['Artwork Title'] || '',
        device: e.Device || '',
      });
    }
    for (const s of sessions) timeline.push({ kind: 'visit', type: 'Visit', at: s.at, seconds: s.seconds, campaign: s.campaign });
    for (const t of gmailThreads) {
      const fromMe = /@diez\.gallery$/i.test(t.from?.email || '');
      timeline.push({ kind: 'mail', type: fromMe ? 'You wrote' : 'They wrote', at: t.date, subject: t.subject || '(no subject)', threadId: t.id, snippet: t.snippet || '' });
    }
    timeline.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));

    const contactTimes = gmailThreads.map((t) => t.date)
      .concat(events.filter((e) => e['Event Type'] === 'Sent').map((e) => e.Timestamp))
      .map((d) => new Date(d).getTime())
      .filter((n) => Number.isFinite(n));
    const lastContacted = contactTimes.length ? new Date(Math.max(...contactTimes)).toISOString() : null;

    const signals = buildSignals(rawEvents, { peopleByEmail: new Map(), campaignsById, windowDays: 30 })
      .map((s) => ({ ...s, personId: id, name: `${contact['First Name'] || ''} ${contact['Last Name'] || ''}`.trim() }));

    return NextResponse.json({
      contact,
      timeline: timeline.slice(0, 300),
      artworks,
      topArtists,
      sessions: {
        count: sessions.length,
        totalSeconds: sessions.reduce((s, x) => s + x.seconds, 0),
        longestSeconds: sessions.reduce((m, x) => Math.max(m, x.seconds), 0),
      },
      campaigns,
      signals,
      lastContacted,
      gmailThreads,
    });
  } catch (error) {
    console.error('Get contact error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Only fields the UI edits can be written through this route.
const EDITABLE = new Set([
  'First Name', 'Last Name', 'Email', 'Phone', 'City', 'Company', 'Type',
  'Notes', 'Pipeline', 'Interests', 'Do Not Email', 'Next Action', 'Next Action Date',
]);

export async function PATCH(request, { params }) {
  try {
    const { id } = params;
    const body = await request.json();
    const fields = {};
    for (const [k, v] of Object.entries(body || {})) if (EDITABLE.has(k)) fields[k] = v;
    if (Object.keys(fields).length === 0) {
      return NextResponse.json({ error: 'No editable fields in request' }, { status: 400 });
    }
    const record = await base(TABLES.people).update(id, fields, { typecast: true });
    invalidatePeople();
    return NextResponse.json({ contact: { id: record.id, ...record.fields } });
  } catch (error) {
    console.error('Update contact error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
