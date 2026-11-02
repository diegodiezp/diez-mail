import { NextResponse } from 'next/server';
import { sendEmail, renderEmailHtml, wrapDocument, personalizeBody } from '@/lib/resend';

export const dynamic = 'force-dynamic';

// 2.0: a test goes through the same sender (Resend) and the same rendering
// as the real campaign, personalized for a sample recipient, so what lands
// in your inbox is what they will get (only tracking is left out).
export async function POST(request) {
  try {
    const { subject, htmlBody, testEmail, sample, pdfLink, pdfLabel } = await request.json();
    if (!subject || !htmlBody || !testEmail) {
      return NextResponse.json({ error: 'Missing required fields: subject, htmlBody, testEmail' }, { status: 400 });
    }
    const recipient = {
      name: sample?.name || '',
      surname: sample?.surname || '',
      email: sample?.email || testEmail,
      city: sample?.city || '',
      company: sample?.company || '',
      ...(pdfLink && { _pdfLink: pdfLink, _pdfLabel: pdfLabel }),
    };
    const html = wrapDocument(renderEmailHtml({ body: null, bodyTemplate: htmlBody, recipient }));
    const result = await sendEmail({
      to: testEmail,
      subject: `[TEST] ${personalizeBody(subject, recipient)}`,
      htmlBody: html,
    });
    return NextResponse.json({ success: true, messageId: result.messageId, sentTo: testEmail });
  } catch (error) {
    console.error('Test email error:', error);
    return NextResponse.json({ error: error.message || 'Failed to send test email' }, { status: 500 });
  }
}
