'use client';
// Fair mode: the booth QR leads, day by day, as they come in. Made for the
// phone at the stand: a quick note while you still remember the face, a
// stage, and after the fair one follow-up to everyone you choose.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PushToggle from '@/components/PushToggle';
import { Avatar, BackLink, EmptyState, PageHeader, Segmented, SkeletonRows, Icon } from '@/components/ui';
import { duration, PIPELINE_STAGES, timeAgo } from '@/lib/format';

function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

function LeadCard({ lead, selected, onToggle, onSaved }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(lead.pipeline);

  const patch = async (fields) => {
    if (!lead.personId) return;
    setBusy(true);
    try {
      await fetch(`/api/contacts/${lead.personId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fields) });
      onSaved?.();
    } finally {
      setBusy(false);
    }
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const entry = `[${date}] At the booth (${lead.room}): ${note.trim()}`;
    await patch({ Notes: lead.notes ? `${entry}\n\n${lead.notes}` : entry });
    lead.notes = lead.notes ? `${entry}\n\n${lead.notes}` : entry;
    setNote('');
  };

  return (
    <article className={`card p-4 ${selected ? 'border-gallery-black' : ''}`}>
      <div className="flex items-start gap-3">
        <input type="checkbox" checked={selected} onChange={onToggle} className="accent-gallery-black mt-3" aria-label="Select for follow-up" />
        <Avatar name={lead.name || lead.email} size={40} />
        <div className="min-w-0 flex-1">
          {lead.personId ? <Link href={`/contacts/${lead.personId}`} className="text-[15px] hover:underline">{lead.name || lead.email}</Link> : <span className="text-[15px]">{lead.email}</span>}
          <div className="text-2xs text-gallery-mid truncate">{lead.name ? lead.email : ''}{lead.company && ` · ${lead.company}`}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-2xs">
            <span className="chip">{lead.room}</span>
            <span className="text-gallery-light self-center">{timeAgo(lead.at)}</span>
            {lead.inquired && <span className="chip chip-accent">inquired</span>}
            {lead.roomSeconds > 0 && <span className="chip">{duration(lead.roomSeconds)} in room</span>}
            {lead.artworkViews > 0 && <span className="chip">{lead.artworkViews} works</span>}
            {lead.newsletter && <span className="chip">newsletter</span>}
            {lead.followedUp && <span className="chip">followed up</span>}
          </div>
          {lead.artworks.length > 0 && <div className="text-2xs text-gallery-light mt-1 truncate">{lead.artworks.map((a) => a.title).filter(Boolean).join(' · ')}</div>}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveNote()} placeholder="What did you talk about?" className="input-field py-1.5 text-sm" disabled={!lead.personId} />
        <button type="button" onClick={saveNote} disabled={busy || !note.trim()} className="btn-secondary btn-sm">Save</button>
      </div>
      <div className="mt-2 flex gap-1 overflow-x-auto no-scrollbar">
        {PIPELINE_STAGES.slice(0, 5).map((s) => (
          <button key={s} type="button" disabled={!lead.personId} onClick={() => { setStage(s); patch({ Pipeline: s }); }} className={`chip shrink-0 ${stage === s ? 'chip-on' : ''}`}>{s}</button>
        ))}
      </div>
    </article>
  );
}

export default function FairPage() {
  const router = useRouter();
  const [days, setDays] = useState('14');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [room, setRoom] = useState('');
  const [selected, setSelected] = useState(new Set());

  const load = () => fetch(`/api/fair?days=${days}`).then((r) => r.json()).then((d) => { if (d.error) throw new Error(d.error); setData(d); }).catch((e) => setError(e.message));
  useEffect(() => { setData(null); load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);
  useEffect(() => { const id = setInterval(load, 60000); return () => clearInterval(id); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [days]);

  const leads = useMemo(() => (data?.leads || []).filter((l) => !room || l.room === room), [data, room]);
  const byDay = useMemo(() => {
    const out = [];
    for (const l of leads) {
      const k = dayLabel(l.at);
      if (!out.length || out[out.length - 1].k !== k) out.push({ k, items: [] });
      out[out.length - 1].items.push(l);
    }
    return out;
  }, [leads]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const followUp = () => router.push(`/campaigns/new?people=${[...selected].join(',')}&about=${encodeURIComponent(room || 'the fair')}`);

  return (
    <div className="max-w-3xl mx-auto">
      <BackLink href="/">Today</BackLink>
      <PageHeader
        title="Fair mode"
        sub={data ? `${data.leads.length} booth lead${data.leads.length === 1 ? '' : 's'} in ${days} days · updates every minute` : ' '}
        actions={<PushToggle compact />}
      />
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <Segmented value={days} onChange={setDays} options={[{ value: '3', label: '3 days' }, { value: '14', label: '2 weeks' }, { value: '60', label: '2 months' }]} />
        {data?.rooms?.length > 1 && (
          <select value={room} onChange={(e) => setRoom(e.target.value)} className="input-field w-auto py-1.5 text-sm">
            <option value="">All rooms</option>
            {data.rooms.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        )}
        <button type="button" className="btn-ghost ml-auto" onClick={() => setSelected(new Set(leads.filter((l) => l.personId && !l.followedUp).map((l) => l.personId)))}>Select not followed up</button>
      </div>

      {error && <div className="notice-danger mb-4">{error}</div>}
      {!data && !error && <div className="card"><SkeletonRows rows={4} /></div>}
      {data && leads.length === 0 && (
        <div className="card"><EmptyState title="No booth leads yet">When a visitor scans the QR at the stand and leaves their email, they appear here within a minute, and your phone buzzes if alerts are on.</EmptyState></div>
      )}

      <div className="space-y-6">
        {byDay.map((g) => (
          <section key={g.k}>
            <h2 className="eyebrow mb-2">{g.k} · {g.items.length}</h2>
            <div className="space-y-2">
              {g.items.map((l) => (
                <LeadCard key={`${l.email}-${l.at}`} lead={l} selected={!!l.personId && selected.has(l.personId)} onToggle={() => l.personId && toggle(l.personId)} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] sm:bottom-6 z-40 flex justify-center px-4">
          <div className="bg-gallery-black text-white shadow-pop flex items-center gap-3 pl-4 pr-2 py-2 text-sm">
            <span className="num">{selected.size} selected</span>
            <button type="button" className="px-3 py-1.5 bg-white text-gallery-black" onClick={followUp}>Write follow-up</button>
            <button type="button" className="px-2 py-1.5 text-white/70" onClick={() => setSelected(new Set())} aria-label="Clear"><Icon name="x" size={16} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
