'use client';
// Pipeline board: drag people between stages (desktop) or pick a stage from
// the card (phone). Suggestions propose moves from engagement, but never
// move anyone on their own.

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import PeopleTabs from '@/components/PeopleTabs';
import { Avatar, PageHeader, SkeletonRows } from '@/components/ui';
import { PIPELINE_STAGES, relativeDay } from '@/lib/format';

const ACTIVE_STAGES = PIPELINE_STAGES.filter((s) => s !== 'Inactive');

function suggestionFor(p) {
  const s = p.engagementScore || 0;
  if ((!p.pipeline || p.pipeline === 'Prospect') && s >= 20) return 'Interested';
  if (!p.pipeline && s >= 8) return 'Warm';
  if (p.pipeline === 'Prospect' && s >= 8) return 'Warm';
  return null;
}

export default function PipelinePage() {
  const [people, setPeople] = useState(null);
  const [dragging, setDragging] = useState(null);
  const [over, setOver] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  const [flash, setFlash] = useState('');

  useEffect(() => {
    fetch('/api/contacts').then((r) => r.json()).then((d) => setPeople(d.people || [])).catch(() => setPeople([]));
  }, []);

  const move = async (id, stage) => {
    const prev = people.find((p) => p.id === id)?.pipeline;
    if (prev === stage) return;
    setPeople((list) => list.map((p) => (p.id === id ? { ...p, pipeline: stage } : p)));
    const res = await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Pipeline: stage || null }),
    });
    if (!res.ok) {
      setPeople((list) => list.map((p) => (p.id === id ? { ...p, pipeline: prev } : p)));
      setFlash('Could not move, try again');
    } else {
      setFlash(`Moved to ${stage}`);
    }
    setTimeout(() => setFlash(''), 1800);
  };

  const stages = showInactive ? PIPELINE_STAGES : ACTIVE_STAGES;
  const columns = useMemo(() => {
    const map = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, []]));
    for (const p of people || []) if (p.pipeline && map[p.pipeline]) map[p.pipeline].push(p);
    for (const s of Object.keys(map)) map[s].sort((a, b) => b.engagementScore - a.engagementScore);
    return map;
  }, [people]);

  const suggestions = useMemo(
    () => (people || []).map((p) => ({ p, to: suggestionFor(p) })).filter((x) => x.to && !x.p.doNotEmail).sort((a, b) => b.p.engagementScore - a.p.engagementScore).slice(0, 8),
    [people]
  );

  return (
    <div>
      <PageHeader
        title="People"
        sub="Pipeline: drag a card to move it"
        actions={
          <label className="flex items-center gap-2 text-xs text-gallery-mid cursor-pointer">
            <input type="checkbox" className="accent-gallery-black" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
          </label>
        }
      />
      <PeopleTabs />

      {suggestions.length > 0 && (
        <div className="card mb-5">
          <div className="card-head"><h2 className="eyebrow">Suggested moves</h2><span className="text-2xs text-gallery-light">from engagement score</span></div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar p-3">
            {suggestions.map(({ p, to }) => (
              <div key={p.id} className="border border-gallery-border p-3 w-56 shrink-0">
                <Link href={`/contacts/${p.id}`} className="text-sm hover:underline truncate block">{p.fullName || p.email}</Link>
                <div className="text-2xs text-gallery-mid">{p.pipeline || 'No stage'} → {to} · score {Math.round(p.engagementScore)}</div>
                <button type="button" className="btn-secondary btn-sm mt-2 w-full" onClick={() => move(p.id, to)}>Move to {to}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!people ? (
        <div className="card"><SkeletonRows rows={6} /></div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 sm:mx-0 sm:px-0 snap-x">
          {stages.map((stage) => (
            <div
              key={stage}
              onDragOver={(e) => { e.preventDefault(); setOver(stage); }}
              onDragLeave={() => setOver((o) => (o === stage ? null : o))}
              onDrop={(e) => { e.preventDefault(); setOver(null); if (dragging) move(dragging, stage); setDragging(null); }}
              className={`w-[260px] shrink-0 snap-start border ${over === stage ? 'border-gallery-black bg-gallery-white' : 'border-gallery-border bg-gallery-bg'} transition-colors`}
            >
              <div className="px-3 py-2.5 border-b border-gallery-border flex items-center justify-between">
                <span className="text-sm">{stage}</span>
                <span className="text-2xs num text-gallery-light">{columns[stage].length}</span>
              </div>
              <div className="p-2 space-y-2 min-h-[120px] max-h-[65vh] overflow-y-auto">
                {columns[stage].map((p) => (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={() => setDragging(p.id)}
                    onDragEnd={() => setDragging(null)}
                    className={`bg-gallery-white border border-gallery-border p-3 cursor-grab active:cursor-grabbing ${dragging === p.id ? 'opacity-40' : ''}`}
                  >
                    <div className="flex items-start gap-2">
                      <Avatar name={p.fullName || p.email} size={28} />
                      <div className="min-w-0 flex-1">
                        <Link href={`/contacts/${p.id}`} className="text-sm leading-tight hover:underline block truncate">{p.fullName || p.email}</Link>
                        <div className="text-2xs text-gallery-mid truncate">{p.company || p.city || p.types.join(', ')}</div>
                      </div>
                      <span className="text-2xs num text-gallery-mid">{Math.round(p.engagementScore)}</span>
                    </div>
                    {(p.artists.length > 0 || p.lastActive) && (
                      <div className="mt-2 text-2xs text-gallery-light truncate">
                        {p.lastActive && `Active ${relativeDay(p.lastActive).toLowerCase()}`}
                        {p.lastActive && p.artists.length > 0 && ' · '}
                        {p.artists[0]}
                      </div>
                    )}
                    {p.nextAction && <div className="mt-1 text-2xs text-gallery-dark line-clamp-2">→ {p.nextAction}</div>}
                    <select
                      value={p.pipeline}
                      onChange={(e) => move(p.id, e.target.value)}
                      className="sm:hidden mt-2 w-full text-xs border border-gallery-border bg-gallery-white px-2 py-1"
                      aria-label="Move to stage"
                    >
                      {PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                ))}
                {columns[stage].length === 0 && <p className="text-2xs text-gallery-light text-center py-6">Drop here</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      {flash && <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(84px+env(safe-area-inset-bottom))] sm:bottom-6 z-50 bg-gallery-black text-white text-sm px-4 py-2.5 shadow-pop">{flash}</div>}
    </div>
  );
}
