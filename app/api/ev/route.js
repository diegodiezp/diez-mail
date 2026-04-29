import { NextResponse } from 'next/server';
import { logEmailEvent } from '@/lib/airtable';
import { decodeTrackingData } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

const ALLOWED_ORIGIN = 'https://rooms.diez.gallery';

const ALLOWED_EVENT_TYPES = new Set([
  'Viewing Room Open',
  'Artwork View',
  'Inquire Click',
]);

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders });
  }

  const { t, event_type, artwork_id, artwork_title } = body || {};

  // Silent rejection if no tracking token: this means an anonymous visitor
  // (someone who reached the viewing room via Instagram, forward, etc.).
  // We intentionally do NOT log these. Return 204 so the client moves on.
  if (!t) {
    return new NextResponse(null, { status: 204, headers: corsHeaders });
  }

  if (!event_type || !ALLOWED_EVENT_TYPES.has(event_type)) {
    return NextResponse.json(
      { error: 'Invalid event_type' },
      { status: 400, headers: corsHeaders }
    );
  }

  const trackingData = decodeTrackingData(t);
  if (!trackingData || !trackingData.tid || !trackingData.cid || !trackingData.email) {
    return NextResponse.json(
      { error: 'Invalid tracking token' },
      { status: 400, headers: corsHeaders }
    );
  }

  // Extract device info (best effort, viewer comes from the browser)
  const userAgent = request.headers.get('user-agent') || '';
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';

  let device = 'Unknown';
  if (/mobile|iphone|android/i.test(userAgent)) device = 'Mobile';
  else if (/ipad|tablet/i.test(userAgent)) device = 'Tablet';
  else if (/mac|windows|linux/i.test(userAgent)) device = 'Computer';

  const eventFields = {
    'Event ID': `engage-${trackingData.tid}-${Date.now()}`,
    'Tracking ID': trackingData.tid,
    'Recipient Email': trackingData.email,
    Campaign: [trackingData.cid],
    'Event Type': event_type,
    Timestamp: new Date().toISOString(),
    Device: device,
    'User Agent': userAgent.slice(0, 500),
    'IP Address': ip,
  };

  // Attach artwork info when relevant (Artwork View, Inquire Click)
  if (artwork_id) eventFields['Artwork ID'] = String(artwork_id).slice(0, 50);
  if (artwork_title) eventFields['Artwork Title'] = String(artwork_title).slice(0, 200);

  // Fire and forget. We always return 204 quickly so sendBeacon doesn't block
  // navigation in the browser. If logging fails, we log to console only.
  logEmailEvent(eventFields).catch((err) =>
    console.error('Failed to log engagement event:', err)
  );

  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
