// In-memory per-IP rate limit: 3 signups per IP per hour. Resets on cold
// start, which only ever relaxes the limit, so that's an acceptable tradeoff.
const RATE_LIMIT_MAX_SIGNUPS = 3;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const signupsByIp = new Map();

function getClientIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0].trim() || 'unknown';
}

function getRateLimitState(ip) {
  const entry = signupsByIp.get(ip);
  if (!entry || Date.now() - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    return { count: 0, windowStart: Date.now() };
  }
  return entry;
}

// Basic length caps so a scripted flood can't stuff huge junk payloads into
// Airtable fields. Email is capped to the RFC 5321 max; everything else is
// free text, so a generous but bounded cap.
const MAX_EMAIL_LENGTH = 254;
const MAX_FIELD_LENGTH = 200;

function withinLength(value, max) {
  return typeof value !== 'string' || value.length <= max;
}

export async function POST(request) {
  const ip = getClientIp(request);
  const state = getRateLimitState(ip);

  if (state.count >= RATE_LIMIT_MAX_SIGNUPS) {
    const retryAfterSeconds = Math.ceil(
      (state.windowStart + RATE_LIMIT_WINDOW_MS - Date.now()) / 1000
    );
    return Response.json(
      { error: 'Too many signups. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.max(retryAfterSeconds, 1)) } }
    );
  }

  const body = await request.json();

  const { name, surname, email, phone, city, interest, website } = body;

  // Honeypot: a hidden field real users never see or fill. Bots that
  // autofill every field trip it; respond as if it succeeded so they don't
  // learn to skip it, but don't write anything.
  if (website) {
    return Response.json({ ok: true });
  }

  if (!email || !email.includes('@') || !withinLength(email, MAX_EMAIL_LENGTH)) {
    return Response.json({ error: 'Invalid email' }, { status: 400 });
  }

  for (const field of [name, surname, phone, city, interest]) {
    if (!withinLength(field, MAX_FIELD_LENGTH)) {
      return Response.json({ error: 'Field too long' }, { status: 400 });
    }
  }

  signupsByIp.set(ip, { count: state.count + 1, windowStart: state.windowStart });

  const fields = { Email: email };
  if (name)     fields['Name']         = name;
  if (surname)  fields['Surname']      = surname;
  if (phone)    fields['Phone Number'] = phone;
  if (city)     fields['City']         = city;
  if (interest) fields['Notes']        = interest;

  const baseId = process.env.NEWSLETTER_BASE_ID || 'appkTmFvjmDLOQS4p';
  const table = process.env.NEWSLETTER_TABLE || 'Contacts';

  const res = await fetch(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.AIRTABLE_PAT}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        records: [{ fields }],
        typecast: true,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.json();
    return Response.json({ error: err }, { status: 500 });
  }

  return Response.json({ ok: true });
}
