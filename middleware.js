import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow the login page and login API without auth
  if (pathname === '/login' || pathname === '/api/auth') {
    return NextResponse.next();
  }

  // Allow tracking endpoints (pixels and click redirects) without auth
  // These are called by email clients, not by users
  if (pathname.startsWith('/api/track')) {
    return NextResponse.next();
  }

  // Allow engagement endpoint without auth
  // Called by viewing rooms via sendBeacon from a different origin
  if (pathname.startsWith('/api/engagement')) {
    return NextResponse.next();
  }

  // Check for auth cookie
  const authCookie = request.cookies.get('diez-mail-auth');

  if (!authCookie || authCookie.value !== process.env.APP_PASSWORD) {
    // Redirect to login page for page requests
    if (!pathname.startsWith('/api/')) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    // Return 401 for API requests
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js).*)'],
};
