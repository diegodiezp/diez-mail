'use client';
// Today: the first screen of 2.0. Who did something worth answering, what
// is due, and (when a fair is on) the booth leads. Every card can be
// answered, marked done or snoozed without leaving the page.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ActivityFeed from '@/components/ActivityFeed';
import PushToggle from '@/components/PushToggle';
import { PageHeader, Segmented, Avatar, Dot, EmptyState, SkeletonRows, ArtworkThumb, Icon } from '@/components/ui';
import { signalOf, timeAgo, dueLabel, duration } from '@/lib/format';

const PAGE = 8;

function todayTitle() {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

async function post(body) {
  const res = await fetch('/api/today/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Request failed');
  window.dispatchEvent(new Event('diez:today-changed'));
  return res.json();
}

function replyHref(s) {
  const subject = s.campaignSubject ? `Re: ${s.campaignSubject}` : '';
  const params = new URLSearchParams({ to: s.email });
  if (subject) params.set('subject', subject);
  return `/mail?${params.toString()}`;
}

function SignalCard({ s, onDone, onSnooze }) {
  const meta = signalOf(s.signal);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const facts = [];
  if (s.counts.inquiries) facts.push(`${s.counts.inquiries} inquir${s.counts.inquiries > 1 ? 'ies' : 'y'}`);
  if (s.longestVisit >= 30) facts.push(`${duration(s.roomSeconds)} in the room`);
  if (s.counts.artworkViews) facts.push(`${s.counts.artworkViews} artwork view${s.counts.artworkViews > 1 ? 's' : ''}`);
  if (s.counts.pdf) facts.push('PDF');
  if (s.counts.clicks) facts.push(`${s.counts.clicks} click${s.counts.clicks > 1 ? 's' : ''}`);
  if (s.counts.opens) facts.push(`opened ${s.counts.opens}×`);

  return (
    <article className="card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <Avatar name={s.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {s.personId ? (
              <Link href={`/contacts/${s.personId}`} className="text-[15px] hover:underline underline-offset-2 truncate">{s.name}</Link>
            ) : (
              <span className="text-[15px] truncate">{s.name}</span>
            )}
            {s.company && <span className="text-xs text-gallery-mid truncate">{s.company}</span>}
            {s.pipeline && <span className="chip">{s.pipeline}</span>}
          </div>
          <div className="mt-1 flex items-start gap-2 text-sm">
            <Dot step={meta.step} className="mt-1.5" />
            <p className="text-gallery-dark leading-snug">
              <span className={s.rank >= 5 ? 'text-gallery-accent' : ''}>{meta.noun}</span>
              <span className="text-gallery-mid"> · {s.campaignName}</span>
            </p>
          </div>
          <div className="mt-1 text-2xs text-gallery-light">
            {timeAgo(s.lastActivity)}{facts.length > 0 && <> · {facts.join(' · ')}</>}
          </div>
        </div>
      </div>

      {s.artworks.length > 0 && (
        <div className="mt-4 flex gap-3 overflow-x-auto no-scrollbar -mx-1 px-1">
          {s.artworks.slice(0, 4).map((a) => (
            <div key={a.id || a.title} className="w-[92px] shrink-0">
              <ArtworkThumb id={a.id} title={a.title} size={92} />
              <div className="mt-1.5 text-2xs leading-tight text-gallery-dark line-clamp-2">{a.title || 'Untitled'}</div>
              <div className="text-2xs text-gallery-light">
                {a.inquired ? <span className="text-gallery-accent">inquired</span> : `${a.views} view${a.views === 1 ? '' : 's'}`}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <Link href={replyHref(s)} className="btn-primary btn-sm">
          <Icon name="reply" size={14} /> Reply
        </Link>
        <button type="button" onClick={() => onDone(s)} className="btn-secondary btn-sm">
          <Icon name="check" size={14} /> Done
        </button>
        <div className="relative">
          <button type="button" onClick={() => setSnoozeOpen((o) => !o)} className="btn-ghost" disabled={!s.personId}>
            <Icon name="clock" size={14} /> Later
          </button>
          {snoozeOpen && (
            <div className="absolute z-20 left-0 top-9 card shadow-pop min-w-[160px]" onMouseLeave={() => setSnoozeOpen(false)}>
              {[[2, 'In 2 days'], [7, 'Next week'], [21, 'In 3 weeks']].map(([d, label]) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => { setSnoozeOpen(false); onSnooze(s, d); }}
                  className="w-full text-left px-4 py-2.5 text-sm hover:bg-gallery-bg border-b border-gallery-border last:border-0"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function DueList({ items, onDone, onSnooze }) {
  if (items.length === 0) {
    return <EmptyState title="Nothing due">Next actions you set on a person appear here when their date comes up.</EmptyState>;
  }
  return (
    <div>
      {items.map((d) => (
        <div key={d.personId} className="row items-start">
          <Avatar name={d.name} size={32} />
          <div className="min-w-0 flex-1">
            <Link href={`/contacts/${d.personId}`} className="text-sm hover:underline underline-offset-2">{d.name}</Link>
            <p className="text-xs text-gallery-dark mt-0.5 whitespace-pre-wrap break-words">{d.action}</p>
            <div className={`text-2xs mt-1 ${d.overdue ? 'text-gallery-danger' : 'text-gallery-light'}`}>{dueLabel(d.date)}</div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <button type="button" onClick={() => onDone(d)} className="btn-ghost" title="Done">
              <Icon name="check" size={14} /> Done
            </button>
            <button type="button" onClick={() => onSnooze(d, 3)} className="btn-ghost" title="Move 3 days">
              +3d
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TodayPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [view, setView] = useState('signals');
  const [toast, setToast] = useState('');

  const load = useCallback(() => {
    fetch('/api/today')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        setData(d);
        setError('');
      })
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (m) => {
    setToast(m);
    setTimeout(() => setToast(''), 2500);
  };

  const removeSignal = (key) => setData((d) => ({ ...d, signals: d.signals.filter((x) => x.key !== key) }));
  const removeDue = (id) => setData((d) => ({ ...d, due: d.due.filter((x) => x.personId !== id) }));

  const onDone = async (s) => {
    removeSignal(s.key);
    try { await post({ action: 'done', email: s.email, campaignId: s.campaignId }); flash('Marked as followed up'); }
    catch (e) { flash(e.message); load(); }
  };
  const onSnooze = async (s, days) => {
    removeSignal(s.key);
    try {
      await post({ action: 'snooze', email: s.email, campaignId: s.campaignId, personId: s.personId, days, label: s.campaignName });
      flash(`Back on Today ${days === 7 ? 'next week' : `in ${days} days`}`);
      load();
    } catch (e) { flash(e.message); load(); }
  };
  const onDueDone = async (d) => {
    removeDue(d.personId);
    try { await post({ action: 'dueDone', personId: d.personId }); flash('Done, saved in their notes'); }
    catch (e) { flash(e.message); load(); }
  };
  const onDueSnooze = async (d, days) => {
    try { await post({ action: 'dueSnooze', personId: d.personId, days }); flash(`Moved ${days} days`); load(); }
    catch (e) { flash(e.message); }
  };

  // Long lists bury the point of Today: the strongest few go first, the rest
  // load on request. Opens and clicks stay folded until asked for.
  const [hotShown, setHotShown] = useState(PAGE);
  const [warmShown, setWarmShown] = useState(0);
  const hot = useMemo(() => (data?.signals || []).filter((s) => s.rank >= 4), [data]);
  const warm = useMemo(() => (data?.signals || []).filter((s) => s.rank < 4), [data]);
  const urgentDue = (data?.due || []).filter((d) => d.overdue || d.today).length;

  return (
    <div>
      <PageHeader
        eyebrow={todayTitle()}
        title="Today"
        sub={data ? summaryLine(data) : ' '}
        actions={<PushToggle />}
      />

      {data?.fair?.count > 0 && (
        <Link href="/fair" className="card flex items-center gap-3 px-4 sm:px-5 py-3 mb-5 hover:border-gallery-black transition-colors">
          <Icon name="fair" size={18} />
          <span className="text-sm flex-1">
            <span className="num">{data.fair.count}</span> booth lead{data.fair.count > 1 ? 's' : ''} this week
            {data.fair.latest.length > 0 && <span className="text-gallery-mid"> · {data.fair.latest.join(', ')}</span>}
          </span>
          <span className="text-xs text-gallery-mid">Fair mode</span>
          <Icon name="arrow" size={14} className="text-gallery-mid" />
        </Link>
      )}

      <div className="mb-5 lg:hidden">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'signals', label: 'Signals', count: hot.length },
            { value: 'due', label: 'Due', count: urgentDue },
            { value: 'activity', label: 'Activity' },
          ]}
        />
      </div>

      {error && <div className="notice-danger mb-5">Could not load Today: {error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Signals */}
        <section className={`lg:col-span-2 space-y-6 ${view === 'signals' ? '' : 'hidden lg:block'}`}>
          {!data && !error && <div className="card"><SkeletonRows rows={5} /></div>}
          {data && data.signals.length === 0 && (
            <div className="card">
              <EmptyState title="All caught up">
                When someone opens, clicks, browses a viewing room or inquires, they appear here until you follow up.
              </EmptyState>
            </div>
          )}
          {hot.length > 0 && (
            <div>
              <h2 className="eyebrow mb-3">Act now · {hot.length}</h2>
              <div className="space-y-3">
                {hot.slice(0, hotShown).map((s) => <SignalCard key={s.key} s={s} onDone={onDone} onSnooze={onSnooze} />)}
              </div>
              {hot.length > hotShown && (
                <button type="button" className="btn-secondary w-full mt-3 justify-center" onClick={() => setHotShown((n) => n + PAGE)}>
                  Show {Math.min(PAGE, hot.length - hotShown)} more of {hot.length - hotShown}
                </button>
              )}
            </div>
          )}
          {warm.length > 0 && (
            <div>
              <h2 className="eyebrow mb-3">Warming up · {warm.length}</h2>
              <div className="space-y-3">
                {warm.slice(0, warmShown).map((s) => <SignalCard key={s.key} s={s} onDone={onDone} onSnooze={onSnooze} />)}
              </div>
              {warm.length > warmShown && (
                <button type="button" className="btn-secondary w-full mt-3 justify-center" onClick={() => setWarmShown((n) => n + PAGE)}>
                  {warmShown === 0 ? `Show ${warm.length} opens and clicks` : `Show ${Math.min(PAGE, warm.length - warmShown)} more of ${warm.length - warmShown}`}
                </button>
              )}
            </div>
          )}
        </section>

        {/* Due + activity */}
        <aside className={`space-y-6 ${view === 'signals' ? 'hidden lg:block' : ''}`}>
          <div className={`card ${view === 'activity' ? 'hidden lg:block' : ''}`}>
            <div className="card-head">
              <h2 className="eyebrow">Due</h2>
              <span className="text-2xs text-gallery-light num">{data?.due?.length || 0}</span>
            </div>
            {!data ? <SkeletonRows rows={3} /> : <DueList items={data.due} onDone={onDueDone} onSnooze={onDueSnooze} />}
          </div>

          <div className={view === 'due' ? 'hidden lg:block' : ''}>
            <h2 className="eyebrow mb-3">All activity</h2>
            <ActivityFeed />
          </div>
        </aside>
      </div>

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(84px+env(safe-area-inset-bottom))] sm:bottom-6 z-50 bg-gallery-black text-white text-sm px-4 py-2.5 shadow-pop">
          {toast}
        </div>
      )}
    </div>
  );
}

function summaryLine(d) {
  const parts = [];
  const hot = d.signals.filter((s) => s.rank >= 4).length;
  if (hot) parts.push(`${hot} to act on now`);
  const warm = d.signals.length - hot;
  if (warm) parts.push(`${warm} warming up`);
  const overdue = d.due.filter((x) => x.overdue).length;
  if (overdue) parts.push(`${overdue} overdue`);
  return parts.length ? parts.join(' · ') : 'Nothing waiting on you.';
}
