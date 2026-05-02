import { NextResponse } from 'next/server';
import { getThread } from '@/lib/gmail-read';
import { getPeople } from '@/lib/airtable';
import { google } from 'googleapis';

export const dynamic = 'force-dynamic';

function getGmailClient() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

export async function PATCH(request, { params }) {
  try {
    const { id } = params;
    const { action } = await request.json();
    const gmail = getGmailClient();

    let requestBody = {};
    if (action === 'archive') {
      requestBody = { removeLabelIds: ['INBOX'] };
    } else if (action === 'markRead') {
      requestBody = { removeLabelIds: ['UNREAD'] };
    } else if (action === 'markUnread') {
      requestBody = { addLabelIds: ['UNREAD'] };
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    await gmail.users.threads.modify({ userId: 'me', id, requestBody });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Modify thread error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'Thread ID required' }, { status: 400 });
    }
    const gmail = getGmailClient();
    await gmail.users.threads.trash({ userId: 'me', id });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Trash thread error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

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
