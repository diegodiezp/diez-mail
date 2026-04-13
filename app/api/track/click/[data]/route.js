import { NextResponse } from 'next/server';
import { logEmailEvent } from '@/lib/airtable';
import { decodeTrackingData } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  const { data } = params;
  const trackingData = decodeTrackingData(data);

  if (!trackingData || !trackingData.url) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Extract device info
  const userAgent = request.headers.get('user-agent') || '';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';

  let device = 'Unknown';
  if (/mobile|iphone|android/i.test(userAgent)) device = 'Mobile';
  else if (/ipad|tablet/i.test(userAgent)) device = 'Tablet';
  else if (/mac|windows|linux/i.test(userAgent)) device = 'Computer';

  // Log the click event asynchronously
  logEmailEvent({
    'Event ID': `click-${trackingData.tid}-${Date.now()}`,
    'Tracking ID': trackingData.tid,
    'Recipient Email': trackingData.email,
    Campaign: [trackingData.cid],
    'Event Type': 'Click',
    Timestamp: new Date().toISOString(),
    Device: device,
    'User Agent': userAgent.slice(0, 500),
    'IP Address': ip,
    'Clicked URL': trackingData.url,
  }).catch((err) => console.error('Failed to log click event:', err));

  // Redirect to the actual destination
  return NextResponse.redirect(trackingData.url);
}
