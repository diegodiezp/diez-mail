import { NextResponse } from 'next/server';
import {
  base, TABLES, getPersonByEmail, getOrCreateCampaignByName, createRecords, newsletterToken,
} from '@/lib/airtable';
import { sendCampaign, generateTrackingId, encodeTrackingData } from '@/lib/resend';
import { SIGNATURE_HTML } from '@/lib/signature';
import { alertBoothLead } from '@/lib/alerts';

export const dynamic = 'force-dynamic';

// Booth QR lead capture.
//
// A viewing room opened with ?via=booth (the QR on the fair stand) hides
// prices and the PDF until the visitor leaves an email. The room posts it
// here. This route:
//   1. finds or creates the contact in People (Type "Booth QR"),
//   2. emails them the viewing room link (Resend, same sender as campaigns),
//   3. logs that email as a "Sent" event in a per-room campaign
//      ("Booth QR · <slug>"), so the lead shows up in Campaigns and in the
//      follow-up queue like any campaign recipient,
//   4. returns the same tracking token (t) a campaign link carries. The room
//      then unlocks and every Viewing Room Open / Artwork View / PDF download
//      / time spent is logged against this person.
//
// Newsletter consent is separate and optional (GDPR): only when the visitor
// ticks the box are they added to the newsletter list (Contacts table in the
// inventory base, same place as the public newsletter form).
//
// Public route: lives under /api/ev, which middleware.js already leaves open.

const ALLOWED_ORIGIN = 'https://rooms.diez.gallery';
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const LEAD_TYPE = 'Booth QR';
const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[^\s@<>()[\],;:"]{2,}$/;
const SLUG_RE = /^[A-Za-z0-9_-]{1,80}$/;

// Fair Wi-Fi puts hundreds of visitors behind one IP, so this only stops a
// script hammering the form, never a busy booth.
const RATE_LIMIT_MAX = 40;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const hitsByIp = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const entry = hitsByIp.get(ip);
  if (!entry || now - entry.start > RATE_LIMIT_WINDOW_MS) {
    hitsByIp.set(ip, { start: now, count: 1 });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT_MAX;
}

function clean(value, max) {
  return String(value || '').replace(/[<>\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}



function emailBody({ firstName, roomTitle, roomUrl }) {
  const hello = firstName ? `Hello ${escapeHtml(firstName)},` : 'Hello,';
  return [
    `<p>${hello}</p>`,
    `<p>Thank you for visiting our booth. Here is the viewing room with prices, so you have it at hand after the fair:</p>`,
    `<p><a href="${roomUrl}" style="color:#1a1a1a;text-decoration:underline;">${escapeHtml(roomTitle)}</a></p>`,
    `<p>You can also download the PDF from the room. If you have any questions about the works, just reply to this email.</p>`,
    `<p>Best,<br>Diego</p>`,
    `<br/>${SIGNATURE_HTML}`,
  ].join('');
}

async function addToNewsletter({ email, firstName, lastName, slug }) {
  const baseId = process.env.NEWSLETTER_BASE_ID || 'appkTmFvjmDLOQS4p';
  const table = process.env.NEWSLETTER_TABLE || 'Contacts';
  const fields = { Email: email, Notes: `Booth QR (${slug}), newsletter consent ${new Date().toISOString().slice(0, 10)}` };
  if (firstName) fields.Name = firstName;
  if (lastName) fields.Surname = lastName;
  const res = await fetch(`https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${newsletterToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ records: [{ fields }], typecast: true }),
  });
  if (!res.ok) throw new Error(`newsletter ${res.status}: ${await res.text()}`);
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request) {
  const json = (body, status = 200) => NextResponse.json(body, { status, headers: corsHeaders });

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  if (rateLimited(ip)) return json({ error: 'Too many requests' }, 429);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }

  // Honeypot: real visitors never see this field. Answer like a success so
  // bots don't learn, but store nothing and send nothing.
  if (body?.website) return json({ ok: true });

  const email = String(body?.email || '').trim();
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return json({ error: 'Please enter a valid email address.' }, 400);
  }
  const slug = String(body?.slug || '');
  if (!SLUG_RE.test(slug)) return json({ error: 'Invalid room' }, 400);

  const name = clean(body?.name, 80);
  const [firstName = '', ...rest] = name ? name.split(' ') : [];
  const lastName = rest.join(' ');
  const roomTitle = clean(body?.room, 120) || 'Viewing room';
  const newsletter = body?.newsletter === true;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const [campaign, existing] = await Promise.all([
      getOrCreateCampaignByName(`Booth QR · ${slug}`, {
        Subject: `${roomTitle} | diez`,
        Status: 'Sent',
      }),
      getPersonByEmail(email),
    ]);

    // Contact in People. New: created with the name given. Existing: name
    // and data untouched, only the "Booth QR" tag and a note are added.
    let person = existing;
    const note = `Left email at booth QR (${slug}) on ${today}${newsletter ? ', newsletter: yes' : ''}.`;
    if (!person) {
      const created = await base(TABLES.people).create(
        {
          Email: email,
          ...(firstName && { 'First Name': firstName }),
          ...(lastName && { 'Last Name': lastName }),
          Type: [LEAD_TYPE],
          Pipeline: 'Prospect',
          Notes: note,
        },
        { typecast: true }
      );
      person = { id: created.id, ...created.fields };
    } else {
      const types = Array.isArray(person.Type) ? person.Type : [];
      const notes = person.Notes ? `${person.Notes}\n${note}` : note;
      await base(TABLES.people)
        .update(person.id, { Type: types.includes(LEAD_TYPE) ? types : [...types, LEAD_TYPE], Notes: notes }, { typecast: true })
        .catch((err) => console.error('[lead] could not tag existing person:', err.message));
    }

    const recipient = {
      id: person.id,
      email,
      name: person['First Name'] || firstName,
      surname: person['Last Name'] || lastName,
    };

    // Email them the room. sendCampaign adds the open pixel, wraps the link
    // (click tracking + t= on the room URL) and returns the tracking ID, which
    // is reused for the token handed back to the browser so the email and
    // the booth visit are one and the same thread.
    let trackingId;
    let sendResult = null;
    if (!person['Do Not Email']) {
      const roomUrl = `https://rooms.diez.gallery/${encodeURIComponent(slug)}`;
      const [result] = await sendCampaign({
        campaignId: campaign.id,
        subject: `${roomTitle} | diez`,
        bodyTemplate: emailBody({ firstName: recipient.name, roomTitle, roomUrl }),
        recipients: [recipient],
        delayMs: 0,
      });
      sendResult = result;
      trackingId = result?.trackingId;
    }
    if (!trackingId) trackingId = generateTrackingId(campaign.id, email);

    const followUps = [];
    if (sendResult) {
      followUps.push(
        createRecords(TABLES.emailEvents, [{
          // "lead-" prefix: lib/botDetection.js knows these visitors browse
          // the room right away, so it doesn't treat that as a scanner.
          'Event ID': `lead-${trackingId}`,
          'Tracking ID': trackingId,
          'Recipient Email': email,
          Campaign: [campaign.id],
          'Campaign ID': campaign.id,
          Person: [person.id],
          'Event Type': sendResult.status === 'sent' ? 'Sent' : 'Failed',
          Timestamp: new Date().toISOString(),
          'Gmail Message ID': sendResult.messageId || '',
          'Error Message': sendResult.error || '',
        }]).catch((err) => console.error('[lead] could not log Sent event:', err.message))
      );
    }
    if (newsletter) {
      followUps.push(
        addToNewsletter({ email, firstName, lastName, slug })
          .catch((err) => console.error('[lead] newsletter signup failed:', err.message))
      );
    }
    // Push to Diego's phone (bounded to a few seconds, never throws)
    followUps.push(alertBoothLead({ name, email, room: roomTitle }));
    await Promise.all(followUps);

    const t = encodeTrackingData(trackingId, campaign.id, email);
    return json({ ok: true, t, emailed: sendResult?.status === 'sent' });
  } catch (error) {
    console.error('[lead] error:', error);
    // The room unlocks anyway on a server error (see viewing-room.jsx), so a
    // visitor at the booth never gets stuck because of us.
    return json({ error: 'Something went wrong' }, 500);
  }
}
