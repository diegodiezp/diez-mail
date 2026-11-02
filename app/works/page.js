'use client';
// Works: every artwork someone opened in a viewing room, with the people who
// looked at it, strongest interest first. Filter by artist or availability,
// then email everyone who looked at a work in one go.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PeopleTabs from '@/components/PeopleTabs';
import { ArtworkThumb, EmptyState, PageHeader, SkeletonRows, Icon } from '@/components/ui';
import { timeAgo } from '@/lib/format';

const price = (n) => (typeof n === 'number' ? `€${n.toLocaleString('en-GB')}` : '');

export default function WorksPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [artist, setArtist] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    fetch('/api/works').then((r) => r.json()).then((d) => { if (d.error) throw new Error(d.error); setData(d); }).catch((e) => setError(e.message));
  }, []);

  const works = useMemo(() => {
    let list = data?.works || [];
    if (artist) list = list.filter((w) => w.artist === artist);
    if (onlyAvailable) list = list.filter((w) => !/sold|reserved|on hold/i.test(w.status || ''));
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((w) => `${w.title} ${w.artist}`.toLowerCase().includes(term));
    return list;
  }, [data, artist, onlyAvailable, q]);

  const emailViewers = (w) => {
    const ids = w.viewers.filter((v) => v.personId && !v.doNotEmail).map((v) => v.personId);
    if (ids.length) router.push(`/campaigns/new?people=${ids.join(',')}&about=${encodeURIComponent(w.title)}`);
  };

  return (
    <div>
      <PageHeader title="People" sub="Works and who looked at them" />
      <PeopleTabs />

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gallery-light" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title or artist" className="input-field pl-9" />
        </div>
        <select value={artist} onChange={(e) => setArtist(e.target.value)} className="input-field sm:w-56">
          <option value="">All artists</option>
          {(data?.artists || []).map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gallery-mid px-1 cursor-pointer">
          <input type="checkbox" className="accent-gallery-black" checked={onlyAvailable} onChange={(e) => setOnlyAvailable(e.target.checked)} /> Available only
        </label>
      </div>

      {error && <div className="notice-danger mb-4">{error}</div>}
      {!data && !error && <div className="card"><SkeletonRows rows={6} /></div>}
      {data && works.length === 0 && <div className="card"><EmptyState title="No works yet">Works appear here once someone opens them in a viewing room from a tracked link.</EmptyState></div>}

      <div className="space-y-3">
        {works.map((w) => {
          const key = w.id || w.title;
          const isOpen = open === key;
          return (
            <article key={key} className="card">
              <button type="button" onClick={() => setOpen(isOpen ? null : key)} className="w-full flex items-center gap-4 p-3 sm:p-4 text-left">
                <ArtworkThumb id={w.id} title={w.title} size={72} />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] leading-snug truncate">{w.title}</div>
                  <div className="text-xs text-gallery-mid truncate">{[w.artist, w.year].filter(Boolean).join(', ')}</div>
                  <div className="mt-1 text-2xs text-gallery-light flex flex-wrap gap-x-2">
                    {w.status && <span>{w.status}</span>}
                    {w.price != null && <span className="num">{price(w.price)}</span>}
                    <span>last seen {timeAgo(w.last)}</span>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg num leading-none">{w.viewers.length}</div>
                  <div className="text-2xs text-gallery-mid">looked</div>
                  {w.inquiries > 0 && <div className="text-2xs text-gallery-accent mt-1">{w.inquiries} inquired</div>}
                </div>
              </button>
              {isOpen && (
                <div className="border-t border-gallery-border">
                  {w.viewers.map((v) => (
                    <div key={v.email} className="row">
                      <div className="min-w-0 flex-1">
                        {v.personId ? <Link href={`/contacts/${v.personId}`} className="text-sm hover:underline">{v.name}</Link> : <span className="text-sm">{v.name}</span>}
                        <div className="text-2xs text-gallery-mid truncate">{[v.company, v.pipeline].filter(Boolean).join(' · ')}</div>
                      </div>
                      <div className="text-2xs text-right shrink-0">
                        {v.inquired && <div className="text-gallery-accent">inquired</div>}
                        <div className="text-gallery-mid">{v.views} view{v.views === 1 ? '' : 's'} · {timeAgo(v.last)}</div>
                      </div>
                    </div>
                  ))}
                  <div className="px-4 sm:px-5 py-3 border-t border-gallery-border flex justify-end">
                    <button type="button" className="btn-primary btn-sm" onClick={() => emailViewers(w)}>
                      <Icon name="campaigns" size={14} /> Email these {w.viewers.filter((v) => v.personId && !v.doNotEmail).length}
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
