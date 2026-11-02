import { NextResponse } from 'next/server';
import { vapidKeys, saveSubscription, removeSubscription } from '@/lib/push';

export const dynamic = 'force-dynamic';

// GET: public VAPID key the browser needs to subscribe
export async function GET() {
  return NextResponse.json({ publicKey: vapidKeys().publicKey });
}

// POST: save this device's subscription
export async function POST(request) {
  try {
    const { subscription, device } = await request.json();
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 });
    }
    if (!/^https:\/\//.test(subscription.endpoint)) {
      return NextResponse.json({ error: 'Invalid endpoint' }, { status: 400 });
    }
    await saveSubscription(subscription, device || request.headers.get('user-agent') || '');
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE: forget this device
export async function DELETE(request) {
  try {
    const { endpoint } = await request.json();
    if (endpoint) await removeSubscription(endpoint);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
