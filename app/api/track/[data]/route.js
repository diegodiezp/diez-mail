import { NextResponse } from 'next/server';
import { logEmailEvent } from '@/lib/airtable';
import { decodeTrackingData } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(request, { params }) {
  const { data } = params;
  const trackingData = decodeTrackingData(data);

  if (trackingData) {
    // Extract device/client info from headers
    const userAgent = request.headers.get('user-agent') || '';
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';

    // Determine device type from user agent
    let device = 'Unknown';
    if (/mobile|iphone|android/i.test(userAgent)) device = 'Mobile';
    else if (/ipad|tablet/i.test(userAgent)) device = 'Tablet';
    else if (/mac|windows|linux/i.test(userAgent)) device = 'Computer';

    // Log the open event asynchronously (don't block the pixel response)
    logEmailEvent({
      'Event ID': `open-${trackingData.tid}-${Date.now()}`,
      'Tracking ID': trackingData.tid,
      'Recipient Email': trackingData.email,
      Campaign: [trackingData.cid],
      'Campaign ID': trackingData.cid,
      'Event Type': 'Open',
      Timestamp: new Date().toISOString(),
      Device: device,
      'User Agent': userAgent.slice(0, 500),
      'IP Address': ip,
    }).catch((err) => console.error('Failed to log open event:', err));
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
