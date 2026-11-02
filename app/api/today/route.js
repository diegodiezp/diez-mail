import { NextResponse } from 'next/server';
import { getEventsSince } from '@/lib/events';
import { getPeopleIndex, getCampaignIndex, buildSignals } from '@/lib/model';

export const dynamic = 'force-dynamic';

// Today: everything that needs Diego's attention, in one response.
//   signals  - people who engaged with a campaign in the last 30 days and
//              haven't been followed up (lib/model.js buildSignals)
//   due      - Next Actions that are overdue or due within 7 days
//   fair     - booth QR leads from the last 7 days (count + latest)
// ?summary=1 returns only the badge count, for the nav.
export async function GET(request) {
  try {
    const summary = new URL(request.url).searchParams.get('summary') === '1';
    const [events, { byEmail, people }, { byId: campaignsById }] = await Promise.all([
      getEventsSince(45),
      getPeopleIndex(),
      getCampaignIndex(),
    ]);

    const signals = buildSignals(events, { peopleByEmail: byEmail, campaignsById, windowDays: 30 });

    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);
    const weekAhead = new Date(startToday.getTime() + 8 * 86400000);
    const due = people
      .filter((p) => p['Next Action Date'] && (p['Next Action'] || '').trim())
      .filter((p) => new Date(p['Next Action Date']) < weekAhead)
      .map((p) => ({
        personId: p.id,
        name: p._name || p.Email || 'Unknown',
        company: p.Company || '',
        email: p.Email || '',
        action: p['Next Action'],
        date: p['Next Action Date'],
        overdue: new Date(p['Next Action Date']) < startToday,
        today: new Date(p['Next Action Date']).toDateString() === startToday.toDateString(),
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    const urgentDue = due.filter((d) => d.overdue || d.today).length;
    const count = signals.length + urgentDue;

    if (summary) return NextResponse.json({ count });

    const weekAgo = Date.now() - 7 * 86400000;
    const fairLeads = signals.filter((s) => s.boothLead && new Date(s.sentAt || 0).getTime() > weekAgo);

    return NextResponse.json({
      count,
      signals,
      due,
      fair: { count: fairLeads.length, latest: fairLeads.slice(0, 3).map((s) => s.name) },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Today API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
