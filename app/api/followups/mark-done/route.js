import { NextResponse } from 'next/server';
import { logEmailEvent } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { email, campaignId } = await request.json();

    if (!email || !campaignId) {
      return NextResponse.json({ error: 'Missing email or campaignId' }, { status: 400 });
    }

    await logEmailEvent({
      'Event ID': `fup-${campaignId}-${Date.now()}`,
      'Recipient Email': email,
      Campaign: [campaignId],
      'Campaign ID': campaignId,
      'Event Type': 'Followed Up',
      Timestamp: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Mark follow-up done error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
