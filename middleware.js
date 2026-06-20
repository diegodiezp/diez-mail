import { NextResponse } from 'next/server';

// Middleware runs on the Edge runtime, where Node's crypto module is not
// available. So we compute the same HMAC using the Web Crypto API instead.
// IMPORTANT: this must produce the identical hex string as deriveAuthToken()
// in app/api/auth/route.js, or every login will bounce back to /login.
let _cachedToken = null;

async function deriveAuthToken() {
  if (_cachedToken) return _cachedToken;

  const secret = process.env.TRACKING_SECRET || 'default-secret';
  const password = process.env.APP_PASSWORD || '';

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(password)
  );

  _cachedToken = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return _cachedToken;
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Public: login page and login API
  if (pathname === '/login' || pathname === '/api/auth') {
    return NextResponse.next();
  }

  // Public: tracking endpoints (called by email clients, not users)
  if (pathname.startsWith('/api/track')) {
    return NextResponse.next();
  }

  // Public: engagement endpoint (called by viewing rooms via sendBeacon)
  if (pathname.startsWith('/api/ev')) {
    return NextResponse.next();
  }

  // Public at this layer: cron route does its own CRON_SECRET Bearer check
  if (pathname.startsWith('/api/cron')) {
    return NextResponse.next();
  }
  
// Public: newsletter signup (called from the public form)
if (pathname.startsWith('/api/newsletter')) {
  return NextResponse.next();
}
  // Everything else requires the auth cookie with the derived token
  const authCookie = request.cookies.get('diez-mail-auth');
  const expected = await deriveAuthToken();

  if (!authCookie || authCookie.value !== expected) {
    if (!pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)'],
};
