// lib/gmail.js
// Gmail API sending (used by tracked replies and the legacy send path).
// All tracking helpers live in lib/tracking.js and are re-exported here.

import { google } from 'googleapis';
import crypto from 'crypto';
import {
  generateTrackingId,
  encodeTrackingData,
  decodeTrackingData,
  buildTrackingPixel,
  buildTrackedLink,
  wrapLinksWithTracking,
  personalizeBody,
} from './tracking';

// Re-export so routes and gmail-read.js importing from '@/lib/gmail' don't break
export {
  generateTrackingId,
  encodeTrackingData,
  decodeTrackingData,
  buildTrackingPixel,
  buildTrackedLink,
  wrapLinksWithTracking,
  personalizeBody,
};

// Create OAuth2 client
function getAuth() {
  const oauth2 = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'https://developers.google.com/oauthplayground'
  );
  oauth2.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
  return oauth2;
}

// Build raw MIME email
function buildMimeMessage({ to, from, fromName, subject, htmlBody, textBody }) {
  const boundary = `boundary_${crypto.randomBytes(16).toString('hex')}`;

  const headers = [
    `From: ${fromName ? `${fromName} <${from}>` : from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ].join('\r\n');

  const plainPart = [
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    textBody || htmlBody.replace(/<[^>]*>/g, ''),
  ].join('\r\n');

  const htmlPart = [
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    '',
    htmlBody,
    `--${boundary}--`,
  ].join('\r\n');

  const raw = `${headers}\r\n\r\n${plainPart}\r\n${htmlPart}`;
  return Buffer.from(raw).toString('base64url');
}

// Send a single email via Gmail API
export async function sendEmail({ to, subject, htmlBody, textBody }) {
  const auth = getAuth();
  const gmail = google.gmail({ version: 'v1', auth });

  const raw = buildMimeMessage({
    to,
    from: process.env.GMAIL_SENDER_EMAIL,
    fromName: process.env.GMAIL_SENDER_NAME,
    subject,
    htmlBody,
    textBody,
  });

  const result = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw },
  });

  return {
    messageId: result.data.id,
    threadId: result.data.threadId,
  };
}

// Send a campaign via Gmail (legacy path; campaign sends now use lib/resend.js,
// but the cron route still imports this, so it stays functional)
export async function sendCampaign({ campaignId, subject, bodyTemplate, recipients, pdfLink, customBodies, delayMs = 1500 }) {
  const results = [];

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const trackingId = generateTrackingId(campaignId, recipient.email);
    const pixel = buildTrackingPixel(trackingId, campaignId, recipient.email);

    if (pdfLink) {
      recipient._pdfLink = buildTrackedLink(trackingId, campaignId, recipient.email, pdfLink);
    }

    let html;
    if (customBodies && customBodies[recipient.id]) {
      html = customBodies[recipient.id];
      if (recipient._pdfLink) {
        html = html.replace(
          /\{\{pdf_link\}\}/g,
          `<a href="${recipient._pdfLink}" style="color: #1a1a1a; text-decoration: underline;">View PDF</a>`
        );
      } else {
        html = html.replace(/\{\{pdf_link\}\}/g, '');
      }
    } else {
      html = personalizeBody(bodyTemplate, recipient);
    }

    html = wrapLinksWithTracking(html, trackingId, campaignId, recipient.email);

    if (!html.includes('<html')) {
      html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: Arial, sans-serif; font-size: 15px; line-height: 1.6; color: #1a1a1a; margin: 0; padding: 20px; text-align: left;">
${html}
${pixel}
</body>
</html>`;
    } else {
      html = html.replace('</body>', `${pixel}</body>`);
    }

    try {
      const result = await sendEmail({
        to: recipient.email,
        subject: personalizeBody(subject, recipient),
        htmlBody: html,
      });

      results.push({
        email: recipient.email,
        name: `${recipient.name} ${recipient.surname}`.trim(),
        status: 'sent',
        trackingId,
        messageId: result.messageId,
      });
    } catch (error) {
      results.push({
        email: recipient.email,
        name: `${recipient.name} ${recipient.surname}`.trim(),
        status: 'failed',
        error: error.message,
      });
    }

    if (i < recipients.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return results;
}
