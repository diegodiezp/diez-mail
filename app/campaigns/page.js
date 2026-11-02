'use client';
// Campaigns, 2.0: newest first, human (bot-filtered) rates, a comparison
// strip of recent campaigns, and one-tap duplicate / add recipients.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import CampaignTabs from '@/components/CampaignTabs';
import { EmptyState, PageHeader, SkeletonRows, Stat, Icon } from '@/components/ui';
import { shortDate } from '@/lib/format';

function Bar({ value, max = 100, accent }) {
  return (
    <div className="h-1 bg-gallery-border w-full">
      <div className={`h-1 ${accent ? 'bg-gallery-accent' : 'bg-gallery-black'}`} style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
    </div>
  );
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState(null);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/campaigns').then((r) => r.json()).then((d) => { if (d.error) throw new Error(d.error); setCampaigns(d.campaigns); }).catch((e) => setError(e.message));
  }, []);

  const list = useMemo(() => {
    let l = campaigns || [];
    if (!showAll) l = l.filter((c) => !c.reply && !c.boothQr);
    const term = q.trim().toLowerCase();
    if (term) l = l.filter((c) => `${c.Name} ${c.Subject}`.toLowerCase().includes(term));
    return l;
  }, [campaigns, showAll, q]);

  const real = useMemo(() => (campaigns || []).filter((c) => !c.reply && !c.boothQr && c._sent >= 5), [campaigns]);
  const summary = useMemo(() => {
    if (!real.length) return null;
    const sent = real.reduce((s, c) => s + c._sent, 0);
    const opens = real.reduce((s, c) => s + c._opens, 0);
    const clicks = real.reduce((s, c) => s + c._clicks, 0);
    return { sent, openRate: ((opens / sent) * 100).toFixed(1), clickRate: ((clicks / sent) * 100).toFixed(1), count: real.length };
  }, [real]);
  const recent = real.slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Campaigns"
        sub="Rates count people, not machines: mail scanners and prefetches are filtered out."
        actions={<Link href="/campaigns/new" className="btn-primary"><Icon name="plus" size={16} /> New campaign</Link>}
      />
      <CampaignTabs />

      {error && <div className="notice-danger mb-4">{error}</div>}

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat label="Campaigns" value={summary.count} />
          <Stat label="Emails sent" value={summary.sent.toLocaleString()} />
          <Stat label="Open rate" value={`${summary.openRate}%`} hint="unique people" />
          <Stat label="Click rate" value={`${summary.clickRate}%`} hint="unique people" />
        </div>
      )}

      {recent.length > 1 && (
        <section className="card mb-6">
          <div className="card-head"><h2 className="eyebrow">Recent campaigns compared</h2><span className="text-2xs text-gallery-light">open · click</span></div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-px bg-gallery-border">
            {recent.map((c) => (
              <Link key={c.id} href={`/campaigns/${c.id}`} className="bg-gallery-white p-3 hover:bg-gallery-bg transition-colors">
                <div className="text-xs leading-tight line-clamp-2 min-h-[2rem]">{c.Name}</div>
                <div className="mt-2 space-y-1.5">
                  <div className="flex items-center gap-2"><Bar value={parseFloat(c._openRate)} /><span className="text-2xs num w-9 text-right">{Math.round(c._openRate)}%</span></div>
                  <div className="flex items-center gap-2"><Bar value={parseFloat(c._clickRate)} max={50} accent /><span className="text-2xs num w-9 text-right">{Math.round(c._clickRate)}%</span></div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gallery-light" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns" className="input-field pl-9" />
        </div>
        <label className="flex items-center gap-2 text-sm text-gallery-mid px-1 cursor-pointer">
          <input type="checkbox" className="accent-gallery-black" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Include replies and booth QR
        </label>
      </div>

      <div className="card">
        {!campaigns && !error && <SkeletonRows rows={8} avatar={false} />}
        {campaigns && list.length === 0 && <EmptyState title="No campaigns" action={<Link href="/campaigns/new" className="btn-primary">New campaign</Link>} />}
        {list.map((c) => (
          <div key={c.id} className="row hover:bg-gallery-bg transition-colors">
            <Link href={`/campaigns/${c.id}`} className="flex-1 min-w-0">
              <div className="text-sm truncate">{c.Name}</div>
              <div className="text-2xs text-gallery-mid truncate">
                {shortDate(c.date)} · {c._sent} sent
                {c.Status && c.Status !== 'Sent' && <span className={c.Status === 'Failed' ? 'text-gallery-danger' : 'text-gallery-warn'}> · {c.Status}</span>}
                {c._inquiries > 0 && <span className="text-gallery-accent"> · {c._inquiries} inquired</span>}
                {c._room > 0 && <span> · {c._room} in room</span>}
              </div>
            </Link>
            <div className="hidden sm:flex items-center gap-6 text-right">
              <div className="w-16"><div className="text-sm num">{c._openRate}%</div><div className="text-2xs text-gallery-light">opened</div></div>
              <div className="w-16"><div className="text-sm num">{c._clickRate}%</div><div className="text-2xs text-gallery-light">clicked</div></div>
            </div>
            <div className="sm:hidden text-right"><div className="text-sm num">{Math.round(c._openRate)}%</div></div>
            <div className="flex items-center gap-1 shrink-0">
              <Link href={`/campaigns/new?duplicate=${c.id}`} className="btn-ghost" title="Duplicate">Duplicate</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
