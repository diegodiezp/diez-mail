import { NextResponse } from 'next/server';
import {
  fetchAll, updateCampaign, getEventsForCampaign, getPeopleByIds, createRecords, normEmail,
} from '@/lib/airtable';
import { sendCampaign } from '@/lib/resend';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Called every 15 minutes by .github/workflows/send-scheduled.yml (GitHub
// Actions, free), because Vercel's Hobby cron can only run once a day.
//
// Each run sends as many due recipients as fit in SEND_BUDGET_MS, then puts
// the campaign back to "Scheduled" so the next run continues where this one
// stopped. A 343-person list therefore goes out over three runs (~45 min)
// instead of being cut off by the 300s function limit.
//
// Already-sent AND already-failed addresses are skipped on every run, so a
// bad address (e.g. "name@domain.com. ") is tried once, not every 15 minutes.
//
// Known limits of scheduled sends (the compose page warns about them):
// Cc/Bcc and per-recipient edits from the Personalize step are not stored,
// so they don't go out. Send now if you need either.

const SEND_BUDGET_MS = 230 * 1000; // leaves ~70s for Airtable reads/writes
const MS_PER_RECIPIENT = 1900; // 1.5s pacing delay + Resend round trip
const MIN_CHUNK = 5;

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
  if (result.id) eventFields.Person = [result.id];
  return eventFields;
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();
  const report = [];

  try {
    const now = new Date().toISOString();
    const due = await fetchAll('Campaigns', {
      filterByFormula: `AND({Status} = 'Scheduled', {Scheduled For}, NOT(IS_AFTER({Scheduled For}, '${now}')))`,
      sort: [{ field: 'Scheduled For', direction: 'asc' }],
    });

    for (const campaign of due) {
      const remainingMs = SEND_BUDGET_MS - (Date.now() - startedAt);
      const chunkSize = Math.floor(remainingMs / MS_PER_RECIPIENT);
      if (chunkSize < MIN_CHUNK) {
        report.push({ campaign: campaign.id, skipped: 'no time left, next run' });
        continue;
      }

      try {
        // Claim it first so a second, overlapping run can't pick it up too.
        await updateCampaign(campaign.id, { Status: 'Sending' });

        const events = await getEventsForCampaign(campaign.id);
        const done = new Set();
        for (const ev of events) {
          if ((ev['Event Type'] === 'Sent' || ev['Event Type'] === 'Failed') && ev['Recipient Email']) {
            done.add(normEmail(ev['Recipient Email']));
          }
        }

        const people = await getPeopleByIds(campaign.People || [], [
          'First Name', 'Last Name', 'Email', 'Do Not Email',
        ]);
        const pending = people
          .filter((p) => p.Email && !p['Do Not Email'] && !done.has(normEmail(p.Email)))
          .map((p) => ({
            id: p.id,
            email: String(p.Email).trim(),
            name: p['First Name'] || '',
            surname: p['Last Name'] || '',
          }));

        const previousSent = campaign['Sent Count'] || 0;
        const previousFailed = campaign['Failed Count'] || 0;

        if (pending.length === 0) {
          await updateCampaign(campaign.id, {
            Status: previousFailed === 0 ? 'Sent' : 'Partial',
            'Scheduled For': null,
          });
          report.push({ campaign: campaign.id, sent: 0, remaining: 0 });
          continue;
        }

        const chunk = pending.slice(0, chunkSize);
        const results = await sendCampaign({
          subject: campaign.Subject || '(no subject)',
          bodyTemplate: campaign['Body Template'] || '',
          recipients: chunk,
          campaignId: campaign.id,
          pdfLink: campaign['PDF Link'] || '',
          logEvents: (batch) =>
            createRecords('Email Events', batch.map((r) => buildEventFields(r, campaign.id))),
        });

        const sentNow = results.filter((r) => r.status === 'sent').length;
        const failedNow = results.filter((r) => r.status !== 'sent').length;
        const remaining = pending.length - chunk.length;
        const totalFailed = previousFailed + failedNow;

        await updateCampaign(campaign.id, {
          // More to go: hand it back to the queue, keeping Scheduled For,
          // so the next run picks it up first.
          Status: remaining > 0 ? 'Scheduled' : totalFailed === 0 ? 'Sent' : 'Partial',
          'Sent Count': previousSent + sentNow,
          'Failed Count': totalFailed,
          ...(remaining === 0 && { 'Scheduled For': null }),
        });

        report.push({ campaign: campaign.id, sent: sentNow, failed: failedNow, remaining });
      } catch (err) {
        console.error(`Failed to send scheduled campaign ${campaign.id}:`, err);
        await updateCampaign(campaign.id, { Status: 'Failed' }).catch(() => {});
        report.push({ campaign: campaign.id, error: err.message });
      }
    }

    console.log('[send-scheduled]', JSON.stringify(report));
    return NextResponse.json({ ok: true, due: due.length, report });
  } catch (error) {
    console.error('Cron error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
