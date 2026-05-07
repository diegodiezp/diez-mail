import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { subject, htmlBody, textBody, testEmail } = body;

    if (!subject || !htmlBody || !testEmail) {
      return NextResponse.json(
        { error: 'Missing required fields: subject, htmlBody, testEmail' },
        { status: 400 }
      );
    }

    const result = await sendEmail({
      to: testEmail,
      subject: `[TEST] ${subject}`,
      htmlBody,
      textBody,
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      sentTo: testEmail,
    });
  } catch (error) {
    console.error('Test email error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send test email' },
      { status: 500 }
    );
  }
}
