// lib/tracking.js
import crypto from 'crypto';

const TRACKING_SECRET = process.env.TRACKING_SECRET || 'default-secret';

export function generateTrackingId(campaignId, recipientEmail) {
  const data = `${campaignId}:${recipientEmail}:${Date.now()}`;
  return crypto.createHmac('sha256', TRACKING_SECRET).update(data).digest('hex').slice(0, 24);
}

function sign(payloadStr) {
  return crypto.createHmac('sha256', TRACKING_SECRET)
    .update(payloadStr)
    .digest('hex')
    .slice(0, 16);
}

// Encode tracking data WITH signature
export function encodeTrackingData(trackingId, campaignId, recipientEmail, destinationUrl = null) {
  const payload = { tid: trackingId, cid: campaignId, email: recipientEmail };
  if (destinationUrl) payload.url = destinationUrl;
  const payloadStr = JSON.stringify(payload);
  payload.sig = sign(payloadStr);
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

// Decode and verify. Returns null if tampered.
// Legacy tokens (sent before this change, no sig) are still accepted
// but flagged so you can phase them out later.
export function decodeTrackingData(encoded) {
  try {
    const json = Buffer.from(encoded, 'base64url').toString('utf-8');
    const data = JSON.parse(json);

    if (data.sig) {
      const { sig, ...payload } = data;
      const expected = sign(JSON.stringify(payload));
      if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
        return null; // tampered
      }
      return payload;
    }

    // Legacy unsigned token: accept for now (emails already sent).
    // Remove this branch in ~3 months once old campaigns go quiet.
    data._legacy = true;
    return data;
  } catch {
    return null;
  }
}

export function buildTrackingPixel(trackingId, campaignId, recipientEmail) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const data = encodeTrackingData(trackingId, campaignId, recipientEmail);
  return `<img src="${appUrl}/api/track/${data}" width="1" height="1" style="display:none" alt="" />`;
}

export function buildTrackedLink(trackingId, campaignId, recipientEmail, destinationUrl) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  const data = encodeTrackingData(trackingId, campaignId, recipientEmail, destinationUrl);
  return `${appUrl}/api/track/click/${data}`;
}

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

  let result = html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (match, url) => {
      if (url.startsWith(appUrl)) return match;
      const destination = buildDestination(url);
      const trackedUrl = buildTrackedLink(trackingId, campaignId, recipientEmail, destination);
      return `href="${trackedUrl}"`;
    }
  );

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
