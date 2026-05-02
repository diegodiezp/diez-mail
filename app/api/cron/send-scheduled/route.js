import { NextResponse } from 'next/server';
import { fetchAll, updateCampaign, getAlreadySentEmails, logEmailEvent, fetchOne } from '@/lib/airtable';
import { sendCampaign } from '@/lib/gmail';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  // Verify Vercel cron secret
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const now = new Date().toISOString();

    // Fetch all Scheduled campaigns whose scheduled time has passed
    const scheduled = await fetchAll('Campaigns', {
      filterByFormula: `AND({Status} = 'Scheduled', {Scheduled For} <= '${now}')`,
    });

    if (scheduled.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    let totalSent = 0;

    for (const campaign of scheduled) {
      try {
        // Mark as sending
        await updateCampaign(campaign.id, { Status: 'Sending' });

        // Rebuild recipients from already-sent events (People linked field may exist)
        // We reconstruct by fetching all events for this campaign
        const alreadySent = await getAlreadySentEmails(campaign.id);
        const peopleIds = campaign.People || [];

        // Fetch person records to get emails
        const recipients = [];
        for (const personId of peopleIds) {
          try {
            const person = await fetchOne('People', personId);
            if (person.Email && !alreadySent.has(person.Email)) {
              recipients.push({
                id: personId,
                email: person.Email,
                name: person['First Name'] || '',
                surname: person['Last Name'] || '',
              });
            }
          } catch {
            // skip missing records
          }
        }

        if (recipients.length === 0) {
          await updateCampaign(campaign.id, { Status: 'Sent' });
          continue;
        }

        const results = await sendCampaign({
          subject: campaign.Subject || '(no subject)',
          bodyTemplate: campaign['Body Template'] || '',
          recipients,
          campaignId: campaign.id,
          pdfLink: campaign['PDF Link'] || '',
        });

        const sentCount = results.filter((r) => r.status === 'sent').length;
        const failedCount = results.filter((r) => r.status !== 'sent').length;

        for (const result of results) {
          await logEmailEvent({
            'Event ID': `sent-${result.trackingId || Date.now()}`,
            'Tracking ID': result.trackingId || '',
            'Recipient Email': result.email,
            Campaign: [campaign.id],
            'Event Type': result.status === 'sent' ? 'Sent' : 'Failed',
            Timestamp: new Date().toISOString(),
            'Gmail Message ID': result.messageId || '',
            'Error Message': result.error || '',
          });
        }

        await updateCampaign(campaign.id, {
          Status: failedCount === 0 ? 'Sent' : 'Partial',
          'Sent Count': sentCount,
          'Failed Count': failedCount,
          'Scheduled For': null,
        });

        totalSent += sentCount;
      } catch (err) {
        console.error(`Failed to send scheduled campaign ${campaign.id}:`, err);
        await updateCampaign(campaign.id, { Status: 'Failed' }).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true, sent: totalSent, campaigns: scheduled.length });
  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
