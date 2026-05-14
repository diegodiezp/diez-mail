import { NextResponse } from 'next/server';
import { createCampaign, updateCampaign, getCampaign, logEmailEvent, getAlreadySentEmails } from '@/lib/airtable';
import { sendCampaign } from '@/lib/resend';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      subject,
      bodyTemplate,
      recipients,
      campaignName,
      pdfLink,
      customBodies,      // Optional: { [personId]: "edited HTML" }
      campaignId: existingCampaignId,  // Optional: send to an existing campaign
      scheduledFor,      // Optional: ISO date string — schedule instead of send now
    } = body;

    if (!subject || !bodyTemplate || !recipients?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: subject, bodyTemplate, recipients' },
        { status: 400 }
      );
    }

    // ── Scheduled send: save campaign and bail out ────────────────────────────
    if (scheduledFor) {
      const campaignFields = {
        Name: campaignName || subject,
        Subject: subject,
        'Body Template': bodyTemplate,
        Status: 'Scheduled',
        'Scheduled For': scheduledFor,
        ...(pdfLink && { 'PDF Link': pdfLink }),
        People: recipients.filter((r) => r.id).map((r) => r.id),
      };
      const campaign = await createCampaign(campaignFields);
      return NextResponse.json({ campaignId: campaign.id, scheduled: true, scheduledFor });
    }

    let campaign;
    let previousSentCount = 0;
    let previousFailedCount = 0;
    let actualRecipients = recipients;

    if (existingCampaignId) {
      // ── Incremental send: add recipients to an existing campaign ──
      campaign = await getCampaign(existingCampaignId);
      if (!campaign) {
        return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
      }

      // Keep existing counts so we can add to them
      previousSentCount = campaign['Sent Count'] || 0;
      previousFailedCount = campaign['Failed Count'] || 0;

      // Filter out people who already received this campaign
      const alreadySent = await getAlreadySentEmails(existingCampaignId);
      actualRecipients = recipients.filter((r) => !alreadySent.has(r.email));

      if (actualRecipients.length === 0) {
        return NextResponse.json(
          { error: 'All selected recipients have already received this campaign' },
          { status: 400 }
        );
      }

      // Mark as sending
      await updateCampaign(existingCampaignId, { Status: 'Sending' });
      campaign.id = existingCampaignId;
    } else {
      // ── New campaign ──
      const campaignFields = {
        Name: campaignName || subject,
        Subject: subject,
        'Body Template': bodyTemplate,
        Status: 'Sending',
      };

      if (pdfLink) {
        campaignFields['PDF Link'] = pdfLink;
      }

      campaign = await createCampaign(campaignFields);
    }

    // 2. Send emails (only to actualRecipients, which excludes already-sent for incremental)
    const results = await sendCampaign({
      campaignId: campaign.id,
      subject,
      bodyTemplate,
      recipients: actualRecipients,
      pdfLink: pdfLink || null,
      customBodies: customBodies || null,
      delayMs: 1500,
    });

    // 3. Log send events for each recipient
    const newSentCount = results.filter((r) => r.status === 'sent').length;
    const newFailedCount = results.filter((r) => r.status === 'failed').length;

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
      const recipient = actualRecipients.find((r) => r.email === result.email);
      if (recipient?.id) {
        eventFields.Person = [recipient.id];
      }

      await logEmailEvent(eventFields);
    }

    // 4. Update campaign status and accumulate counts
    const totalSent = previousSentCount + newSentCount;
    const totalFailed = previousFailedCount + newFailedCount;

    await updateCampaign(campaign.id, {
      Status: newFailedCount === 0 ? 'Sent' : 'Partial',
      'Sent Count': totalSent,
      'Failed Count': totalFailed,
    });

    // 5. Link new people to the campaign's People field
    //    We need to add the new person IDs to the existing linked records
    if (existingCampaignId) {
      const existingPeople = campaign.People || [];
      const newPeopleIds = actualRecipients
        .filter((r) => r.id && !existingPeople.includes(r.id))
        .map((r) => r.id);
      if (newPeopleIds.length > 0) {
        await updateCampaign(campaign.id, {
          People: [...existingPeople, ...newPeopleIds],
        });
      }
    }

    return NextResponse.json({
      campaignId: campaign.id,
      sent: newSentCount,
      failed: newFailedCount,
      totalSent,
      totalFailed,
      skipped: recipients.length - actualRecipients.length,
      results,
    });
  } catch (error) {
    console.error('Send campaign error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
