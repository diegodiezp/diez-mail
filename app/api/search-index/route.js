import { NextResponse } from 'next/server';
import { getPeopleIndex, getCampaignIndex } from '@/lib/model';

export const dynamic = 'force-dynamic';

// Compact index for the ⌘K palette: a few fields per person and campaign.
export async function GET() {
  try {
    const [{ people }, { campaigns }] = await Promise.all([getPeopleIndex(), getCampaignIndex()]);
    return NextResponse.json({
      people: people
        .filter((p) => p.Email || p._name)
        .map((p) => ({ id: p.id, name: p._name, email: p.Email || '', company: p.Company || '', city: p.City || '' })),
      campaigns: campaigns
        .map((c) => ({
          id: c.id,
          name: c.Name || 'Untitled',
          date: c.Created ? new Date(c.Created).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : '',
          ts: c.Created || '',
        }))
        .sort((a, b) => String(b.ts).localeCompare(String(a.ts))),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
