// lib/resend.js
// Sending via Resend. All tracking helpers live in lib/tracking.js
// and are re-exported here so existing imports keep working.

import { Resend } from 'resend';
import {
  generateTrackingId,
  encodeTrackingData,
  decodeTrackingData,
  buildTrackingPixel,
  buildTrackedLink,
  wrapLinksWithTracking,
  personalizeBody,
} from './tracking';

// Re-export so routes importing from '@/lib/resend' don't break
export {
  generateTrackingId,
  encodeTrackingData,
  decodeTrackingData,
  buildTrackingPixel,
  buildTrackedLink,
  wrapLinksWithTracking,
  personalizeBody,
};

// Initialize Resend client
const resend = new Resend(process.env.RESEND_API_KEY);

// Normaliza "a@x.com, b@y.com" (o un array) en un array de emails limpios.
// Devuelve undefined si no hay nada, para no mandar campos vacios a Resend.
function toEmailArray(v) {
  if (Array.isArray(v)) {
    const arr = v.filter(Boolean);
    return arr.length ? arr : undefined;
  }
  if (typeof v === 'string' && v.trim()) {
    const arr = v.split(',').map((s) => s.trim()).filter(Boolean);
    return arr.length ? arr : undefined;
  }
  return undefined;
}

// Send a single email via Resend API
export async function sendEmail({ to, subject, htmlBody, textBody, cc, bcc }) {
  const fromEmail = process.env.RESEND_SENDER_EMAIL || process.env.GMAIL_SENDER_EMAIL;
  const fromName = process.env.RESEND_SENDER_NAME || process.env.GMAIL_SENDER_NAME;
  const from = fromName ? `${fromName} <${fromEmail}>` : fromEmail;

  // Strip HTML for plain text fallback if not provided
  const plainText = textBody || htmlBody.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

  const ccList = toEmailArray(cc);
  const bccList = toEmailArray(bcc);

  const { data, error } = await resend.emails.send({
    from,
    to: [to],
    ...(ccList && { cc: ccList }),
    ...(bccList && { bcc: bccList }),
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
// customBodies is an optional map: { [personId]: "edited HTML body" }
// If a recipient has a custom body, it's used AS-IS (merge tags already
// resolved by the frontend). Otherwise the bodyTemplate path runs as before.
//
// cc / bcc (texto libre o array) se aplican a CADA correo del envio.
export async function sendCampaign({ campaignId, subject, bodyTemplate, recipients, pdfLink, customBodies, cc, bcc, delayMs = 1500 }) {
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
        cc,
        bcc,
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
