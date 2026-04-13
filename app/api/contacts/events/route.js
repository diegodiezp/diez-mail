import { NextResponse } from 'next/server';
import { getEventsForPerson } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json({ error: 'Email parameter required' }, { status: 400 });
    }

    const events = await getEventsForPerson(email);

    return NextResponse.json({ events, total: events.length });
  } catch (error) {
    console.error('Contact events API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
