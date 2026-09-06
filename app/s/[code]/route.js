import { NextResponse } from 'next/server';
import { getShortLinkByCode, logEmailEvent } from '@/lib/airtable';
import { encodeTrackingData } from '@/lib/tracking';

export const dynamic = 'force-dynamic';

// Resolves a short manual-share link (generated from /links), logs a Click
// event exactly like an email-originated click, and, if the destination is
// a viewing room, hands it a fresh `t=` token so the room's own engagement
// tracking (Viewing Room Open / Artwork View / Inquire Click) attributes
// correctly to this contact, same as it would from an email campaign.
export async function GET(request, { params }) {
  const { code } = params;

  let link;
  try {
    link = await getShortLinkByCode(code);
  } catch (err) {
    console.error('Short link lookup error:', err);
    link = null;
  }

  if (!link || !link['Destination URL']) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  let destination;
  try {
    destination = new URL(link['Destination URL']);
    if (destination.protocol !== 'https:' && destination.protocol !== 'http:') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  } catch {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const campaignId = link.Campaign?.[0];
  const trackingId = link['Tracking ID'];
  const email = link['Recipient Email'];

  if (destination.hostname.includes('rooms.diez.gallery') && campaignId && trackingId && email) {
    const t = encodeTrackingData(trackingId, campaignId, email);
    destination.searchParams.set('t', t);
  }

  const userAgent = request.headers.get('user-agent') || '';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  let device = 'Unknown';
  if (/mobile|iphone|android/i.test(userAgent)) device = 'Mobile';
  else if (/ipad|tablet/i.test(userAgent)) device = 'Tablet';
  else if (/mac|windows|linux/i.test(userAgent)) device = 'Computer';

  const eventFields = {
    'Event ID': `click-${trackingId}-${Date.now()}`,
    'Tracking ID': trackingId,
    'Recipient Email': email,
    'Event Type': 'Click',
    Timestamp: new Date().toISOString(),
    Device: device,
    'User Agent': userAgent.slice(0, 500),
    'IP Address': ip,
    'Clicked URL': destination.toString(),
  };
  if (campaignId) {
    eventFields.Campaign = [campaignId];
    eventFields['Campaign ID'] = campaignId;
  }
  if (link.Person?.[0]) eventFields.Person = [link.Person[0]];

  logEmailEvent(eventFields).catch((err) =>
    console.error('Failed to log manual-link click event:', err)
  );

  return NextResponse.redirect(destination.toString());
}
