import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const { password } = await request.json();

    if (password === process.env.APP_PASSWORD) {
      const response = NextResponse.json({ success: true });

      // Set cookie that lasts 30 days
      response.cookies.set('diez-mail-auth', password, {
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
