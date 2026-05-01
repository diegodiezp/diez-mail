import { NextResponse } from 'next/server';
import { listThreads } from '@/lib/gmail-read';
import { getPeople } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';
    const pageToken = searchParams.get('pageToken') || undefined;
    const label = searchParams.get('label') || 'INBOX';
    const maxResults = Math.min(parseInt(searchParams.get('max') || '25', 10), 50);

    const [threadData, people] = await Promise.all([
      listThreads({ query, pageToken, maxResults, label }),
      getPeople({ fields: ['First Name', 'Last Name', 'Email', 'Type'] }),
    ]);

    const contactMap = {};
    for (const p of people) {
      if (p.Email) {
        contactMap[p.Email.toLowerCase()] = {
          id: p.id,
          name: p['First Name'] || '',
          surname: p['Last Name'] || '',
          type: p.Type,
        };
      }
    }

    const enrichedThreads = threadData.threads.map((t) => {
      const email = t.from.email?.toLowerCase();
      const contact = email ? contactMap[email] : null;
      return { ...t, contact: contact || null };
    });

    return NextResponse.json({
      threads: enrichedThreads,
      nextPageToken: threadData.nextPageToken,
      resultSizeEstimate: threadData.resultSizeEstimate,
    });
  } catch (error) {
    console.error('List threads error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
