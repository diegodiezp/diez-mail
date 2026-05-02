import { google } from 'googleapis';
import crypto from 'crypto';
import {
  generateTrackingId,
  buildTrackingPixel,
  wrapLinksWithTracking,
  buildTrackedLink,
} from './gmail';

const TRACKING_SECRET = process.env.TRACKING_SECRET || 'default-secret';

// Reuse the same auth from gmail.js
function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return oauth2;
}

function getGmail() {
  return google.gmail({ version: 'v1', auth: getAuth() });
}

// ── List threads ─────────────────────────────────────────────────────────
// Returns { threads, nextPageToken, resultSizeEstimate }
export async function listThreads({ query = '', pageToken, maxResults = 25, label = 'INBOX' } = {}) {
  const gmail = getGmail();

  const labelIds = label === 'SENT' ? ['SENT'] : ['INBOX'];

  const params = {
    userId: 'me',
    maxResults,
    labelIds,
    ...(pageToken && { pageToken }),
  };

  // Build the Gmail search query
  const parts = ['diez.gallery'];
  if (query) parts.push(query);
  params.q = parts.join(' ');

  const res = await gmail.users.threads.list(params);

  if (!res.data.threads) {
    return { threads: [], nextPageToken: null, resultSizeEstimate: 0 };
  }

  // Fetch minimal metadata for each thread (subject, from, date, snippet)
  const threads = await Promise.all(
    res.data.threads.map(async (t) => {
      try {
        const thread = await gmail.users.threads.get({
          userId: 'me',
          id: t.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'To', 'Date'],
        });

        const messages = thread.data.messages || [];
        const lastMessage = messages[messages.length - 1];
        const firstMessage = messages[0];

        const getHeader = (msg, name) => {
          const h = msg?.payload?.headers?.find(
            (h) => h.name.toLowerCase() === name.toLowerCase()
          );
          return h?.value || '';
        };

        // Parse "From" into { name, email }
        const fromRaw = getHeader(lastMessage, 'From');
        const fromMatch = fromRaw.match(/^"?(.+?)"?\s*<(.+?)>$/);
        const from = fromMatch
          ? { name: fromMatch[1].replace(/"/g, ''), email: fromMatch[2] }
          : { name: fromRaw, email: fromRaw };

        return {
          id: t.id,
          snippet: t.snippet || lastMessage?.snippet || '',
          subject: getHeader(firstMessage, 'Subject') || '(no subject)',
          from,
          to: getHeader(lastMessage, 'To'),
          date: getHeader(lastMessage, 'Date'),
          messageCount: messages.length,
          labelIds: lastMessage?.labelIds || [],
          isUnread: lastMessage?.labelIds?.includes('UNREAD') || false,
        };
      } catch {
        return {
          id: t.id,
          snippet: t.snippet || '',
          subject: '(error loading)',
          from: { name: '', email: '' },
          to: '',
          date: '',
          messageCount: 0,
          labelIds: [],
          isUnread: false,
        };
      }
    })
  );

  return {
    threads,
    nextPageToken: res.data.nextPageToken || null,
    resultSizeEstimate: res.data.resultSizeEstimate || 0,
  };
}

// ── Get full thread ──────────────────────────────────────────────────────
// Returns all messages with decoded bodies
export async function getThread(threadId) {
  const gmail = getGmail();

  const res = await gmail.users.threads.get({
    userId: 'me',
    id: threadId,
    format: 'full',
  });

  const messages = (res.data.messages || []).map((msg) => {
    const getHeader = (name) => {
      const h = msg.payload?.headers?.find(
        (h) => h.name.toLowerCase() === name.toLowerCase()
      );
      return h?.value || '';
    };

    // Extract body (prefer HTML, fallback to plain) and attachments
    let htmlBody = '';
    let textBody = '';
    const attachments = [];

    function extractParts(part) {
      if (!part) return;
      const mime = part.mimeType || '';
      if (mime === 'text/html' && part.body?.data && !htmlBody) {
        htmlBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (mime === 'text/plain' && part.body?.data && !textBody) {
        textBody = Buffer.from(part.body.data, 'base64').toString('utf-8');
      } else if (part.filename && part.body?.attachmentId) {
        attachments.push({
          id: part.body.attachmentId,
          filename: part.filename,
          mimeType: mime,
          size: part.body.size || 0,
        });
      }
      if (part.parts) {
        part.parts.forEach(extractParts);
      }
    }

    extractParts(msg.payload);

    // If no parts found, try the payload body directly
    if (!htmlBody && !textBody && msg.payload?.body?.data) {
      const decoded = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8');
      if (msg.payload.mimeType === 'text/html') {
        htmlBody = decoded;
      } else {
        textBody = decoded;
      }
    }

    // Parse "From"
    const fromRaw = getHeader('From');
    const fromMatch = fromRaw.match(/^"?(.+?)"?\s*<(.+?)>$/);
    const from = fromMatch
      ? { name: fromMatch[1].replace(/"/g, ''), email: fromMatch[2] }
      : { name: fromRaw, email: fromRaw };

    return {
      id: msg.id,
      threadId: msg.threadId,
      from,
      to: getHeader('To'),
      cc: getHeader('Cc'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      htmlBody,
      textBody,
      attachments,
      snippet: msg.snippet || '',
      labelIds: msg.labelIds || [],
      isUnread: msg.labelIds?.includes('UNREAD') || false,
    };
  });

  return { threadId, messages };
}

// ── Send a tracked reply ────────────────────────────────────────────────
// Sends a reply within an existing Gmail thread, with tracking pixel + link wrapping.
// Creates a one-person "campaign" in Airtable for tracking purposes.
export async function sendTrackedReply({
  threadId,
  to,
  subject,
  htmlBody,
  campaignId,
  recipientEmail,
}) {
  const gmail = getGmail();
  const trackingId = generateTrackingId(campaignId, recipientEmail);
  const pixel = buildTrackingPixel(trackingId, campaignId, recipientEmail);

  // Wrap links with click tracking
  let trackedHtml = wrapLinksWithTracking(htmlBody, trackingId, campaignId, recipientEmail);

  // Wrap in HTML structure + pixel
  if (!trackedHtml.includes('<html')) {
    trackedHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 20px; text-align: left;">
${trackedHtml}
${pixel}
</body>
</html>`;
  } else {
    trackedHtml = trackedHtml.replace('</body>', `${pixel}</body>`);
  }

  // Build MIME with In-Reply-To and References headers for proper threading
  const boundary = `boundary_${crypto.randomBytes(16).toString('hex')}`;
  const senderEmail = process.env.GMAIL_SENDER_EMAIL;
  const senderName = process.env.GMAIL_SENDER_NAME;

  // Ensure subject has "Re: " prefix
  const reSubject = subject.startsWith('Re: ') ? subject : `Re: ${subject}`;

  const headers = [
    `From: ${senderName ? `${senderName} <${senderEmail}>` : senderEmail}`,
    `To: ${to}`,
    `Subject: ${reSubject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n');

  const textBody = trackedHtml.replace(/<[^>]*>/g, '');

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
    trackedHtml,
    `--${boundary}--`,
  ].join('\r\n');

  const raw = `${headers}\r\n\r\n${plainPart}\r\n${htmlPart}`;
  const encoded = Buffer.from(raw).toString('base64url');

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encoded,
      threadId,
    },
  });

  return {
    messageId: result.data.id,
    threadId: result.data.threadId,
    trackingId,
  };
}
