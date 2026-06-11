import { NextResponse } from 'next/server';
import { getCampaigns, getEventsForCampaign, getPeople } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

// Events we surface in the activity feed. "Sent" is intentionally excluded:
// it fires once per recipient per campaign and would drown out real signal.
const FEED_EVENTS = new Set([
  'Open',
  'Click',
  'Viewing Room Open',
  'Artwork View',
  'Inquire Click',
]);

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);

    // Techo elevado de 100 → 500: un solo día muy activo (50+ artwork views
    // por coleccionista) ya consumía el presupuesto entero del feed.
    const limit = Math.min(parseInt(searchParams.get('limit') || '40', 10), 500);

    // ── Incremental fetch ────────────────────────────────────────────────
    // "after" (ISO string) permite al cliente pedir solo los eventos
    // posteriores a una fecha. Los días pasados son inmutables, así que el
    // cliente los cachea en localStorage y solo pide lo nuevo.
    const after = searchParams.get('after');
    let afterTs = 0;
    if (after) {
      const parsed = new Date(after).getTime();
      if (!isNaN(parsed)) afterTs = parsed;
    }

    // Pull everything in parallel. getEventsForCampaign(null) already returns
    // all events sorted by Timestamp desc.
    const [events, campaigns, people] = await Promise.all([
      getEventsForCampaign(null),
      getCampaigns(),
      getPeople(),
    ]);

    // Lookup maps
    const campaignName = {};
    for (const c of campaigns) campaignName[c.id] = c.Name || 'Untitled';

    const personName = {};
    for (const p of people) {
      const full = [p['First Name'], p['Last Name']].filter(Boolean).join(' ').trim();
      personName[p.id] = full || p.Email || '';
    }

    // Today's total movements (gallery's local day; Timestamp is ISO from Airtable)
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    let today = 0;

    const feed = [];
    for (const e of events) {
      const type = e['Event Type'];
      if (!FEED_EVENTS.has(type)) continue;

      const ts = e.Timestamp ? new Date(e.Timestamp).getTime() : 0;

      // Los eventos vienen ordenados desc: en cuanto cruzamos el corte
      // "after", todo lo que queda es más antiguo y podemos parar.
      // NOTA: el contador "today" no se ve afectado porque after siempre
      // es <= inicio de hoy cuando lo manda el cliente.
      if (afterTs && ts < afterTs) break;

      // Count every qualifying movement that happened today
      if (ts >= startOfDay) today++;

      // Resolve the actor's name: linked Person first, fall back to email
      let who = '';
      if (Array.isArray(e.Person) && e.Person.length) {
        who = personName[e.Person[0]] || '';
      }
      if (!who) who = e['Recipient Email'] || 'Someone';

      // Resolve campaign name from the linked Campaign id(s)
      let campaign = '';
      if (Array.isArray(e.Campaign) && e.Campaign.length) {
        campaign = campaignName[e.Campaign[0]] || '';
      }

      feed.push({
        id: e.id,
        type,
        who,
        campaign,
        artwork: e['Artwork Title'] || null,
        url: e['Clicked URL'] || null,
        device: e.Device || null,
        timestamp: e.Timestamp || null,
      });

      if (feed.length >= limit) break;
    }

    return NextResponse.json({ feed, today });
  } catch (error) {
    console.error('Activity API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
