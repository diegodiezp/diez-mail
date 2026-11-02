import { NextResponse } from 'next/server';
import { createCampaign, updateCampaign, getCampaign, getAlreadySentEmails, getSuppressedEmails, createRecords, normEmail } from '@/lib/airtable';
import { sendCampaign } from '@/lib/resend';

export const dynamic = 'force-dynamic';
// 2.0: the composer sends in batches of SEND_BATCH_SIZE (see
// app/campaigns/new), each a separate request that adds to the same
// campaign, so no single request runs long regardless of the plan's limit.
export const maxDuration = 60;

// Shape a sendCampaign result into an Email Events record. Reused by the
// logEvents closure below, which sendCampaign calls every 10 sends so
// events land in Airtable as the campaign progresses rather than only
// after the whole loop finishes (see lib/resend.js).
function buildEventFields(result, campaignId) {
  const eventFields = {
    'Event ID': `sent-${result.trackingId || Date.now()}`,
    'Tracking ID': result.trackingId || '',
    'Recipient Email': result.email,
    Campaign: [campaignId],
    'Campaign ID': campaignId,
    'Event Type': result.status === 'sent' ? 'Sent' : 'Failed',
    Timestamp: new Date().toISOString(),
    'Gmail Message ID': result.messageId || '',
    'Error Message': result.error || '',
  };
  if (result.id) {
    eventFields.Person = [result.id];
  }
  return eventFields;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      subject,
      bodyTemplate,
      recipients,
      campaignName,
      pdfLink,
      pdfLabel,          // Optional: text for {{pdf_link}} (default "View PDF")
      customBodies,      // Optional: { [personId]: "edited HTML" }
      campaignId: existingCampaignId,  // Optional: send to an existing campaign
      cc,                // Optional: texto libre o array, se aplica a cada correo
      bcc,               // Optional: texto libre o array, se aplica a cada correo
    } = body;

    if (!subject || !bodyTemplate || !recipients?.length) {
      return NextResponse.json(
        { error: 'Missing required fields: subject, bodyTemplate, recipients' },
        { status: 400 }
      );
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

      previousSentCount = campaign['Sent Count'] || 0;
      previousFailedCount = campaign['Failed Count'] || 0;

      // Filter out people who already received this campaign
      const alreadySent = await getAlreadySentEmails(existingCampaignId);
      actualRecipients = recipients.filter((r) => !alreadySent.has(normEmail(r.email)));

      if (actualRecipients.length === 0) {
        return NextResponse.json(
          { error: 'All selected recipients have already received this campaign' },
          { status: 400 }
        );
      }

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
      if (pdfLabel) {
        campaignFields['PDF Label'] = pdfLabel;
      }

      campaign = await createCampaign(campaignFields);
    }

    // Drop anyone marked "Do Not Email". The frontend sends recipient objects
    // from an earlier fetch, so this has to be re-checked server-side against
    // current Airtable state rather than trusted from the request body.
    const suppressedEmails = await getSuppressedEmails(actualRecipients.map((r) => r.id));
    const suppressedCount = actualRecipients.filter((r) => suppressedEmails.has(normEmail(r.email))).length;
    actualRecipients = actualRecipients.filter((r) => !suppressedEmails.has(normEmail(r.email)));

    if (actualRecipients.length === 0) {
      return NextResponse.json(
        { error: 'All selected recipients are marked Do Not Email or have already received this campaign' },
        { status: 400 }
      );
    }

    // 2. Send emails (only to actualRecipients, which excludes already-sent).
    //    Sent/Failed events are logged incrementally every 10 sends via
    //    logEvents, not after the whole loop, so a timeout or crash partway
    //    through doesn't lose events for recipients who already got the email.
    const results = await sendCampaign({
      campaignId: campaign.id,
      subject,
      bodyTemplate,
      recipients: actualRecipients,
      pdfLink: pdfLink || null,
      pdfLabel: pdfLabel || campaign['PDF Label'] || null,
      customBodies: customBodies || null,
      cc: cc || null,
      bcc: bcc || null,
      delayMs: 700, // Resend allows 2 req/s; 0.7s keeps a safe margin
      logEvents: (batch) =>
        createRecords('Email Events', batch.map((r) => buildEventFields(r, campaign.id))),
    });

    const newSentCount = results.filter((r) => r.status === 'sent').length;
    const newFailedCount = results.filter((r) => r.status === 'failed').length;

    // 4. Update campaign status and accumulate counts
    const totalSent = previousSentCount + newSentCount;
    const totalFailed = previousFailedCount + newFailedCount;

    await updateCampaign(campaign.id, {
      Status: newFailedCount === 0 ? 'Sent' : 'Partial',
      'Sent Count': totalSent,
      'Failed Count': totalFailed,
    });

    // 5. Link new people to the campaign's People field. 2.0: also for the
    //    first batch of a new campaign (1.x only linked later additions).
    {
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
      suppressed: suppressedCount,
      results,
    });
  } catch (error) {
    console.error('Send campaign error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
