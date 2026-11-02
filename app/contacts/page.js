'use client';
// People, 2.0: one list with the filters that matter commercially
// (pipeline, warmth, who has a next action, what artists they look at),
// and a selection you can turn straight into a campaign.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PeopleTabs from '@/components/PeopleTabs';
import { Avatar, EmptyState, PageHeader, SkeletonRows, Icon } from '@/components/ui';
import { PIPELINE_STAGES, relativeDay, dueLabel, isOverdue } from '@/lib/format';

const SORTS = [
  ['score', 'Warmest'],
  ['active', 'Last active'],
  ['name', 'Name'],
  ['emailed', 'Least recently emailed'],
];

function ScoreBar({ score }) {
  const pct = Math.min(100, (score / 30) * 100);
  return (
    <div className="flex items-center gap-2 w-24">
      <div className="h-1 flex-1 bg-gallery-border">
        <div className={`h-1 ${score >= 15 ? 'bg-gallery-accent' : 'bg-gallery-black'}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-2xs num text-gallery-mid w-7 text-right">{Math.round(score)}</span>
    </div>
  );
}

export default function PeoplePage() {
  const router = useRouter();
  const [people, setPeople] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [types, setTypes] = useState([]);
  const [pipeline, setPipeline] = useState('');
  const [onlyDue, setOnlyDue] = useState(false);
  const [sort, setSort] = useState('score');
  const [selected, setSelected] = useState(new Set());
  const [visible, setVisible] = useState(80);
  const [recalc, setRecalc] = useState(null);

  const load = () =>
    fetch('/api/contacts')
      .then((r) => r.json())
      .then((d) => { if (d.error) throw new Error(d.error); setPeople(d.people); })
      .catch((e) => setError(e.message));

  useEffect(() => { load(); }, []);
  useEffect(() => setVisible(80), [q, types, pipeline, onlyDue, sort]);

  const typeOptions = useMemo(() => {
    const counts = {};
    for (const p of people || []) for (const t of p.types) counts[t] = (counts[t] || 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [people]);

  const filtered = useMemo(() => {
    let list = people || [];
    const term = q.trim().toLowerCase();
    if (term) list = list.filter((p) => [p.fullName, p.email, p.company, p.city, ...(p.artists || [])].some((v) => v?.toLowerCase().includes(term)));
    if (types.length) list = list.filter((p) => types.some((t) => p.types.includes(t)));
    if (pipeline) list = list.filter((p) => (pipeline === 'none' ? !p.pipeline : p.pipeline === pipeline));
    if (onlyDue) list = list.filter((p) => p.nextAction && p.nextActionDate);
    const by = {
      score: (a, b) => b.engagementScore - a.engagementScore,
      active: (a, b) => String(b.lastActive || '').localeCompare(String(a.lastActive || '')),
      name: (a, b) => (a.surname || a.fullName).localeCompare(b.surname || b.fullName),
      emailed: (a, b) => String(a.lastSent || '').localeCompare(String(b.lastSent || '')),
    }[sort];
    return [...list].sort(by);
  }, [people, q, types, pipeline, onlyDue, sort]);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAllVisible = () => {
    const ids = filtered.slice(0, visible).filter((p) => !p.doNotEmail).map((p) => p.id);
    const all = ids.every((id) => selected.has(id));
    setSelected((s) => { const n = new Set(s); ids.forEach((id) => (all ? n.delete(id) : n.add(id))); return n; });
  };

  const recalculate = async () => {
    setRecalc({ running: true });
    try {
      const report = await fetch('/api/scores/recalculate', { method: 'POST' }).then((r) => r.json());
      setRecalc(report);
      if (report.updated > 0) load();
    } catch (e) {
      setRecalc({ ok: false, message: e.message });
    }
  };

  return (
    <div>
      <PageHeader
        title="People"
        sub={people ? `${people.length} contacts · ${people.filter((p) => p.engagementScore >= 10).length} warm` : ' '}
        actions={
          <>
            <button type="button" onClick={recalculate} disabled={recalc?.running} className="btn-ghost" title="Recompute engagement scores now">
              {recalc?.running ? 'Recalculating…' : 'Recalculate scores'}
            </button>
          </>
        }
      />
      <PeopleTabs />

      {recalc && !recalc.running && (
        <div className={`${recalc.ok === false ? 'notice-danger' : 'notice-info'} mb-4 flex justify-between gap-3`}>
          <span>{recalc.message}</span>
          <button type="button" onClick={() => setRecalc(null)}><Icon name="x" size={14} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gallery-light" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, email, company, city, artist…" className="input-field pl-9" />
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="input-field w-auto text-sm">
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0 sm:flex-wrap">
          {typeOptions.map(([t, n]) => (
            <button key={t} type="button" onClick={() => setTypes((x) => (x.includes(t) ? x.filter((y) => y !== t) : [...x, t]))} className={`chip shrink-0 ${types.includes(t) ? 'chip-on' : 'hover:border-gallery-black'}`}>
              {t} <span className="opacity-60 num">{n}</span>
            </button>
          ))}
          <span className="w-px bg-gallery-border mx-1 shrink-0" />
          <select value={pipeline} onChange={(e) => setPipeline(e.target.value)} className="chip shrink-0 pr-6 bg-gallery-white">
            <option value="">Any stage</option>
            {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value="none">No stage</option>
          </select>
          <button type="button" onClick={() => setOnlyDue((v) => !v)} className={`chip shrink-0 ${onlyDue ? 'chip-on' : 'hover:border-gallery-black'}`}>Has next action</button>
        </div>
      </div>

      {error && <div className="notice-danger mb-4">{error}</div>}

      <div className="card">
        <div className="card-head">
          <label className="flex items-center gap-2 text-2xs text-gallery-mid cursor-pointer">
            <input type="checkbox" className="accent-gallery-black" onChange={toggleAllVisible} checked={filtered.length > 0 && filtered.slice(0, visible).filter((p) => !p.doNotEmail).every((p) => selected.has(p.id))} />
            <span className="num">{filtered.length}</span> shown
          </label>
          <span className="hidden md:flex gap-6 text-2xs text-gallery-light uppercase tracking-wider">
            <span className="w-24">Score</span><span className="w-24">Last active</span>
          </span>
        </div>
        {!people && !error && <SkeletonRows rows={10} />}
        {people && filtered.length === 0 && <EmptyState title="No one matches">Try fewer filters.</EmptyState>}
        {filtered.slice(0, visible).map((p) => (
          <div key={p.id} className={`row hover:bg-gallery-bg transition-colors ${selected.has(p.id) ? 'bg-gallery-bg' : ''}`}>
            <input type="checkbox" className="accent-gallery-black shrink-0" checked={selected.has(p.id)} disabled={p.doNotEmail} onChange={() => toggle(p.id)} aria-label={`Select ${p.fullName}`} />
            <Link href={`/contacts/${p.id}`} className="flex items-center gap-3 flex-1 min-w-0">
              <Avatar name={p.fullName || p.email} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm truncate">{p.fullName || p.email}</span>
                  {p.pipeline && <span className="chip hidden sm:inline-flex">{p.pipeline}</span>}
                  {p.doNotEmail && <span className="text-2xs text-gallery-danger">no email</span>}
                </div>
                <div className="text-2xs text-gallery-mid truncate">
                  {[p.company, p.city, p.types.join(', ')].filter(Boolean).join(' · ') || p.email}
                </div>
                {(p.artists.length > 0 || p.nextAction) && (
                  <div className="text-2xs mt-0.5 truncate">
                    {p.nextAction && <span className={isOverdue(p.nextActionDate) ? 'text-gallery-danger' : 'text-gallery-dark'}>{p.nextActionDate ? `${dueLabel(p.nextActionDate)}: ` : ''}{p.nextAction}</span>}
                    {p.nextAction && p.artists.length > 0 && <span className="text-gallery-light"> · </span>}
                    {p.artists.length > 0 && <span className="text-gallery-light">Looks at {p.artists.join(', ')}</span>}
                  </div>
                )}
              </div>
              <div className="hidden md:block"><ScoreBar score={p.engagementScore} /></div>
              <div className="hidden md:block w-24 text-2xs text-gallery-mid text-right">{p.lastActive ? relativeDay(p.lastActive) : <span className="text-gallery-light">·</span>}</div>
              <div className="md:hidden text-2xs num text-gallery-mid">{Math.round(p.engagementScore)}</div>
            </Link>
          </div>
        ))}
        {filtered.length > visible && (
          <button type="button" onClick={() => setVisible((v) => v + 120)} className="w-full py-3 text-xs text-gallery-mid hover:text-gallery-black border-t border-gallery-border">
            Show more ({filtered.length - visible} left)
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] sm:bottom-6 z-40 flex justify-center px-4">
          <div className="bg-gallery-black text-white shadow-pop flex items-center gap-3 pl-4 pr-2 py-2 text-sm">
            <span className="num">{selected.size} selected</span>
            <button type="button" className="px-3 py-1.5 bg-white text-gallery-black" onClick={() => router.push(`/campaigns/new?people=${[...selected].join(',')}`)}>
              Send campaign
            </button>
            <button type="button" className="px-2 py-1.5 text-white/70 hover:text-white" onClick={() => setSelected(new Set())} aria-label="Clear selection">
              <Icon name="x" size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
