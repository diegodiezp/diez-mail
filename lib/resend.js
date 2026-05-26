import { Resend } from 'resend';
import crypto from 'crypto';

const TRACKING_SECRET = process.env.TRACKING_SECRET || 'default-secret';

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

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
export function buildTrackedLink(trackingId, campaignId, recipientEmail, destinationUrl) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const data = encodeTrackingData(trackingId, campaignId, recipientEmail, destinationUrl);
  return `${appUrl}/api/track/click/${data}`;
}

// Replace all links in HTML body with tracked versions
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

  // Step 1: Wrap URLs already inside href="..."
  let result = html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (match, url) => {
      if (url.startsWith(appUrl)) return match;
      const destination = buildDestination(url);
      const trackedUrl = buildTrackedLink(trackingId, campaignId, recipientEmail, destination);
      return `href="${trackedUrl}"`;
    }
  );

  // Step 2: Wrap bare URLs in text
  result = result.replace(
    /(?<!href="|src=")(https?:\/\/[^\s<>"]+)/g,
    (match, url) => {
      if (url.startsWith(appUrl)) return match;
      const destination = buildDestination(url);
      const trackedUrl = buildTrackedLink(trackingId, campaignId, recipientEmail, destination);

      let label;
      if (url.includes('rooms.diez.gallery')) {
        label = 'View here';
      } else if (/\.pdf(\?|$)/i.test(url)) {
        label = 'Download PDF';
      } else {
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

  if (recipient._pdfLink) {
    body = body.replace(
      /\{\{pdf_link\}\}/g,
      `<a href="${recipient._pdfLink}" style="color: #1a1a1a; text-decoration: underline;">View PDF</a>`
    );
  } else {
    body = body.replace(/\{\{pdf_link\}\}/g, '');
  }

  if (!body.includes('<p>') && !body.includes('<div>') && !body.includes('<br')) {
    body = body.replace(/\n/g, '<br>');
  }

  return body;
}

// Send a single email via Resend API
export async function sendEmail({ to, subject, htmlBody, textBody }) {
  const fromEmail = process.env.RESEND_SENDER_EMAIL || process.env.GMAIL_SENDER_EMAIL;
  const fromName = process.env.RESEND_SENDER_NAME || process.env.GMAIL_SENDER_NAME;
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  // Strip HTML for plain text fallback if not provided
  const plainText = textBody || htmlBody.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

 const { data, error } = await resend.emails.send({
    from,
    to: [to],
    subject,
    html: htmlBody,
    text: plainText,
    reply_to: fromEmail,
  });

  if (error) {
    throw new Error(error.message || JSON.stringify(error));
  }

  return {
    messageId: data.id,
    threadId: null, // Resend doesn't have threadId concept; kept for API compatibility
  };
}

// Send a campaign: personalized emails to a list of recipients
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
