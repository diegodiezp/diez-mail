import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { logEmailEvent, getPersonByEmail, updatePerson } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

// Resend signs webhooks with Svix. Reject anything older than this to
// prevent a captured payload being replayed later.
const MAX_TIMESTAMP_AGE_SECONDS = 5 * 60;

// Verify the Svix signature by hand (no svix package, per the zero-dependency
// rule). Signed content is `${svix-id}.${svix-timestamp}.${rawBody}`; the
// secret is base64-encoded after its `whsec_` prefix; the signature header
// holds one or more space-separated `v1,<base64 sig>` entries, any of which
// may match (for secret rotation).
function verifySignature(rawBody, headers) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;

  const svixId = headers.get('svix-id');
  const svixTimestamp = headers.get('svix-timestamp');
  const svixSignature = headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) return false;

  const timestamp = parseInt(svixTimestamp, 10);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - timestamp) > MAX_TIMESTAMP_AGE_SECONDS) return false;

  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const signedContent = `${svixId}.${svixTimestamp}.${rawBody}`;
  const expectedSig = crypto
    .createHmac('sha256', secretBytes)
    .update(signedContent)
    .digest('base64');
  const expectedBuf = Buffer.from(expectedSig, 'base64');

  for (const entry of svixSignature.split(' ')) {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) continue;

    let sigBuf;
    try {
      sigBuf = Buffer.from(sig, 'base64');
    } catch {
      continue;
    }
    if (sigBuf.length !== expectedBuf.length) continue;
    if (crypto.timingSafeEqual(sigBuf, expectedBuf)) return true;
  }

  return false;
}

export async function POST(request) {
  // Read raw bytes before parsing: the signature covers the exact body text.
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, data } = payload;
  if (type !== 'email.bounced' && type !== 'email.complained') {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const email = data?.to?.[0];
  if (!email) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const eventType = type === 'email.bounced' ? 'Bounced' : 'Complained';

  await logEmailEvent({
    'Event ID': `${type}-${data.email_id}`,
    'Recipient Email': email,
    'Event Type': eventType,
    Timestamp: new Date().toISOString(),
  });

  // Soft/transient bounces (mailbox full, greylisting) are logged but don't
  // suppress the contact; only hard bounces and complaints do.
  const isSoftBounce = type === 'email.bounced' && data?.bounce?.type === 'Transient';

  if (!isSoftBounce) {
    try {
      const person = await getPersonByEmail(email);
      if (person) {
        await updatePerson(person.id, { 'Do Not Email': true });
      }
    } catch (error) {
      console.error('Failed to suppress contact after bounce/complaint:', error);
    }
  }

  return NextResponse.json({ ok: true });
}
