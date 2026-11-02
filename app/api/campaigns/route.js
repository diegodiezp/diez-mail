import { NextResponse } from 'next/server';
import { getCampaign, getEventsForCampaign, normEmail, fetchAll, TABLES } from '@/lib/airtable';
import { getEventsSince } from '@/lib/events';
import { getPeopleIndex, getCampaignIndex } from '@/lib/model';
import { filterBotNoise } from '@/lib/botDetection';

export const dynamic = 'force-dynamic';

const ROOM = new Set(['Viewing Room Open', 'Artwork View', 'Lightbox Open', 'PDF Download', 'Related Room Click']);
const INQ = new Set(['Inquire Click', 'WhatsApp Click']);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('id');
    if (campaignId) return detail(campaignId);
    return list();
  } catch (error) {
    console.error('Campaigns API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ── One campaign: the honest report ────────────────────────────────────────
async function detail(campaignId) {
  const [campaign, rawEvents, { byEmail }] = await Promise.all([
    getCampaign(campaignId),
    getEventsForCampaign(campaignId),
    getPeopleIndex(),
  ]);
  const { events, botDropped = 0, scannerDropped = 0, dedupeDropped = 0 } = filterBotNoise(rawEvents);

  const rawOpeners = new Set(rawEvents.filter((e) => e['Event Type'] === 'Open').map((e) => normEmail(e['Recipient Email'])));

  const recipients = {};
  for (const event of events) {
    const email = normEmail(event['Recipient Email']);
    if (!email) continue;
    if (!recipients[email]) {
      const p = byEmail.get(email);
      recipients[email] = {
        email,
        name: p?._name || email,
        personId: p?.id || null,
        company: p?.Company || '',
        sent: false, failed: false, opens: 0, clicks: 0, room: 0, artworkViews: 0, inquiries: 0, roomSeconds: 0,
        firstOpen: null, lastOpen: null, lastClick: null, lastActivity: null,
        clickedUrls: [], artworks: [], devices: new Set(),
      };
    }
    const r = recipients[email];
    const t = event['Event Type'];
    const ts = event.Timestamp;
    if (t === 'Sent') r.sent = true;
    else if (t === 'Failed') r.failed = true;
    else if (t === 'Open') {
      r.opens++;
      if (!r.firstOpen || ts < r.firstOpen) r.firstOpen = ts;
      if (!r.lastOpen || ts > r.lastOpen) r.lastOpen = ts;
    } else if (t === 'Click') {
      r.clicks++;
      if (!r.lastClick || ts > r.lastClick) r.lastClick = ts;
      if (event['Clicked URL']) r.clickedUrls.push(event['Clicked URL']);
    } else if (t === 'Room Heartbeat') {
      r.roomSeconds += event['Active Seconds'] || 0;
    } else if (ROOM.has(t)) {
      r.room++;
      if (t === 'Artwork View') {
        r.artworkViews++;
        if (event['Artwork Title']) r.artworks.push(event['Artwork Title']);
      }
    } else if (INQ.has(t)) {
      r.inquiries++;
      if (event['Artwork Title']) r.artworks.push(event['Artwork Title']);
    }
    if (!['Sent', 'Failed', 'Followed Up'].includes(t) && (!r.lastActivity || ts > r.lastActivity)) r.lastActivity = ts;
    if (event.Device && t !== 'Sent') r.devices.add(event.Device);
    if (event.Person?.length && !r.personId) r.personId = event.Person[0];
  }

  const recipientList = Object.values(recipients).map((r) => ({
    ...r,
    devices: [...r.devices],
    clickedUrls: [...new Set(r.clickedUrls)],
    artworks: [...new Set(r.artworks)],
  }));

  const sent = recipientList.filter((r) => r.sent).length;
  const count = (fn) => recipientList.filter(fn).length;
  const funnel = {
    sent,
    failed: count((r) => r.failed && !r.sent),
    opened: count((r) => r.opens > 0),
    openedRaw: rawOpeners.size,
    clicked: count((r) => r.clicks > 0),
    room: count((r) => r.room > 0 || r.roomSeconds > 0),
    artwork: count((r) => r.artworkViews > 0),
    inquired: count((r) => r.inquiries > 0),
  };

  // Clicked links, most clicked first
  const links = {};
  for (const e of events) {
    if (e['Event Type'] !== 'Click' || !e['Clicked URL']) continue;
    const url = e['Clicked URL'];
    links[url] = links[url] || { url, clicks: 0, people: new Set() };
    links[url].clicks++;
    links[url].people.add(normEmail(e['Recipient Email']));
  }

  return NextResponse.json({
    campaign: {
      id: campaign.id,
      name: campaign.Name || 'Untitled campaign',
      subject: campaign.Subject || null,
      status: campaign.Status || null,
      created: campaign.Created || null,
      bodyTemplate: campaign['Body Template'] || '',
      pdfLink: campaign['PDF Link'] || '',
      pdfLabel: campaign['PDF Label'] || '',
      // 1.x field names kept for anything still reading them
      'Body Template': campaign['Body Template'] || '',
      'PDF Link': campaign['PDF Link'] || '',
    },
    funnel,
    filtered: { bot: botDropped, scanner: scannerDropped, duplicate: dedupeDropped },
    // 1.x shape, used by CampaignCharts
    stats: {
      sent,
      uniqueOpens: funnel.opened,
      totalOpens: recipientList.reduce((s, r) => s + r.opens, 0),
      uniqueClicks: funnel.clicked,
      totalClicks: recipientList.reduce((s, r) => s + r.clicks, 0),
      openRate: sent ? ((funnel.opened / sent) * 100).toFixed(1) : 0,
      clickRate: sent ? ((funnel.clicked / sent) * 100).toFixed(1) : 0,
    },
    links: Object.values(links).map((l) => ({ url: l.url, clicks: l.clicks, people: l.people.size })).sort((a, b) => b.clicks - a.clicks),
    recipients: recipientList.sort((a, b) =>
      (b.inquiries - a.inquiries) || (b.artworkViews - a.artworkViews) || (b.roomSeconds - a.roomSeconds) || (b.clicks - a.clicks) || (b.opens - a.opens)
    ),
    events,
  });
}

// ── All campaigns ───────────────────────────────────────────────────────────
// Recent campaigns (last 45 days) are computed live and bot-filtered. Older
// ones read the human numbers the nightly job stores on the record (Unique
// Opens / Unique Clicks), so the list never has to read the whole history.
async function list() {
  const [{ campaigns }, recentRaw] = await Promise.all([getCampaignIndex(), getEventsSince(45)]);
  const { events: recent } = filterBotNoise(recentRaw);

  const live = new Map();
  for (const e of recent) {
    const cid = e['Campaign ID'] || e.Campaign?.[0];
    const em = normEmail(e['Recipient Email']);
    if (!cid || !em) continue;
    if (!live.has(cid)) live.set(cid, { sent: new Set(), opened: new Set(), clicked: new Set(), room: new Set(), inquired: new Set(), firstSent: null });
    const s = live.get(cid);
    const t = e['Event Type'];
    if (t === 'Sent') { s.sent.add(em); if (!s.firstSent || e.Timestamp < s.firstSent) s.firstSent = e.Timestamp; }
    if (t === 'Open') s.opened.add(em);
    if (t === 'Click') s.clicked.add(em);
    if (ROOM.has(t)) s.room.add(em);
    if (INQ.has(t)) s.inquired.add(em);
  }

  // Full records for stored stats (index only has a few fields)
  const full = await fetchAll(TABLES.campaigns, {
    fields: ['Name', 'Subject', 'Status', 'Created', 'Sent Count', 'Failed Count', 'Unique Opens', 'Unique Clicks', 'PDF Link'],
    maxRecords: 5000,
  });

  const out = full.map((c) => {
    const l = live.get(c.id);
    const sentLive = l?.sent.size || 0;
    const isLive = !!l && sentLive > 0;
    const sent = isLive ? Math.max(sentLive, c['Sent Count'] || 0) : c['Sent Count'] || 0;
    const opens = isLive ? l.opened.size : c['Unique Opens'] || 0;
    const clicks = isLive ? l.clicked.size : c['Unique Clicks'] || 0;
    return {
      id: c.id,
      Name: c.Name || 'Untitled campaign',
      Subject: c.Subject || '',
      Status: c.Status || '',
      date: l?.firstSent || c.Created || null,
      _sent: sent,
      _opens: opens,
      _clicks: clicks,
      _room: isLive ? l.room.size : null,
      _inquiries: isLive ? l.inquired.size : null,
      _openRate: sent > 0 ? ((opens / sent) * 100).toFixed(1) : 0,
      _clickRate: sent > 0 ? ((clicks / sent) * 100).toFixed(1) : 0,
      live: isLive,
      boothQr: /^Booth QR/i.test(c.Name || ''),
      reply: /^Reply:/i.test(c.Name || ''),
    };
  });
  out.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  return NextResponse.json({ campaigns: out });
}
