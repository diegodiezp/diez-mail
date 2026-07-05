import { NextResponse } from 'next/server';
import { getEventsForCampaign, getPeople, getCampaigns } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

const FOLLOWUP_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

// Event types that count as "engagement" for the qualifying rule. Viewing Room
// Open counts toward qualifying but isn't ranked below since it isn't part of
// the priority order the spec gives; treated as equivalent to a Click.
const ENGAGEMENT_TYPES = new Set([
  'Open', 'Click', 'Viewing Room Open', 'Artwork View', 'Inquire Click',
]);

// Highest tier that appears in a group's events wins as the "strongest
// signal" shown to the user, per the priority order in the spec.
function strongestSignal(events) {
  const types = new Set(events.map((e) => e['Event Type']));
  if (types.has('Inquire Click')) return { label: 'Inquire Click', rank: 5 };
  if (types.has('Artwork View')) return { label: 'Artwork View', rank: 4 };
  if (types.has('Viewing Room Open') || types.has('Click')) return { label: 'Click', rank: 3 };
  const opens = events.filter((e) => e['Event Type'] === 'Open').length;
  if (opens >= 2) return { label: 'Multiple Opens', rank: 2 };
  return { label: 'Open', rank: 1 };
}

export async function GET() {
  try {
    const [events, people, campaigns] = await Promise.all([
      getEventsForCampaign(null),
      getPeople(),
      getCampaigns(),
    ]);

    const personByEmail = new Map();
    for (const p of people) {
      if (p.Email) personByEmail.set(p.Email, p);
    }

    const campaignById = new Map();
    for (const c of campaigns) campaignById.set(c.id, c);

    // Group events by recipient + campaign. The campaign record id is
    // available both as Campaign[0] (the linked record) and Campaign ID
    // (the text field added for reliable filtering) - either works here.
    const groups = new Map();
    for (const event of events) {
      const email = event['Recipient Email'];
      const campaignId = event['Campaign ID'] || event.Campaign?.[0];
      if (!email || !campaignId) continue;

      const key = `${email}::${campaignId}`;
      if (!groups.has(key)) groups.set(key, { email, campaignId, events: [] });
      groups.get(key).events.push(event);
    }

    const cutoff = Date.now() - FOLLOWUP_WINDOW_MS;
    const followups = [];

    for (const { email, campaignId, events: groupEvents } of groups.values()) {
      const person = personByEmail.get(email);
      if (!person || person['Do Not Email']) continue;

      const sentEvent = groupEvents.find((e) => e['Event Type'] === 'Sent');
      if (!sentEvent || new Date(sentEvent.Timestamp).getTime() < cutoff) continue;

      const engagementEvents = groupEvents.filter((e) => ENGAGEMENT_TYPES.has(e['Event Type']));
      if (engagementEvents.length === 0) continue;

      const alreadyFollowedUp = groupEvents.some((e) => e['Event Type'] === 'Followed Up');
      if (alreadyFollowedUp) continue;

      const signal = strongestSignal(engagementEvents);
      const lastActivity = engagementEvents.reduce(
        (latest, e) => (new Date(e.Timestamp) > new Date(latest) ? e.Timestamp : latest),
        engagementEvents[0].Timestamp
      );

      const campaign = campaignById.get(campaignId);

      followups.push({
        email,
        personId: person.id,
        name: `${person['First Name'] || ''} ${person['Last Name'] || ''}`.trim() || email,
        campaignId,
        campaignName: campaign?.Name || 'Unknown campaign',
        signal: signal.label,
        signalRank: signal.rank,
        lastActivity,
        sentAt: sentEvent.Timestamp,
      });
    }

    followups.sort((a, b) => {
      if (b.signalRank !== a.signalRank) return b.signalRank - a.signalRank;
      return new Date(b.lastActivity) - new Date(a.lastActivity);
    });

    return NextResponse.json({ followups, count: followups.length });
  } catch (error) {
    console.error('Followups API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
