'use client';
// Person page, 2.0. Everything about one collector in one place: what they
// looked at (with the works themselves), how long they spent in viewing
// rooms, every email both ways, pipeline, next action and notes.

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Avatar, ArtworkThumb, BackLink, Dot, EmptyState, Icon, SkeletonRows, Stat } from '@/components/ui';
import { PIPELINE_STAGES, duration, relativeDay, shortDate, signalOf, timeAgo, dueLabel, isOverdue } from '@/lib/format';

function formatPrice(n) {
  return typeof n === 'number' ? `€${n.toLocaleString('en-GB')}` : '';
}

async function patch(id, fields) {
  const res = await fetch(`/api/contacts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Could not save');
  return data.contact;
}

const TIMELINE_STEP = {
  'Inquire Click': 5, 'WhatsApp Click': 5, 'Artwork View': 4, Visit: 4,
  'Viewing Room Open': 3, 'PDF Download': 3, Click: 2, Open: 1,
};

function TimelineItem({ item }) {
  if (item.kind === 'mail') {
    return (
      <div className="flex gap-3 py-2.5">
        <Icon name="mail" size={16} className="text-gallery-mid mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-xs text-gallery-mid">{item.type}</div>
          <Link href={`/mail?thread=${item.threadId}`} className="text-sm hover:underline underline-offset-2 block truncate">{item.subject}</Link>
          {item.snippet && <p className="text-2xs text-gallery-light line-clamp-1">{item.snippet}</p>}
        </div>
        <span className="text-2xs text-gallery-light shrink-0">{shortDate(item.at)}</span>
      </div>
    );
  }
  const label = item.kind === 'visit' ? `Viewing room visit · ${duration(item.seconds)}` : signalOf(item.type).noun || item.type;
  const step = TIMELINE_STEP[item.type] || 1;
  return (
    <div className="flex gap-3 py-2.5">
      <Dot step={['Sent', 'Followed Up'].includes(item.type) ? 1 : step} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <div className="text-sm">
          {item.type === 'Sent' ? 'Received' : item.type === 'Followed Up' ? 'You followed up' : label}
          {item.artwork && <span className="text-gallery-mid"> · {item.artwork}</span>}
        </div>
        {item.campaign && <div className="text-2xs text-gallery-light truncate">{item.campaign}</div>}
      </div>
      <span className="text-2xs text-gallery-light shrink-0">{shortDate(item.at)}</span>
    </div>
  );
}

export default function PersonPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [c, setC] = useState(null); // contact record (editable copy)
  const [saving, setSaving] = useState('');
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({});
  const [timelineFilter, setTimelineFilter] = useState('all');

  useEffect(() => {
    fetch(`/api/contacts/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setC(d.contact);
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const save = async (fields, label = 'Saved') => {
    setSaving('…');
    try {
      const updated = await patch(id, fields);
      setC((prev) => ({ ...prev, ...updated }));
      setSaving(label);
      setTimeout(() => setSaving(''), 1800);
      window.dispatchEvent(new Event('diez:today-changed'));
    } catch (e) {
      setSaving(`Error: ${e.message}`);
    }
  };

  const addNote = async () => {
    if (!note.trim()) return;
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const entry = `[${date}] ${note.trim()}`;
    await save({ Notes: c.Notes ? `${entry}\n\n${c.Notes}` : entry }, 'Note added');
    setNote('');
  };

  const notes = useMemo(() => (c?.Notes ? c.Notes.split('\n\n').filter((n) => n.trim()) : []), [c?.Notes]);

  const timeline = useMemo(() => {
    const t = data?.timeline || [];
    if (timelineFilter === 'mail') return t.filter((i) => i.kind === 'mail');
    if (timelineFilter === 'rooms') return t.filter((i) => i.kind === 'visit' || ['Viewing Room Open', 'Artwork View', 'Inquire Click', 'WhatsApp Click', 'PDF Download'].includes(i.type));
    return t;
  }, [data, timelineFilter]);

  if (error) {
    return (
      <div>
        <BackLink href="/contacts">People</BackLink>
        <div className="notice-danger">Could not load this person: {error}</div>
      </div>
    );
  }

  if (!data || !c) {
    return (
      <div>
        <BackLink href="/contacts">People</BackLink>
        <div className="flex items-center gap-4 mb-8">
          <div className="skeleton h-14 w-14" />
          <div className="space-y-2 flex-1"><div className="skeleton h-5 w-1/3" /><div className="skeleton h-3 w-1/4" /></div>
        </div>
        <div className="card"><SkeletonRows rows={6} /></div>
      </div>
    );
  }

  const name = `${c['First Name'] || ''} ${c['Last Name'] || ''}`.trim() || c.Email || 'Unnamed';
  const types = Array.isArray(c.Type) ? c.Type : c.Type ? [c.Type] : [];
  const dne = !!c['Do Not Email'];

  return (
    <div className="max-w-6xl mx-auto">
      <BackLink href="/contacts">People</BackLink>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start gap-5 pb-6 mb-6 border-b border-gallery-border">
        <div className="flex items-start gap-4 flex-1 min-w-0">
          <Avatar name={name} size={56} />
          <div className="min-w-0">
            <h1 className="page-title">{name}</h1>
            <div className="mt-1 text-sm text-gallery-mid flex flex-wrap gap-x-2">
              {c.Company && <span>{c.Company}</span>}
              {c.City && <span>· {c.City}</span>}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {types.map((t) => <span key={t} className="chip">{t}</span>)}
              {dne && <span className="chip text-gallery-danger border-gallery-danger/30">Do not email</span>}
              <span className="text-2xs text-gallery-light ml-1">Last contact {relativeDay(data.lastContacted).toLowerCase()}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {c.Email && <a href={`mailto:${c.Email}`} className="text-gallery-mid hover:text-gallery-black">{c.Email}</a>}
              {c.Phone && <a href={`tel:${c.Phone}`} className="text-gallery-mid hover:text-gallery-black">{c.Phone}</a>}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 md:justify-end">
          {c.Email && <Link href={`/mail?to=${encodeURIComponent(c.Email)}`} className="btn-primary btn-sm"><Icon name="mail" size={14} /> Write</Link>}
          {!dne && <Link href={`/campaigns/new?people=${id}`} className="btn-secondary btn-sm"><Icon name="campaigns" size={14} /> Send campaign</Link>}
          <Link href={`/links?person=${id}`} className="btn-secondary btn-sm"><Icon name="link" size={14} /> Tracked link</Link>
        </div>
      </div>

      {saving && <div className="fixed right-4 top-16 z-50 bg-gallery-black text-white text-xs px-3 py-2 shadow-pop">{saving}</div>}

      {/* Open signals */}
      {data.signals.length > 0 && (
        <div className="card mb-6">
          <div className="card-head"><h2 className="eyebrow">Open signals</h2><Link href="/" className="text-2xs text-gallery-mid hover:text-gallery-black">On Today →</Link></div>
          {data.signals.map((s) => (
            <div key={s.key} className="row">
              <Dot step={signalOf(s.signal).step} />
              <div className="flex-1 min-w-0 text-sm">
                <span className={s.rank >= 5 ? 'text-gallery-accent' : ''}>{signalOf(s.signal).noun}</span>
                <span className="text-gallery-mid"> · {s.campaignName}</span>
              </div>
              <span className="text-2xs text-gallery-light">{timeAgo(s.lastActivity)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* ── Left ─────────────────────────────────────────────────────────── */}
        <div className="lg:col-span-2 space-y-6">
          {/* Pipeline */}
          <section className="card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="eyebrow">Pipeline</h3>
              <span className="text-2xs text-gallery-light">Score <span className="num text-gallery-black">{c['Engagement Score'] || 0}</span></span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE_STAGES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => save({ Pipeline: c.Pipeline === s ? null : s }, `Pipeline: ${c.Pipeline === s ? 'cleared' : s}`)}
                  className={`chip text-xs px-2.5 py-1 ${c.Pipeline === s ? 'chip-on' : 'hover:border-gallery-black'}`}
                >
                  {s}
                </button>
              ))}
            </div>
            <label className="block mt-4">
              <span className="eyebrow block mb-1.5">Interests</span>
              <textarea
                defaultValue={c.Interests || ''}
                onBlur={(e) => e.target.value !== (c.Interests || '') && save({ Interests: e.target.value }, 'Interests saved')}
                rows={3}
                className="input-field text-sm resize-none"
                placeholder="Works, artists, budget, what they collect…"
              />
            </label>
            {data.topArtists.length > 0 && (
              <p className="text-2xs text-gallery-mid mt-2">Looks most at: {data.topArtists.join(', ')}</p>
            )}
          </section>

          {/* Next action */}
          <section className="card p-4 sm:p-5">
            <h3 className="eyebrow mb-3">Next action</h3>
            <NextAction contact={c} onSave={save} />
          </section>

          {/* Notes */}
          <section className="card p-4 sm:p-5">
            <h3 className="eyebrow mb-3">Notes</h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNote(); }}
              rows={3}
              className="input-field text-sm resize-none mb-2"
              placeholder="Studio visit, what they said at the fair…"
            />
            <button type="button" onClick={addNote} disabled={!note.trim()} className="btn-primary btn-sm">Add note</button>
            <div className="mt-4 space-y-3">
              {notes.length === 0 && <p className="text-2xs text-gallery-light">No notes yet.</p>}
              {notes.map((n, i) => {
                const m = n.match(/^\[(.+?)\]\s*([\s\S]*)$/);
                return (
                  <div key={i} className="border-l border-gallery-border pl-3">
                    {m?.[1] && <div className="text-2xs text-gallery-light">{m[1]}</div>}
                    <div className="text-sm text-gallery-dark whitespace-pre-wrap break-words">{m?.[2] || n}</div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Details */}
          <section className="card p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="eyebrow">Details</h3>
              {!editing && (
                <button type="button" className="btn-ghost" onClick={() => { setDraft({ 'First Name': c['First Name'] || '', 'Last Name': c['Last Name'] || '', Email: c.Email || '', Phone: c.Phone || '', Company: c.Company || '', City: c.City || '' }); setEditing(true); }}>Edit</button>
              )}
            </div>
            {editing ? (
              <div className="space-y-2">
                {Object.keys(draft).map((k) => (
                  <label key={k} className="block">
                    <span className="text-2xs text-gallery-light">{k}</span>
                    <input className="input-field" value={draft[k]} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} />
                  </label>
                ))}
                <div className="flex gap-2 pt-1">
                  <button type="button" className="btn-primary btn-sm" onClick={async () => { await save(draft, 'Details saved'); setEditing(false); }}>Save</button>
                  <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <dl className="text-sm grid grid-cols-[90px_1fr] gap-y-1.5">
                {[['Email', c.Email], ['Phone', c.Phone], ['Company', c.Company], ['City', c.City]].map(([k, v]) => (
                  <div key={k} className="contents"><dt className="text-gallery-light text-xs pt-0.5">{k}</dt><dd className="break-words">{v || <span className="text-gallery-light">·</span>}</dd></div>
                ))}
              </dl>
            )}
            <label className="mt-4 pt-4 border-t border-gallery-border flex items-center justify-between gap-3 cursor-pointer">
              <span>
                <span className="text-sm block">Do not email</span>
                <span className="text-2xs text-gallery-light">Excluded from every campaign send</span>
              </span>
              <input type="checkbox" checked={dne} onChange={() => save({ 'Do Not Email': !dne }, dne ? 'Can be emailed again' : 'Marked do not email')} className="accent-gallery-black h-4 w-4" />
            </label>
          </section>
        </div>

        {/* ── Right ────────────────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Room visits" value={data.sessions.count} />
            <Stat label="Time in rooms" value={duration(data.sessions.totalSeconds)} hint={data.sessions.longestSeconds ? `longest ${duration(data.sessions.longestSeconds)}` : null} />
            <Stat label="Campaigns" value={data.campaigns.length} hint={`${data.campaigns.filter((x) => x.opened).length} opened`} />
          </div>

          {/* Artworks */}
          <section className="card">
            <div className="card-head"><h3 className="eyebrow">What they looked at</h3><span className="text-2xs text-gallery-light num">{data.artworks.length}</span></div>
            {data.artworks.length === 0 ? (
              <EmptyState title="No artwork views yet">Works they open in a viewing room show up here, with the image and status from the inventory.</EmptyState>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-px bg-gallery-border">
                {data.artworks.map((a) => (
                  <div key={a.id || a.title} className="bg-gallery-white p-3">
                    <ArtworkThumb id={a.id} title={a.title} fluid />
                    <div className="mt-2 text-sm leading-snug line-clamp-2">{a.title || 'Untitled'}</div>
                    {(a.artist || a.year) && <div className="text-2xs text-gallery-mid">{[a.artist, a.year].filter(Boolean).join(', ')}</div>}
                    <div className="mt-1 flex items-center gap-2 text-2xs">
                      {a.inquired && <span className="text-gallery-accent">Inquired</span>}
                      <span className="text-gallery-light">{a.views} view{a.views === 1 ? '' : 's'}</span>
                      {a.status && <span className="text-gallery-light">· {a.status}</span>}
                    </div>
                    {a.price != null && <div className="text-2xs text-gallery-mid num">{formatPrice(a.price)}</div>}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Campaigns */}
          {data.campaigns.length > 0 && (
            <section className="card">
              <div className="card-head"><h3 className="eyebrow">Campaigns received</h3></div>
              {data.campaigns.slice(0, 12).map((x) => (
                <Link key={x.id} href={`/campaigns/${x.id}`} className="row-link">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{x.name}</div>
                    <div className="text-2xs text-gallery-light">{shortDate(x.sentAt)}</div>
                  </div>
                  <div className="flex items-center gap-2 text-2xs text-gallery-mid shrink-0">
                    {x.inquired && <span className="text-gallery-accent">inquired</span>}
                    {x.room > 0 && <span>room</span>}
                    {x.clicked > 0 && <span>clicked</span>}
                    {x.opened > 0 ? <span>opened {x.opened}×</span> : <span className="text-gallery-light">not opened</span>}
                  </div>
                </Link>
              ))}
            </section>
          )}

          {/* Timeline */}
          <section className="card">
            <div className="card-head">
              <h3 className="eyebrow">Timeline</h3>
              <div className="flex gap-1">
                {[['all', 'All'], ['mail', 'Mail'], ['rooms', 'Rooms']].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => setTimelineFilter(v)} className={`chip ${timelineFilter === v ? 'chip-on' : ''}`}>{l}</button>
                ))}
              </div>
            </div>
            <div className="px-4 sm:px-5 divide-y divide-gallery-border">
              {timeline.length === 0 && <p className="py-6 text-sm text-gallery-light">Nothing here yet.</p>}
              {timeline.slice(0, 120).map((item, i) => <TimelineItem key={i} item={item} />)}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function NextAction({ contact, onSave }) {
  const [text, setText] = useState(contact['Next Action'] || '');
  const [date, setDate] = useState(contact['Next Action Date'] ? contact['Next Action Date'].slice(0, 10) : '');
  const current = contact['Next Action'];
  const quick = (days) => {
    const d = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
    setDate(d);
  };
  return (
    <div>
      {current && contact['Next Action Date'] && (
        <p className={`text-2xs mb-2 ${isOverdue(contact['Next Action Date']) ? 'text-gallery-danger' : 'text-gallery-mid'}`}>
          {dueLabel(contact['Next Action Date'])}
        </p>
      )}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="input-field text-sm resize-none mb-2" placeholder="Call about the studio visit…" />
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field w-auto text-sm" />
        {[[1, 'Tomorrow'], [7, '1 week'], [30, '1 month']].map(([d, l]) => (
          <button key={d} type="button" className="chip hover:border-gallery-black" onClick={() => quick(d)}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" className="btn-primary btn-sm" onClick={() => onSave({ 'Next Action': text, 'Next Action Date': date || null }, 'Next action saved')}>Save</button>
        {current && (
          <button type="button" className="btn-ghost" onClick={() => { setText(''); setDate(''); onSave({ 'Next Action': '', 'Next Action Date': null }, 'Cleared'); }}>Clear</button>
        )}
      </div>
    </div>
  );
}
