'use client';
// ⌘K / Ctrl+K: jump to any person, campaign or screen from anywhere.
// The index (people + campaigns, a few fields each) is fetched on first open
// and kept for the session.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Icon } from './ui';

const ACTIONS = [
  { kind: 'action', label: 'New campaign', href: '/campaigns/new', keywords: 'send email compose' },
  { kind: 'action', label: 'Today', href: '/', keywords: 'signals follow ups home' },
  { kind: 'action', label: 'Fair mode', href: '/fair', keywords: 'booth leads qr art cologne playground' },
  { kind: 'action', label: 'People', href: '/contacts', keywords: 'contacts collectors list' },
  { kind: 'action', label: 'Pipeline board', href: '/contacts/pipeline', keywords: 'kanban stages deals' },
  { kind: 'action', label: 'Works and who looked at them', href: '/works', keywords: 'artworks interest viewers' },
  { kind: 'action', label: 'Data hygiene', href: '/contacts/hygiene', keywords: 'duplicates missing names bounced cleanup' },
  { kind: 'action', label: 'Tracked links', href: '/links', keywords: 'whatsapp short link manual' },
  { kind: 'action', label: 'Campaigns', href: '/campaigns', keywords: 'reports stats' },
  { kind: 'action', label: 'Templates', href: '/campaigns/templates', keywords: 'saved emails' },
  { kind: 'action', label: 'Mail', href: '/mail', keywords: 'inbox gmail' },
];

function normalize(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export default function CommandPalette() {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [index, setIndex] = useState(null);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const show = useCallback(() => {
    setOpen(true);
    setQ('');
    setCursor(0);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        setQ('');
        setCursor(0);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('diez:palette', show);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('diez:palette', show);
    };
  }, [show]);

  useEffect(() => {
    if (!open) return;
    setTimeout(() => inputRef.current?.focus(), 10);
    if (!index) {
      fetch('/api/search-index')
        .then((r) => (r.ok ? r.json() : { people: [], campaigns: [] }))
        .then(setIndex)
        .catch(() => setIndex({ people: [], campaigns: [] }));
    }
  }, [open, index]);

  useEffect(() => setOpen(false), [pathname]);

  const results = useMemo(() => {
    const term = normalize(q.trim());
    const people = (index?.people || []).map((p) => ({
      kind: 'person', label: p.name || p.email, sub: [p.company, p.email].filter(Boolean).join(' · '),
      href: `/contacts/${p.id}`, hay: normalize(`${p.name} ${p.email} ${p.company} ${p.city}`),
    }));
    const campaigns = (index?.campaigns || []).map((c) => ({
      kind: 'campaign', label: c.name, sub: c.date || '', href: `/campaigns/${c.id}`, hay: normalize(c.name),
    }));
    const actions = ACTIONS.map((a) => ({ ...a, hay: normalize(`${a.label} ${a.keywords}`) }));
    if (!term) return [...actions.slice(0, 7)];
    const words = term.split(/\s+/);
    const match = (item) => words.every((w) => item.hay.includes(w));
    return [
      ...actions.filter(match).slice(0, 4),
      ...people.filter(match).slice(0, 8),
      ...campaigns.filter(match).slice(0, 5),
    ];
  }, [q, index]);

  useEffect(() => setCursor(0), [q]);

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-i="${cursor}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  const go = (item) => {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh] bg-gallery-black/30" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg bg-gallery-white border border-gallery-border shadow-pop"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Search"
      >
        <div className="flex items-center gap-3 px-4 border-b border-gallery-border">
          <Icon name="search" size={18} className="text-gallery-light" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => Math.min(c + 1, results.length - 1)); }
              if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
              if (e.key === 'Enter') { e.preventDefault(); go(results[cursor]); }
            }}
            placeholder="Search people, campaigns, screens..."
            className="flex-1 h-12 bg-transparent outline-none text-[15px] placeholder:text-gallery-light"
          />
          <kbd className="hidden sm:inline text-2xs text-gallery-light border border-gallery-border px-1">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
          {!index && q && <div className="px-4 py-3 text-xs text-gallery-light">Loading…</div>}
          {index && results.length === 0 && <div className="px-4 py-6 text-sm text-gallery-mid text-center">No matches</div>}
          {results.map((r, i) => (
            <button
              key={`${r.kind}-${r.href}-${i}`}
              data-i={i}
              type="button"
              onMouseEnter={() => setCursor(i)}
              onClick={() => go(r)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${i === cursor ? 'bg-gallery-bg' : ''}`}
            >
              <span className="w-16 text-2xs uppercase tracking-wider text-gallery-light shrink-0">
                {r.kind === 'action' ? 'Go to' : r.kind}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm truncate">{r.label}</span>
                {r.sub && <span className="block text-2xs text-gallery-mid truncate">{r.sub}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
