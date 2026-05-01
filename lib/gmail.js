import { google } from 'googleapis';
import crypto from 'crypto';

const TRACKING_SECRET = process.env.TRACKING_SECRET || 'default-secret';

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

// Generate a unique tracking ID for each email
export function generateTrackingId(campaignId, recipientEmail) {
  const data = `${campaignId}:${recipientEmail}:${Date.now()}`;
  return crypto.createHmac('sha256', TRACKING_SECRET).update(data).digest('hex').slice(0, 24);
}

// Encode tracking data into a URL-safe string
// Supports both pixel tracking (no url) and click tracking (with url)
export function encodeTrackingData(trackingId, campaignId, recipientEmail, destinationUrl = null) {
  const payload = { tid: trackingId, cid: campaignId, email: recipientEmail };
  if (destinationUrl) payload.url = destinationUrl;
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

// Decode tracking data from pixel or click request
export function decodeTrackingData(encoded) {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Build the tracking pixel HTML (invisible 1x1 image)
export function buildTrackingPixel(trackingId, campaignId, recipientEmail) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const data = encodeTrackingData(trackingId, campaignId, recipientEmail);
  return `<img src="${appUrl}/api/track/${data}" width="1" height="1" style="display:none" alt="" />`;
}

// Build a tracked click URL
// Instead of linking directly to the PDF, the email links to your server,
// which logs the click and redirects to the actual destination
export function buildTrackedLink(trackingId, campaignId, recipientEmail, destinationUrl) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const data = encodeTrackingData(trackingId, campaignId, recipientEmail, destinationUrl);
  return `${appUrl}/api/track/click/${data}`;
}

// Replace all links in HTML body with tracked versions
// Handles two cases:
// 1. Links already in <a href="..."> tags
// 2. Bare URLs in text (not inside an href attribute)
// Special case: if destination is rooms.diez.gallery, append ?t=encodedData
// so the viewing room can decode it and continue the engagement tracking chain
export function wrapLinksWithTracking(html, trackingId, campaignId, recipientEmail) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  function buildDestination(url) {
    let destination = url;
    if (url.includes('rooms.diez.gallery')) {
      const encoded = encodeTrackingData(trackingId, campaignId, recipientEmail);
      const separator = url.includes('?') ? '&' : '?';
      destination = `${url}${separator}t=${encoded}`;
    }
    return destination;
  }

  // Step 1: Wrap URLs that are already inside href="..."
  let result = html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (match, url) => {
      if (url.startsWith(appUrl)) return match;
      const destination = buildDestination(url);
      const trackedUrl = buildTrackedLink(trackingId, campaignId, recipientEmail, destination);
      return `href="${trackedUrl}"`;
    }
  );

  // Step 2: Wrap bare URLs in text (not already inside an href or src attribute)
  // This regex matches URLs that are NOT preceded by href=" or src="
  result = result.replace(
    /(?<!href="|src=")(https?:\/\/[^\s<>"]+)/g,
    (match, url) => {
      // Don't track links to the app itself
      if (url.startsWith(appUrl)) return match;
      const destination = buildDestination(url);
      const trackedUrl = buildTrackedLink(trackingId, campaignId, recipientEmail, destination);

      // Smart label based on URL type
      let label;
      if (url.includes('rooms.diez.gallery')) {
        label = 'View here';
      } else if (/\.pdf(\?|$)/i.test(url)) {
        label = 'Download PDF';
      } else {
        // Clean domain: strip protocol and www
        label = url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
      }

      return `<a href="${trackedUrl}" style="color: #1a1a1a; text-decoration: underline;">${label}</a>`;
    }
  );

  return result;
}

// Personalize email body with merge tags
export function personalizeBody(template, recipient) {
  let body = template
    .replace(/\{\{first_name\}\}/g, recipient.name || '')
    .replace(/\{\{surname\}\}/g, recipient.surname || '')
    .replace(/\{\{full_name\}\}/g, `${recipient.name || ''} ${recipient.surname || ''}`.trim())
    .replace(/\{\{email\}\}/g, recipient.email || '')
    .replace(/\{\{city\}\}/g, recipient.city || '');

  // Replace {{pdf_link}} with a proper HTML link
  if (recipient._pdfLink) {
    body = body.replace(
      /\{\{pdf_link\}\}/g,
      `<a href="${recipient._pdfLink}" style="color: #1a1a1a; text-decoration: underline;">View PDF</a>`
    );
  } else {
    body = body.replace(/\{\{pdf_link\}\}/g, '');
  }

  // Convert plain text newlines to HTML line breaks
  // (only if the body doesn't already contain HTML tags)
  if (!body.includes('<p>') && !body.includes('<div>') && !body.includes('<br')) {
    body = body.replace(/\n/g, '<br>');
  }

  return body;
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

// Send a campaign: personalized emails to a list of recipients
// customBodies is an optional map: { [personId]: "edited HTML body" }
// If a recipient has a custom body, it's used AS-IS (merge tags already resolved
// by the frontend). Otherwise the bodyTemplate + merge tags path runs as before.
export async function sendCampaign({ campaignId, subject, bodyTemplate, recipients, pdfLink, customBodies, delayMs = 1500 }) {
  const results = [];

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const trackingId = generateTrackingId(campaignId, recipient.email);
    const pixel = buildTrackingPixel(trackingId, campaignId, recipient.email);

    // If there's a PDF link, create a per-recipient tracked version
    if (pdfLink) {
      recipient._pdfLink = buildTrackedLink(trackingId, campaignId, recipient.email, pdfLink);
    }

    // Determine the HTML body for this recipient:
    // 1. If customBodies has an entry for this person, use it directly
    //    (merge tags were already resolved in the frontend personalize step)
    // 2. Otherwise, run the standard personalizeBody with the template
    let html;
    if (customBodies && customBodies[recipient.id]) {
      html = customBodies[recipient.id];
      // Still need to handle {{pdf_link}} in custom bodies
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

    // Wrap all other links with click tracking
    html = wrapLinksWithTracking(html, trackingId, campaignId, recipient.email);

    // Wrap in minimal HTML structure if needed
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
      // Insert pixel before closing body tag
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

    // Delay between sends to avoid rate limits
    if (i < recipients.length - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  return results;
}
