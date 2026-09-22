import { NextResponse } from 'next/server';
import { getPersonByEmail } from '@/lib/airtable';
import { decodeTrackingData } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

// Receives active-time heartbeats from rooms.diez.gallery. Unlike /api/ev,
// which creates one row per event, this keeps ONE Email Events row per
// viewing-room session and updates its Active Seconds (upsert on Session ID).
// "Room Heartbeat" is not in lib/scoring.js POINTS, so it never affects the
// engagement score; it only feeds the Active Seconds rollups on People.

const ALLOWED_ORIGIN = 'https://rooms.diez.gallery';
const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SECONDS = 3600;

// Tracking token -> Person record id, cached while the function stays warm so
// a 5-minute visit costs one People lookup instead of twenty.
const personCache = new Map();

async function resolvePersonId(email) {
  if (personCache.has(email)) return personCache.get(email);
  const person = await getPersonByEmail(email).catch(() => null);
  const id = person?.id || null;
  personCache.set(email, id);
  return id;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request) {
  let body;
  try {
    // Sent as text/plain by sendBeacon to avoid a CORS preflight
    body = JSON.parse(await request.text());
  } catch {
    return new NextResponse(null, { status: 400, headers: corsHeaders });
  }

  const { t, session_id, active_seconds } = body || {};
  if (!t) return new NextResponse(null, { status: 204, headers: corsHeaders });

  if (
    !UUID_RE.test(session_id || '') ||
    !Number.isInteger(active_seconds) ||
    active_seconds < 0 ||
    active_seconds > MAX_SECONDS
  ) {
    return new NextResponse(null, { status: 400, headers: corsHeaders });
  }

  const trackingData = decodeTrackingData(t);
  if (!trackingData?.tid || !trackingData?.cid || !trackingData?.email) {
    return new NextResponse(null, { status: 400, headers: corsHeaders });
  }

  const email = String(trackingData.email).trim();
  const personId = await resolvePersonId(email);

  const fields = {
    'Event ID': `hb-${session_id}`,
    'Session ID': session_id,
    'Event Type': 'Room Heartbeat',
    'Active Seconds': active_seconds,
    Timestamp: new Date().toISOString(), // = last heartbeat received
    'Tracking ID': trackingData.tid,
    'Recipient Email': email,
    'Campaign ID': trackingData.cid,
    Campaign: [trackingData.cid],
  };
  // Person link is what feeds the Total/Max Active Seconds rollups on People
  if (personId) fields.Person = [personId];

  try {
    const res = await fetch(
      `https://api.airtable.com/v0/${process.env.AIRTABLE_BASE_ID}/${encodeURIComponent('Email Events')}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${process.env.AIRTABLE_PAT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          performUpsert: { fieldsToMergeOn: ['Session ID'] },
          typecast: true, // creates the "Room Heartbeat" option on first use
          records: [{ fields }],
        }),
      }
    );
    if (!res.ok) console.error('Heartbeat upsert failed:', res.status, await res.text());
  } catch (err) {
    console.error('Heartbeat upsert error:', err);
  }

  return new NextResponse(null, { status: 204, headers: corsHeaders });
}
