import { NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  getOrCreateManualCampaign,
  createShortLink,
  getRecentShortLinks,
  logEmailEvent,
} from '@/lib/airtable';
import { generateTrackingId } from '@/lib/tracking';

export const dynamic = 'force-dynamic';

// 5 random bytes -> 7-char base64url code. No new dependency needed.
function generateCode() {
  return crypto.randomBytes(5).toString('base64url');
}

export async function GET() {
  try {
    const links = await getRecentShortLinks(30);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    return NextResponse.json({
      links: links.map((l) => ({
        code: l.Code,
        url: `${appUrl}/s/${l.Code}`,
        destination: l['Destination URL'],
        label: l.Label || '',
        recipientEmail: l['Recipient Email'] || '',
        created: l.Created,
      })),
    });
  } catch (error) {
    console.error('List links error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { personId, email, name, destinationUrl, label } = body;

    if (!email || !destinationUrl) {
      return NextResponse.json(
        { error: 'Missing required fields: email, destinationUrl' },
        { status: 400 }
      );
    }

    // Validate the destination up front. The redirect route re-validates
    // too, but failing fast here means Diego sees the error immediately
    // instead of generating a dead link.
    try {
      const parsed = new URL(destinationUrl);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new Error('bad protocol');
      }
    } catch {
      return NextResponse.json(
        { error: 'destinationUrl must be a valid http(s) URL' },
        { status: 400 }
      );
    }

    const campaign = await getOrCreateManualCampaign();
    const trackingId = generateTrackingId(campaign.id, email);
    const code = generateCode();

    const linkFields = {
      Code: code,
      'Destination URL': destinationUrl,
      'Recipient Email': email,
      'Tracking ID': trackingId,
      Campaign: [campaign.id],
    };
    if (personId) linkFields.Person = [personId];
    if (label) linkFields.Label = label;

    await createShortLink(linkFields);

    // Log a "Sent" event so the funnel reads the same way an email send
    // would: Sent -> Click -> Viewing Room Open -> ...
    const sentFields = {
      'Event ID': `sent-${trackingId}`,
      'Tracking ID': trackingId,
      'Recipient Email': email,
      Campaign: [campaign.id],
      'Campaign ID': campaign.id,
      'Event Type': 'Sent',
      Timestamp: new Date().toISOString(),
    };
    if (personId) sentFields.Person = [personId];
    logEmailEvent(sentFields).catch((err) =>
      console.error('Failed to log manual-link Sent event:', err)
    );

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    return NextResponse.json({
      url: `${appUrl}/s/${code}`,
      code,
      trackingId,
    });
  } catch (error) {
    console.error('Generate link error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
