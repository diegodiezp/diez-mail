import { NextResponse } from 'next/server';
import { createCampaign, updateCampaign, logEmailEvent } from '@/lib/airtable';
import { sendCampaign } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const { subject, bodyTemplate, recipients, campaignName, pdfLink } = body;

    if (!subject || !bodyTemplate || !recipients?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: subject, bodyTemplate, recipients' },
        { status: 400 }
      );
    }

    // 1. Create campaign record in Airtable
    const campaignFields = {
      Name: campaignName || subject,
      Subject: subject,
      'Body Template': bodyTemplate,
      Status: 'Sending',
    };

    // Store the PDF link on the campaign if provided
    if (pdfLink) {
      campaignFields['PDF Link'] = pdfLink;
    }

    const campaign = await createCampaign(campaignFields);

    // 2. Send emails
    const results = await sendCampaign({
      campaignId: campaign.id,
      subject,
      bodyTemplate,
      recipients,
      pdfLink: pdfLink || null,
      delayMs: 1500,
    });

    // 3. Log send events for each recipient
    const sentCount = results.filter((r) => r.status === 'sent').length;
    const failedCount = results.filter((r) => r.status === 'failed').length;

    for (const result of results) {
      const eventFields = {
        'Event ID': `sent-${result.trackingId || Date.now()}`,
        'Tracking ID': result.trackingId || '',
        'Recipient Email': result.email,
        Campaign: [campaign.id],
        'Event Type': result.status === 'sent' ? 'Sent' : 'Failed',
        Timestamp: new Date().toISOString(),
        'Gmail Message ID': result.messageId || '',
        'Error Message': result.error || '',
      };

      // Link to Person record if we have their Airtable ID
      const recipient = recipients.find((r) => r.email === result.email);
      if (recipient?.id) {
        eventFields.Person = [recipient.id];
      }

      await logEmailEvent(eventFields);
    }

    // 4. Update campaign status
    await updateCampaign(campaign.id, {
      Status: failedCount === 0 ? 'Sent' : 'Partial',
      'Sent Count': sentCount,
      'Failed Count': failedCount,
    });

    return NextResponse.json({
      campaignId: campaign.id,
      sent: sentCount,
      failed: failedCount,
      results,
    });
  } catch (error) {
    console.error('Send campaign error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
