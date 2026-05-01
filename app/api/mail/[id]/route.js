import { NextResponse } from 'next/server';
import { getThread } from '@/lib/gmail-read';
import { getPeople } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'Thread ID required' }, { status: 400 });
    }

    const [threadData, people] = await Promise.all([
      getThread(id),
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

    const messages = threadData.messages.map((msg) => {
      const email = msg.from.email?.toLowerCase();
      return {
        ...msg,
        contact: email ? contactMap[email] || null : null,
      };
    });

    return NextResponse.json({ threadId: threadData.threadId, messages });
  } catch (error) {
    console.error('Get thread error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
