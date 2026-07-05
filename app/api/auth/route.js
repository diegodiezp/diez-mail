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

// Compare the submitted password to the real one without leaking timing
// info via early-exit string comparison. Hashing both sides first also
// sidesteps timingSafeEqual's requirement that both buffers be the same
// length, which a raw comparison of attacker-controlled input can't guarantee.
function passwordMatches(submitted) {
  const submittedHash = crypto.createHash('sha256').update(submitted || '').digest();
  const actualHash = crypto.createHash('sha256').update(process.env.APP_PASSWORD || '').digest();
  return crypto.timingSafeEqual(submittedHash, actualHash);
}

// In-memory per-IP rate limit: 5 failed attempts per 15-minute window. This
// resets on cold start, which only ever relaxes the limit, never blocks
// legitimate access, so it's an acceptable tradeoff for a single-password app.
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const attemptsByIp = new Map();

function getClientIp(request) {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0].trim() || 'unknown';
}

function getRateLimitState(ip) {
  const entry = attemptsByIp.get(ip);
  if (!entry || Date.now() - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    return { count: 0, windowStart: Date.now() };
  }
  return entry;
}

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const state = getRateLimitState(ip);

    if (state.count >= RATE_LIMIT_MAX_ATTEMPTS) {
      const retryAfterSeconds = Math.ceil(
        (state.windowStart + RATE_LIMIT_WINDOW_MS - Date.now()) / 1000
      );
      return NextResponse.json(
        { error: 'Too many attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.max(retryAfterSeconds, 1)) } }
      );
    }

    const { password } = await request.json();

    if (passwordMatches(password)) {
      attemptsByIp.delete(ip);

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

    attemptsByIp.set(ip, { count: state.count + 1, windowStart: state.windowStart });
    return NextResponse.json({ error: 'Wrong password' }, { status: 401 });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
