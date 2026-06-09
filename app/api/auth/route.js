import { NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Derive a token from the password + secret. This is what goes in the
// cookie instead of the raw password. Must produce the SAME value as
// the Web Crypto version in middleware.js.
function deriveAuthToken() {
  return crypto
    .createHmac('sha256', process.env.TRACKING_SECRET || 'default-secret')
    .update(process.env.APP_PASSWORD || '')
    .digest('hex');
}

export async function POST(request) {
  try {
    const { password } = await request.json();

    if (password === process.env.APP_PASSWORD) {
      const response = NextResponse.json({ success: true });

      // Cookie lasts 30 days. httpOnly means client-side JS can never
      // read it, so even an XSS can't steal the token directly.
      response.cookies.set('diez-mail-auth', deriveAuthToken(), {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 30, // 30 days
        path: '/',
      });

      return response;
    }

    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
