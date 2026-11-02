'use client';
// Campaign report, 2.0: the full funnel from email to inquiry, counted in
// people and cleaned of scanners, plus who did what and the quick actions
// that follow from it (follow up, resend to non-openers, duplicate).

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { computeChartData, OpensOverTime, DeviceBreakdown, TopLinks } from '@/components/CampaignCharts';
import { Avatar, BackLink, EmptyState, Segmented, SkeletonRows, Icon } from '@/components/ui';
import { duration, fullDate, timeAgo } from '@/lib/format';

function FunnelRow({ label, value, of, note, accent }) {
  const pct = of > 0 ? (value / of) * 100 : 0;
  return (
    <div className="grid grid-cols-[110px_1fr_auto] sm:grid-cols-[160px_1fr_auto] items-center gap-3 py-2">
      <div className="text-sm">{label}</div>
      <div className="h-2 bg-gallery-bg">
        <div className={`h-2 ${accent ? 'bg-gallery-accent' : 'bg-gallery-black'}`} style={{ width: `${Math.max(pct, value > 0 ? 1.5 : 0)}%` }} />
      </div>
      <div className="text-right w-24">
        <span className="text-sm num">{value}</span>
        <span className="text-2xs text-gallery-light num ml-1.5">{of > 0 ? `${pct.toFixed(pct < 10 ? 1 : 0)}%` : ''}</span>
        {note && <div className="text-2xs text-gallery-light">{note}</div>}
      </div>
    </div>
  );
}

export default function CampaignReportPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('engaged');
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch(`/api/campaigns?id=${id}`).then((r) => r.json()).then((d) => { if (d.error) throw new Error(d.error); setData(d); }).catch((e) => setError(e.message));
  }, [id]);

  const chartData = useMemo(() => (data ? computeChartData(data.events, data.recipients) : null), [data]);

  const groups = useMemo(() => {
    const r = data?.recipients || [];
    return {
      all: r,
      engaged: r.filter((x) => x.opens || x.clicks || x.room || x.roomSeconds || x.inquiries),
      room: r.filter((x) => x.room || x.roomSeconds),
      inquired: r.filter((x) => x.inquiries),
      unopened: r.filter((x) => x.sent && !x.opens && !x.clicks && !x.room),
      failed: r.filter((x) => x.failed && !x.sent),
    };
  }, [data]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = groups[filter] || [];
    return term ? list.filter((x) => `${x.name} ${x.email} ${x.company}`.toLowerCase().includes(term)) : list;
  }, [groups, filter, q]);

  if (error) return (<div><BackLink href="/campaigns">Campaigns</BackLink><div className="notice-danger">{error}</div></div>);
  if (!data) return (<div><BackLink href="/campaigns">Campaigns</BackLink><div className="skeleton h-8 w-1/2 mb-6" /><div className="card"><SkeletonRows rows={8} /></div></div>);

  const { campaign, funnel, filtered } = data;
  const removed = (filtered.bot || 0) + (filtered.scanner || 0) + (filtered.duplicate || 0);
  const unopenedIds = groups.unopened.map((x) => x.personId).filter(Boolean);

  return (
    <div>
      <BackLink href="/campaigns">Campaigns</BackLink>
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <h1 className="page-title">{campaign.name}</h1>
          <p className="page-sub">
            {campaign.subject && <span>“{campaign.subject}”</span>}
            {campaign.created && <span> · {fullDate(campaign.created)}</span>}
            {campaign.status && campaign.status !== 'Sent' && <span className="text-gallery-warn"> · {campaign.status}</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/campaigns/new?followup=${id}`} className="btn-primary btn-sm"><Icon name="reply" size={14} /> Follow-up</Link>
          {unopenedIds.length > 0 && (
            <Link href={`/campaigns/new?duplicate=${id}&people=${unopenedIds.join(',')}`} className="btn-secondary btn-sm">Resend to {unopenedIds.length} unopened</Link>
          )}
          <Link href={`/campaigns/new?campaign=${id}`} className="btn-secondary btn-sm">Add recipients</Link>
          <Link href={`/campaigns/new?duplicate=${id}`} className="btn-ghost">Duplicate</Link>
        </div>
      </div>

      {/* Funnel */}
      <section className="card p-4 sm:p-5 mb-6">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="eyebrow">From email to inquiry</h2>
          {removed > 0 && <span className="text-2xs text-gallery-light">{removed} machine events left out</span>}
        </div>
        <FunnelRow label="Delivered" value={funnel.sent} of={funnel.sent} note={funnel.failed ? `${funnel.failed} failed` : null} />
        <FunnelRow label="Opened" value={funnel.opened} of={funnel.sent} note={funnel.openedRaw > funnel.opened ? `${funnel.openedRaw} incl. prefetch` : null} />
        <FunnelRow label="Clicked" value={funnel.clicked} of={funnel.sent} />
        <FunnelRow label="Viewing room" value={funnel.room} of={funnel.sent} />
        <FunnelRow label="Looked at works" value={funnel.artwork} of={funnel.sent} />
        <FunnelRow label="Inquired" value={funnel.inquired} of={funnel.sent} accent />
        <p className="text-2xs text-gallery-light mt-3">
          Opens are approximate everywhere: Apple Mail preloads images and some clients block them. Clicks, room visits and inquiries are reliable.
        </p>
      </section>

      {/* Charts */}
      {chartData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-6">
          <div className="lg:col-span-2"><OpensOverTime data={chartData.hourlyOpens} /></div>
          <div className="space-y-3">
            {chartData.hasDeviceData && <DeviceBreakdown data={chartData.devices} />}
            {chartData.hasClickData && <TopLinks data={chartData.topLinks} />}
          </div>
        </div>
      )}

      {/* Recipients */}
      <section className="card">
        <div className="card-head flex-col sm:flex-row items-stretch sm:items-center">
          <div className="overflow-x-auto no-scrollbar">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'engaged', label: 'Engaged', count: groups.engaged.length },
                { value: 'room', label: 'In room', count: groups.room.length },
                { value: 'inquired', label: 'Inquired', count: groups.inquired.length },
                { value: 'unopened', label: 'Not opened', count: groups.unopened.length },
                { value: 'failed', label: 'Failed', count: groups.failed.length },
                { value: 'all', label: 'All', count: groups.all.length },
              ]}
            />
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a person" className="input-field sm:w-56 py-1.5" />
        </div>
        {shown.length === 0 && <EmptyState title="Nobody here" />}
        {shown.map((r) => (
          <div key={r.email} className="row items-start">
            <Avatar name={r.name} size={32} />
            <div className="min-w-0 flex-1">
              {r.personId ? <Link href={`/contacts/${r.personId}`} className="text-sm hover:underline">{r.name}</Link> : <span className="text-sm">{r.name}</span>}
              <div className="text-2xs text-gallery-mid truncate">{r.company || r.email}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {r.inquiries > 0 && <span className="chip chip-accent">inquired</span>}
                {r.roomSeconds > 0 && <span className="chip">{duration(r.roomSeconds)} in room</span>}
                {r.room > 0 && !r.roomSeconds && <span className="chip">opened room</span>}
                {r.artworkViews > 0 && <span className="chip">{r.artworkViews} work views</span>}
                {r.clicks > 0 && <span className="chip">{r.clicks} click{r.clicks > 1 ? 's' : ''}</span>}
                {r.opens > 0 && <span className="chip">opened {r.opens}×</span>}
                {r.failed && !r.sent && <span className="chip text-gallery-danger">failed</span>}
              </div>
              {r.artworks.length > 0 && <div className="text-2xs text-gallery-light mt-1 truncate">{r.artworks.slice(0, 4).join(' · ')}</div>}
            </div>
            <div className="text-2xs text-gallery-light shrink-0 text-right">
              {r.lastActivity ? timeAgo(r.lastActivity) : r.sent ? 'no activity' : ''}
              {r.devices.length > 0 && <div>{r.devices.join(', ')}</div>}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
