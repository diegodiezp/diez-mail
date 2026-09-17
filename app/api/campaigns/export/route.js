import { NextResponse } from 'next/server';
import { getCampaigns, getCampaignDetail, getEventsForCampaign } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

function csvEscape(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toRow(values) {
  return values.map(csvEscape).join(',') + '\r\n';
}

function csvResponse(csv, filename) {
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

// One campaign: every recipient it was sent to, with their open/click stats.
async function exportCampaignRecipients(campaignId) {
  const { campaign, recipients } = await getCampaignDetail(campaignId);

  const header = toRow([
    'Email',
    'Name',
    'Sent',
    'Opens',
    'Clicks',
    'First Open',
    'Last Open',
    'Last Click',
    'Devices',
    'Clicked URLs',
  ]);

  const rows = recipients
    .map((r) =>
      toRow([
        r.email,
        r.name,
        r.sent ? 'Yes' : 'No',
        r.opens,
        r.clicks,
        r.firstOpen || '',
        r.lastOpen || '',
        r.lastClick || '',
        r.devices.join(', '),
        r.clickedUrls.join(', '),
      ])
    )
    .join('');

  const safeName = (campaign.name || 'campaign').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return csvResponse(header + rows, `${safeName}-recipients.csv`);
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('id');

    if (campaignId) {
      return await exportCampaignRecipients(campaignId);
    }

    const [campaigns, allEvents] = await Promise.all([
      getCampaigns(),
      getEventsForCampaign(null),
    ]);

    const eventsByCampaign = {};
    for (const event of allEvents) {
      const campIds = event.Campaign;
      if (!campIds || !Array.isArray(campIds)) continue;
      for (const cid of campIds) {
        if (!eventsByCampaign[cid]) eventsByCampaign[cid] = [];
        eventsByCampaign[cid].push(event);
      }
    }

    const sentCampaigns = campaigns.filter((c) => c.Status === 'Sent');

    const header = toRow([
      'Campaign',
      'Subject',
      'Sent',
      'Unique Opens',
      'Total Opens',
      'Unique Clicks',
      'Total Clicks',
      'Open Rate %',
      'Click Rate %',
      'Created',
    ]);

    const rows = sentCampaigns
      .map((c) => {
        const events = eventsByCampaign[c.id] || [];
        const emails = {};
        for (const e of events) {
          const em = e['Recipient Email'];
          if (!em) continue;
          if (!emails[em]) emails[em] = { sent: false, opens: 0, clicks: 0 };
          if (e['Event Type'] === 'Sent') emails[em].sent = true;
          if (e['Event Type'] === 'Open') emails[em].opens++;
          if (e['Event Type'] === 'Click') emails[em].clicks++;
        }
        const recipients = Object.values(emails);
        const sent = recipients.filter((r) => r.sent).length;
        const uniqueOpens = recipients.filter((r) => r.opens > 0).length;
        const uniqueClicks = recipients.filter((r) => r.clicks > 0).length;
        const totalOpens = recipients.reduce((s, r) => s + r.opens, 0);
        const totalClicks = recipients.reduce((s, r) => s + r.clicks, 0);
        const openRate = sent > 0 ? ((uniqueOpens / sent) * 100).toFixed(1) : 0;
        const clickRate = sent > 0 ? ((uniqueClicks / sent) * 100).toFixed(1) : 0;

        return toRow([
          c.Name || 'Untitled Campaign',
          c.Subject || '',
          sent,
          uniqueOpens,
          totalOpens,
          uniqueClicks,
          totalClicks,
          openRate,
          clickRate,
          c.Created || '',
        ]);
      })
      .join('');

    const today = new Date().toISOString().slice(0, 10);
    return csvResponse(header + rows, `diez-mail-campaigns-${today}.csv`);
  } catch (error) {
    console.error('Campaigns export error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
