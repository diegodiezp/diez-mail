import { NextResponse } from 'next/server';
import { google } from 'googleapis';
import crypto from 'crypto';

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

export async function POST(request) {
  try {
    const { to, subject, htmlBody } = await request.json();

    if (!to || !subject || !htmlBody) {
      return NextResponse.json({ error: 'to, subject, and htmlBody are required' }, { status: 400 });
    }

    const gmail = getGmailClient();
    const senderEmail = process.env.GMAIL_SENDER_EMAIL;
    const senderName = process.env.GMAIL_SENDER_NAME;

    const boundary = `boundary_${crypto.randomBytes(16).toString('hex')}`;
    const textBody = htmlBody.replace(/<[^>]*>/g, '');

    const headers = [
      `From: ${senderName ? `${senderName} <${senderEmail}>` : senderEmail}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
    ].join('\r\n');

    const plainPart = [
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      textBody,
    ].join('\r\n');

    const htmlPart = [
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      '',
      htmlBody,
      `--${boundary}--`,
    ].join('\r\n');

    const raw = `${headers}\r\n\r\n${plainPart}\r\n${htmlPart}`;
    const encoded = Buffer.from(raw).toString('base64url');

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw: encoded },
    });

    return NextResponse.json({ messageId: result.data.id, threadId: result.data.threadId });
  } catch (error) {
    console.error('Compose error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
