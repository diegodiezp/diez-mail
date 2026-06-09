import { NextResponse } from 'next/server';
import { getCampaigns, getCampaign, getEventsForCampaign, getPeople } from '@/lib/airtable';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const campaignId = searchParams.get('id');

    if (campaignId) {
      // Fetch campaign record + events + people in parallel.
      // People is needed to resolve real names in the recipients table
      // (events only store the email).
      const [campaign, events, people] = await Promise.all([
        getCampaign(campaignId),
        getEventsForCampaign(campaignId),
        getPeople({ fields: ['First Name', 'Last Name', 'Email'] }),
      ]);

      // email (lowercase) → "First Last"
      const nameByEmail = {};
      for (const p of people) {
        if (p.Email) {
          nameByEmail[p.Email.toLowerCase()] =
            [p['First Name'], p['Last Name']].filter(Boolean).join(' ').trim();
        }
      }

      // Aggregate stats per recipient
      const recipients = {};
      for (const event of events) {
        const email = event['Recipient Email'];
        if (!email) continue;

        if (!recipients[email]) {
          recipients[email] = {
            email,
            name: nameByEmail[email.toLowerCase()] || email,
            personId: null,
            sent: false,
            opens: 0,
            clicks: 0,
            firstOpen: null,
            lastOpen: null,
            lastClick: null,
            clickedUrls: [],
            devices: new Set(),
          };
        }

        const r = recipients[email];
        const eventType = event['Event Type'];

        if (eventType === 'Sent') {
          r.sent = true;
        } else if (eventType === 'Open') {
          r.opens++;
          const ts = event.Timestamp;
          if (!r.firstOpen || ts < r.firstOpen) r.firstOpen = ts;
          if (!r.lastOpen || ts > r.lastOpen) r.lastOpen = ts;
          if (event.Device) r.devices.add(event.Device);
        } else if (eventType === 'Click') {
          r.clicks++;
          const ts = event.Timestamp;
          if (!r.lastClick || ts > r.lastClick) r.lastClick = ts;
          if (event['Clicked URL']) r.clickedUrls.push(event['Clicked URL']);
          if (event.Device) r.devices.add(event.Device);
        }

        if (event.Person?.length && !r.personId) {
          r.personId = event.Person[0];
        }
      }

      const recipientList = Object.values(recipients).map((r) => ({
        ...r,
        devices: Array.from(r.devices),
        clickedUrls: [...new Set(r.clickedUrls)],
      }));

      const totalSent = recipientList.filter((r) => r.sent).length;
      const totalOpened = recipientList.filter((r) => r.opens > 0).length;
      const totalClicked = recipientList.filter((r) => r.clicks > 0).length;
      const totalOpens = recipientList.reduce((sum, r) => sum + r.opens, 0);
      const totalClicks = recipientList.reduce((sum, r) => sum + r.clicks, 0);

      return NextResponse.json({
        campaign: {
          id: campaign.id,
          name: campaign.Name || 'Untitled Campaign',
          subject: campaign.Subject || null,
          status: campaign.Status || null,
        },
        stats: {
          sent: totalSent,
          uniqueOpens: totalOpened,
          totalOpens,
          uniqueClicks: totalClicked,
          totalClicks,
          openRate: totalSent > 0 ? ((totalOpened / totalSent) * 100).toFixed(1) : 0,
          clickRate: totalSent > 0 ? ((totalClicked / totalSent) * 100).toFixed(1) : 0,
        },
        recipients: recipientList.sort((a, b) => b.opens - a.opens),
        events,
      });
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
