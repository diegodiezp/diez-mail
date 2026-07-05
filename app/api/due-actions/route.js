import { NextResponse } from 'next/server';
import { getPeopleDueForFollowUp } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const people = await getPeopleDueForFollowUp();

    const dueActions = people.map((p) => ({
      id: p.id,
      name: `${p['First Name'] || ''} ${p['Last Name'] || ''}`.trim() || p.Email || 'Unknown',
      nextAction: p['Next Action'] || '',
      nextActionDate: p['Next Action Date'] || null,
    }));

    return NextResponse.json({ dueActions, count: dueActions.length });
  } catch (error) {
    console.error('Due actions API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
