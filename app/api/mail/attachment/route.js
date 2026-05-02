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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const messageId = searchParams.get('messageId');
    const attachmentId = searchParams.get('attachmentId');
    const filename = searchParams.get('filename') || 'attachment';
    const mimeType = searchParams.get('mimeType') || 'application/octet-stream';

    if (!messageId || !attachmentId) {
      return new Response('messageId and attachmentId required', { status: 400 });
    }

    const gmail = getGmailClient();
    const res = await gmail.users.messages.attachments.get({
      userId: 'me',
      messageId,
      id: attachmentId,
    });

    const data = Buffer.from(res.data.data, 'base64url');

    return new Response(data, {
      headers: {
        'Content-Type': mimeType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': data.length.toString(),
      },
    });
  } catch (error) {
    console.error('Attachment download error:', error);
    return new Response('Failed to download attachment', { status: 500 });
  }
}
