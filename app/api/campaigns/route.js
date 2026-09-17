import { NextResponse } from 'next/server';
import { getCampaigns, getCampaignDetail, getEventsForCampaign } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('id');

    if (campaignId) {
      return NextResponse.json(await getCampaignDetail(campaignId));
    }

    // ── All campaigns list ────────────────────────────────────────────────────
    const campaigns = await getCampaigns();
    const allEvents = await getEventsForCampaign(null);

    const eventsByCampaign = {};
    for (const event of allEvents) {
      const campIds = event.Campaign;
      if (!campIds || !Array.isArray(campIds)) continue;
      for (const cid of campIds) {
        if (!eventsByCampaign[cid]) eventsByCampaign[cid] = [];
        eventsByCampaign[cid].push(event);
      }
    }

    const campaignsWithStats = campaigns.map((c) => {
      const events = eventsByCampaign[c.id] || [];
      const emails = {};
      for (const e of events) {
        const em = e['Recipient Email'];
        if (!em) continue;
        if (!emails[em]) emails[em] = { sent: false, opened: false, clicked: false };
        if (e['Event Type'] === 'Sent') emails[em].sent = true;
        if (e['Event Type'] === 'Open') emails[em].opened = true;
        if (e['Event Type'] === 'Click') emails[em].clicked = true;
      }
      const recipients = Object.values(emails);
      const sent = recipients.filter((r) => r.sent).length;
      const opens = recipients.filter((r) => r.opened).length;
      const clicks = recipients.filter((r) => r.clicked).length;

      return {
        ...c,
        _sent: sent,
        _opens: opens,
        _clicks: clicks,
        _openRate: sent > 0 ? ((opens / sent) * 100).toFixed(1) : 0,
      };
    });

    return NextResponse.json({ campaigns: campaignsWithStats });
  } catch (error) {
    console.error('Campaigns API error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
