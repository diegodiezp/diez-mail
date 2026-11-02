import { NextResponse } from 'next/server';
import { normEmail } from '@/lib/airtable';
import { getPeopleIndex } from '@/lib/model';
import { getDeliveryEvents, getEventsSince, ENGAGEMENT_TYPES } from '@/lib/events';
import { getInterestIndex, topArtistsFor } from '@/lib/interest';

export const dynamic = 'force-dynamic';

// People list for the People screen, the pipeline board and the composer.
// Each person carries what the filters need: pipeline, score, last time we
// emailed them, last time they did something, artists they look at.
// ?type=Collector and ?q=text still work as in 1.x.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const q = searchParams.get('q')?.toLowerCase();
    const lite = searchParams.get('lite') === '1';

    const [{ people }, delivery, recent, interest] = await Promise.all([
      getPeopleIndex(),
      lite ? Promise.resolve([]) : getDeliveryEvents().catch(() => []),
      lite ? Promise.resolve([]) : getEventsSince(180, { types: ENGAGEMENT_TYPES, fields: ['Event Type', 'Recipient Email', 'Timestamp'] }).catch(() => []),
      lite ? Promise.resolve(null) : getInterestIndex().catch(() => null),
    ]);

    const lastSent = new Map();
    for (const e of delivery) {
      if (e['Event Type'] !== 'Sent') continue;
      const em = normEmail(e['Recipient Email']);
      if (em && (!lastSent.has(em) || e.Timestamp > lastSent.get(em))) lastSent.set(em, e.Timestamp);
    }
    const lastActive = new Map();
    for (const e of recent) {
      const em = normEmail(e['Recipient Email']);
      if (em && (!lastActive.has(em) || e.Timestamp > lastActive.get(em))) lastActive.set(em, e.Timestamp);
    }

    let list = people
      .filter((p) => p.Email || p._name)
      .map((p) => {
        const em = normEmail(p.Email);
        const types = p._types;
        return {
          id: p.id,
          name: p['First Name'] || '',
          surname: p['Last Name'] || '',
          fullName: p._name,
          email: (p.Email || '').trim(),
          phone: p.Phone || '',
          city: p.City || '',
          company: p.Company || '',
          type: types[0] || '',
          types,
          pipeline: p.Pipeline || '',
          notes: p.Notes || '',
          interests: p.Interests || '',
          doNotEmail: !!p['Do Not Email'],
          engagementScore: p['Engagement Score'] || 0,
          nextAction: p['Next Action'] || '',
          nextActionDate: p['Next Action Date'] || null,
          roomSeconds: p['Total Active Seconds'] || 0,
          lastSent: lastSent.get(em) || null,
          lastActive: lastActive.get(em) || null,
          artists: interest ? topArtistsFor(interest, em, 3) : [],
        };
      });

    if (type) list = list.filter((p) => p.types.includes(type));
    if (q) {
      list = list.filter((p) =>
        [p.name, p.surname, p.email, p.company, p.city].some((v) => v?.toLowerCase().includes(q))
      );
    }

    // Only people with an email can receive campaigns; the composer relies
    // on this. The hygiene screen asks for everyone with ?all=1.
    if (searchParams.get('all') !== '1') list = list.filter((p) => p.email);

    return NextResponse.json({
      people: list,
      total: list.length,
      artists: interest?.artists || [],
    });
  } catch (error) {
    console.error('Contacts API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
