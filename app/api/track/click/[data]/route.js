import { NextResponse } from 'next/server';
import { logEmailEvent } from '@/lib/airtable';
import { decodeTrackingData } from '@/lib/tracking';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data } = params;
  const trackingData = decodeTrackingData(data);

  // No valid token or no destination: send to the app home, never error out
  if (!trackingData || !trackingData.url) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Validate the destination before redirecting.
  // Only http(s) URLs are allowed. This blocks javascript:, data:, file:
  // and other schemes that could turn this endpoint into an attack vector.
  let destination;
  try {
    destination = new URL(trackingData.url);
    if (destination.protocol !== 'https:' && destination.protocol !== 'http:') {
      return NextResponse.redirect(new URL('/', request.url));
    }
  } catch {
    // trackingData.url wasn't a parseable URL at all
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Extract device info
  const userAgent = request.headers.get('user-agent') || '';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';

  let device = 'Unknown';
  if (/mobile|iphone|android/i.test(userAgent)) device = 'Mobile';
  else if (/ipad|tablet/i.test(userAgent)) device = 'Tablet';
  else if (/mac|windows|linux/i.test(userAgent)) device = 'Computer';

  // Log the click event asynchronously (don't block the redirect)
  logEmailEvent({
    'Event ID': `click-${trackingData.tid}-${Date.now()}`,
    'Tracking ID': trackingData.tid,
    'Recipient Email': trackingData.email,
    Campaign: [trackingData.cid],
    'Campaign ID': trackingData.cid,
    'Event Type': 'Click',
    Timestamp: new Date().toISOString(),
    Device: device,
    'User Agent': userAgent.slice(0, 500),
    'IP Address': ip,
    'Clicked URL': trackingData.url,
  }).catch((err) => console.error('Failed to log click event:', err));

  // Redirect to the validated destination
  return NextResponse.redirect(destination.toString());
}
