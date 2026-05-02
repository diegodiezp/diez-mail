import { NextResponse } from 'next/server';
import { getPerson, updatePerson, getEventsForPerson } from '@/lib/airtable';
import { listThreads } from '@/lib/gmail-read';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { id } = params;
    const contact = await getPerson(id);

    const [emailEvents, gmailResult] = await Promise.all([
      contact.Email ? getEventsForPerson(contact.Email) : Promise.resolve([]),
      contact.Email
        ? listThreads({
            query: `{from:${contact.Email} to:${contact.Email}}`,
            maxResults: 30,
            label: 'ALL',
          }).catch(() => ({ threads: [] }))
        : Promise.resolve({ threads: [] }),
    ]);

    const gmailThreads = gmailResult.threads || [];

    // Calculate last contacted from both sources
    const allDates = [
      ...emailEvents.map((e) => e.Timestamp),
      ...gmailThreads.map((t) => t.date),
    ]
      .filter(Boolean)
      .map((d) => new Date(d))
      .filter((d) => !isNaN(d));

    const lastContacted = allDates.length
      ? new Date(Math.max(...allDates)).toISOString()
      : null;

    return NextResponse.json({ contact, emailEvents, gmailThreads, lastContacted });
  } catch (error) {
    console.error('Get contact error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = params;
    const fields = await request.json();
    const updated = await updatePerson(id, fields);
    return NextResponse.json({ contact: updated });
  } catch (error) {
    console.error('Update contact error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
