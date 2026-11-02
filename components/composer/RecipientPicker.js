'use client';
// Composer recipients: search, type chips, deeper filters (stage, warmth,
// city, artist they looked at, not emailed lately, recently active), saved
// segments, and "select all matching". Selection is keyed by email so it
// survives any filter change.

import { useMemo, useState } from 'react';
import { EMPTY_FILTERS, describe, isEmpty, matches, normalizeFilters } from '@/lib/segments';
import { PIPELINE_STAGES } from '@/lib/format';
import { Icon } from '@/components/ui';

export default function RecipientPicker({
  people, loading, selected, setSelected, alreadySent, filters, setFilters,
  segments, onSaveSegment, onDeleteSegment, artists,
}) {
  const [q, setQ] = useState('');
  const [more, setMore] = useState(false);
  const [warmFirst, setWarmFirst] = useState(false);
  const [onlySelected, setOnlySelected] = useState(false);
  const f = normalizeFilters(filters);

  const typeCounts = useMemo(() => {
    const c = {};
    for (const p of people) for (const t of p.types || []) c[t] = (c[t] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [people]);

  const matching = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = people.filter((p) => matches(p, f));
    if (term) list = list.filter((p) => [p.fullName, p.email, p.company, p.city].some((v) => v?.toLowerCase().includes(term)));
    if (onlySelected) list = list.filter((p) => selected.has(p.email));
    if (warmFirst) list = [...list].sort((a, b) => b.engagementScore - a.engagementScore);
    return list;
  }, [people, f, q, warmFirst, onlySelected, selected]);

  const selectable = matching.filter((p) => !p.doNotEmail && !alreadySent.has(p.email.toLowerCase()));
  const allMatchingSelected = selectable.length > 0 && selectable.every((p) => selected.has(p.email));

  const set = (patch) => setFilters({ ...f, ...patch });
  const toggleIn = (key, value) => set({ [key]: f[key].includes(value) ? f[key].filter((x) => x !== value) : [...f[key], value] });
  const toggle = (email) => setSelected((s) => { const n = new Set(s); n.has(email) ? n.delete(email) : n.add(email); return n; });
  const selectMatching = () => setSelected((s) => { const n = new Set(s); selectable.forEach((p) => (allMatchingSelected ? n.delete(p.email) : n.add(p.email))); return n; });

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-3 border-b border-gallery-border space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="eyebrow">Recipients</span>
          <span className="text-xs num">{selected.size} selected</span>
        </div>
        <div className="relative">
          <Icon name="search" size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gallery-light" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="input-field pl-8 py-1.5 text-sm" />
        </div>

        {segments.length > 0 && (
          <select
            className="input-field py-1.5 text-sm"
            value=""
            onChange={(e) => { const s = segments.find((x) => x.id === e.target.value); if (s) setFilters(normalizeFilters(s.filters)); }}
          >
            <option value="">Apply a saved segment…</option>
            {segments.map((s) => <option key={s.id} value={s.id}>{s.name} · {describe(s.filters)}</option>)}
          </select>
        )}

        <div className="flex flex-wrap gap-1">
          {typeCounts.map(([t, n]) => (
            <button key={t} type="button" onClick={() => toggleIn('types', t)} className={`chip ${f.types.includes(t) ? 'chip-on' : 'hover:border-gallery-black'}`}>
              {t} <span className="opacity-60 num">{n}</span>
            </button>
          ))}
        </div>

        <button type="button" onClick={() => setMore((m) => !m)} className="text-xs text-gallery-mid hover:text-gallery-black">
          {more ? '− Fewer filters' : '+ More filters'}
          {!isEmpty({ ...f, types: [] }) && !more && <span className="text-gallery-accent"> · active</span>}
        </button>

        {more && (
          <div className="space-y-2.5 pt-1">
            <div>
              <div className="text-2xs text-gallery-light mb-1">Stage</div>
              <div className="flex flex-wrap gap-1">
                {[...PIPELINE_STAGES, '(none)'].map((s) => (
                  <button key={s} type="button" onClick={() => toggleIn('stages', s)} className={`chip ${f.stages.includes(s) ? 'chip-on' : ''}`}>{s === '(none)' ? 'No stage' : s}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-2xs text-gallery-light">Score at least
                <select className="input-field py-1 text-sm mt-0.5" value={f.minScore} onChange={(e) => set({ minScore: Number(e.target.value) })}>
                  {[0, 3, 5, 10, 20].map((n) => <option key={n} value={n}>{n ? n : 'Any'}</option>)}
                </select>
              </label>
              <label className="text-2xs text-gallery-light">City
                <input className="input-field py-1 text-sm mt-0.5" value={f.city} onChange={(e) => set({ city: e.target.value })} placeholder="Any" />
              </label>
              <label className="text-2xs text-gallery-light col-span-2">Looked at works by
                <select className="input-field py-1 text-sm mt-0.5" value={f.artist} onChange={(e) => set({ artist: e.target.value })}>
                  <option value="">Any artist</option>
                  {artists.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label className="text-2xs text-gallery-light">Not emailed in
                <select className="input-field py-1 text-sm mt-0.5" value={f.notEmailedDays} onChange={(e) => set({ notEmailedDays: Number(e.target.value) })}>
                  {[0, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{n ? `${n} days` : 'Any'}</option>)}
                </select>
              </label>
              <label className="text-2xs text-gallery-light">Active in last
                <select className="input-field py-1 text-sm mt-0.5" value={f.activeDays} onChange={(e) => set({ activeDays: Number(e.target.value) })}>
                  {[0, 7, 30, 90].map((n) => <option key={n} value={n}>{n ? `${n} days` : 'Any'}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center gap-3">
              {!isEmpty(f) && <button type="button" className="text-xs text-gallery-mid hover:text-gallery-black" onClick={() => setFilters({ ...EMPTY_FILTERS })}>Reset filters</button>}
              {!isEmpty(f) && (
                <button
                  type="button"
                  className="text-xs text-gallery-mid hover:text-gallery-black"
                  onClick={() => { const name = window.prompt('Name this segment', describe(f)); if (name) onSaveSegment(name, f); }}
                >
                  Save as segment
                </button>
              )}
            </div>
            {segments.length > 0 && (
              <details className="text-2xs text-gallery-light">
                <summary className="cursor-pointer">Manage segments</summary>
                {segments.map((s) => (
                  <div key={s.id} className="flex items-center justify-between py-1">
                    <span className="truncate">{s.name}</span>
                    <button type="button" className="hover:text-gallery-danger" onClick={() => window.confirm(`Delete segment "${s.name}"?`) && onDeleteSegment(s.id)}>Delete</button>
                  </div>
                ))}
              </details>
            )}
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-b border-gallery-border flex items-center gap-3 text-xs">
        <button type="button" onClick={selectMatching} className="text-gallery-black hover:underline" disabled={!selectable.length}>
          {allMatchingSelected ? 'Unselect' : 'Select'} {selectable.length} matching
        </button>
        <button type="button" onClick={() => setWarmFirst((w) => !w)} className={warmFirst ? 'text-gallery-accent' : 'text-gallery-mid hover:text-gallery-black'}>Warmest first</button>
        <button type="button" onClick={() => setOnlySelected((v) => !v)} className={onlySelected ? 'text-gallery-black' : 'text-gallery-mid hover:text-gallery-black'}>Selected</button>
        {selected.size > 0 && <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-gallery-light hover:text-gallery-black">Clear</button>}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && <div className="p-6 text-center text-xs text-gallery-light">Loading people…</div>}
        {!loading && matching.length === 0 && <div className="p-6 text-center text-xs text-gallery-light">No one matches</div>}
        {matching.slice(0, 600).map((p) => {
          const sent = alreadySent.has(p.email.toLowerCase());
          const off = p.doNotEmail || sent;
          return (
            <label
              key={p.email}
              className={`flex items-center gap-2.5 px-3 py-2 border-b border-gallery-border ${off ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-gallery-bg'} ${selected.has(p.email) ? 'bg-gallery-bg' : ''}`}
            >
              <input type="checkbox" className="accent-gallery-black shrink-0" checked={selected.has(p.email)} disabled={off} onChange={() => !off && toggle(p.email)} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm truncate">{p.fullName || p.email}</span>
                <span className="block text-2xs text-gallery-mid truncate">{p.company || p.email}</span>
              </span>
              <span className="text-2xs shrink-0 text-right">
                {p.doNotEmail ? <span className="text-gallery-danger">no email</span>
                  : sent ? <span className="text-gallery-light">received</span>
                  : !p.name ? <span className="text-gallery-warn">no name</span>
                  : p.engagementScore >= 10 ? <span className="num text-gallery-mid">{Math.round(p.engagementScore)}</span> : null}
              </span>
            </label>
          );
        })}
        {matching.length > 600 && <div className="p-3 text-center text-2xs text-gallery-light">Showing 600 of {matching.length}. “Select matching” includes all of them.</div>}
      </div>
    </div>
  );
}
