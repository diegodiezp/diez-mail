import { NextResponse } from 'next/server';
import { normEmail } from '@/lib/airtable';
import { getEventsSince } from '@/lib/events';
import { getPeopleIndex, getCampaignIndex, buildSignals } from '@/lib/model';

export const dynamic = 'force-dynamic';

// Fair mode: every booth-QR lead (Sent events whose Event ID starts with
// "lead-", written by /api/ev/lead) from the last ?days= days, with what
// each one did in the room afterwards.
export async function GET(request) {
  try {
    const days = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get('days') || '14', 10), 1), 120);
    const [events, { byEmail }, { byId: campaignsById }] = await Promise.all([
      getEventsSince(days),
      getPeopleIndex(),
      getCampaignIndex(),
    ]);

    const signals = buildSignals(events, { peopleByEmail: byEmail, campaignsById, windowDays: days, includeDone: true });
    const signalByKey = new Map(signals.map((s) => [s.key, s]));

    const leads = events
      .filter((e) => e['Event Type'] === 'Sent' && String(e['Event ID'] || '').startsWith('lead-'))
      .map((e) => {
        const email = normEmail(e['Recipient Email']);
        const cid = e['Campaign ID'] || e.Campaign?.[0];
        const p = byEmail.get(email);
        const s = signalByKey.get(`${email}::${cid}`);
        const room = (campaignsById.get(cid)?.Name || '').replace(/^Booth QR\s*·\s*/i, '') || 'room';
        return {
          email,
          personId: p?.id || null,
          name: p?._name || '',
          company: p?.Company || '',
          pipeline: p?.Pipeline || '',
          notes: p?.Notes || '',
          room,
          campaignId: cid,
          at: e.Timestamp,
          roomSeconds: s?.roomSeconds || 0,
          artworkViews: s?.counts?.artworkViews || 0,
          inquired: (s?.counts?.inquiries || 0) > 0,
          artworks: s?.artworks || [],
          followedUp: !!s?.done,
          newsletter: /newsletter: yes/i.test(p?.Notes || ''),
        };
      })
      .sort((a, b) => String(b.at).localeCompare(String(a.at)));

    const rooms = [...new Set(leads.map((l) => l.room))];
    return NextResponse.json({ days, leads, rooms });
  } catch (error) {
    console.error('Fair API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
