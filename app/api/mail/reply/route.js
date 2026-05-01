import { NextResponse } from 'next/server';
import { sendTrackedReply } from '@/lib/gmail-read';
import { createCampaign, updateCampaign, logEmailEvent } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { threadId, to, subject, htmlBody, recipientName } = body;

    if (!threadId || !to || !subject || !htmlBody) {
      return NextResponse.json(
        { error: 'Missing required fields: threadId, to, subject, htmlBody' },
        { status: 400 }
      );
    }

    // Create a single-recipient "campaign" for tracking purposes
    // This reuses the existing tracking infrastructure without schema changes
    const campaign = await createCampaign({
      Name: `Reply: ${subject.replace(/^Re:\s*/i, '').slice(0, 80)}`,
      Subject: subject,
      'Body Template': htmlBody,
      Status: 'Sending',
    });

    // Send the tracked reply
    const result = await sendTrackedReply({
      threadId,
      to,
      subject,
      htmlBody,
      campaignId: campaign.id,
      recipientEmail: to,
    });

    // Log the send event
    await logEmailEvent({
      'Event ID': `sent-${result.trackingId}`,
      'Tracking ID': result.trackingId,
      'Recipient Email': to,
      Campaign: [campaign.id],
      'Event Type': 'Sent',
      Timestamp: new Date().toISOString(),
      'Gmail Message ID': result.messageId,
    });

    // Update campaign status
    await updateCampaign(campaign.id, {
      Status: 'Sent',
      'Sent Count': 1,
      'Failed Count': 0,
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
      campaignId: campaign.id,
      trackingId: result.trackingId,
    });
  } catch (error) {
    console.error('Reply error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
