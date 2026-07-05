'use client';

import { useState, useEffect } from 'react';

// ── Client-side cache for closed days ────────────────────────────────────
// Los días ya pasados son inmutables (un evento nuevo siempre tiene
// timestamp de ahora), así que los guardamos en localStorage y solo
// pedimos a la API lo ocurrido desde el último día cerrado.
const CACHE_KEY = 'diez-activity-v1';
const CACHE_MAX_ITEMS = 1000;

function startOfTodayISO() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).toISOString();
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(items, lastClosedDay) {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ items: items.slice(0, CACHE_MAX_ITEMS), lastClosedDay })
    );
  } catch {
    // localStorage lleno o bloqueado: el feed sigue funcionando sin caché
  }
}

// Merge con deduplicación por id de evento, ordenado desc por timestamp
function mergeFeeds(fresh, cached) {
  const seen = new Set();
  const merged = [];
  for (const item of [...fresh, ...cached]) {
    if (!item || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  merged.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  return merged;
}

// ── Relative time helper ──────────────────────────────────────────────────
function timeAgo(iso) {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - then);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function fullDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Verb phrase used in the headline (followed by the campaign name)
function actionLabel(type) {
  switch (type) {
    case 'Open':              return 'opened';
    case 'Click':             return 'clicked a link in';
    case 'Viewing Room Open': return 'opened the viewing room of';
    case 'Artwork View':      return 'viewed an artwork in';
    case 'Inquire Click':     return 'inquired from';
    default:                  return 'engaged with';
  }
}

// Standalone noun used in the expanded per-event list (no object follows)
function eventNoun(type) {
  switch (type) {
    case 'Open':              return 'Opened';
    case 'Click':             return 'Clicked link';
    case 'Viewing Room Open': return 'Viewing room';
    case 'Artwork View':      return 'Artwork view';
    case 'Inquire Click':     return 'Inquiry';
    default:                  return type;
  }
}

// Short verb used in the per-type count breakdown line
function shortLabel(type, count) {
  switch (type) {
    case 'Open':              return `opened ${count}`;
    case 'Click':             return `clicked ${count}`;
    case 'Viewing Room Open': return `viewing room ${count}`;
    case 'Artwork View':      return `artwork views ${count}`;
    case 'Inquire Click':     return `inquiries ${count}`;
    default:                  return `${type.toLowerCase()} ${count}`;
  }
}

function dotClass(type) {
  switch (type) {
    case 'Inquire Click':     return 'bg-gallery-success';
    case 'Artwork View':      return 'bg-gallery-black';
    case 'Viewing Room Open': return 'bg-gallery-black';
    case 'Click':             return 'bg-gallery-mid';
    default:                  return 'bg-gallery-border';
  }
}

// Signal ranking: the headline + dot reflect the strongest action in the group
const SIGNAL_RANK = {
  'Inquire Click': 5,
  'Artwork View': 4,
  'Viewing Room Open': 3,
  'Click': 2,
  'Open': 1,
};

// Group feed items by calendar day for light visual separation
function dayKey(iso) {
  if (!iso) return 'Earlier';
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startYesterday = new Date(startToday); startYesterday.setDate(startYesterday.getDate() - 1);
  if (d >= startToday) return 'Today';
  if (d >= startYesterday) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' });
}

// Collapse a day's events into one card per (who + campaign).
// The feed arrives newest-first, so first-seen order = newest-first per group.
function collapse(items) {
  const groups = [];
  const byKey = new Map();

  for (const item of items) {
    const key = `${item.who}||${item.campaign || ''}`;
    let g = byKey.get(key);
    if (!g) {
      g = {
        key,
        who: item.who,
        campaign: item.campaign,
        latest: item.timestamp,
        events: [],
        counts: {},      // type -> count
        artworks: new Set(),
      };
      byKey.set(key, g);
      groups.push(g);
    }
    g.events.push(item);
    g.counts[item.type] = (g.counts[item.type] || 0) + 1;
    if (item.artwork) g.artworks.add(item.artwork);
    if (new Date(item.timestamp) > new Date(g.latest)) g.latest = item.timestamp;
  }

  // Each group's events newest-first; pick the primary (highest-signal) type
  for (const g of groups) {
    g.events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    g.total = g.events.length;
    g.primaryType = Object.keys(g.counts).sort(
      (a, b) => (SIGNAL_RANK[b] || 0) - (SIGNAL_RANK[a] || 0)
    )[0];
    // Build the breakdown in signal order
    g.breakdown = Object.entries(g.counts)
      .sort((a, b) => (SIGNAL_RANK[b[0]] || 0) - (SIGNAL_RANK[a[0]] || 0))
      .map(([type, count]) => shortLabel(type, count));
  }

  return groups;
}

function formatDueDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const startToday = new Date();
  startToday.setHours(0, 0, 0, 0);
  const diffDays = Math.round((d - startToday) / 86400000);
  if (diffDays < 0) return `Overdue · ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function DueThisWeekCard() {
  const [dueActions, setDueActions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/due-actions')
      .then((r) => r.json())
      .then((data) => {
        setDueActions(data.dueActions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading || dueActions.length === 0) return null;

  return (
    <div className="border border-gallery-border bg-gallery-white mb-6">
      <div className="px-4 sm:px-5 py-3 border-b border-gallery-border flex items-center justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wider text-gallery-mid">Due this week</h2>
        <span className="text-2xs text-gallery-light">{dueActions.length}</span>
      </div>
      <div>
        {dueActions.map((item) => {
          const overdue = item.nextActionDate && new Date(item.nextActionDate) < new Date().setHours(0, 0, 0, 0);
          return (
            <a
              key={item.id}
              href={`/contacts/${item.id}`}
              className="flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 border-b border-gallery-border last:border-0 hover:bg-gallery-bg transition-colors"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{item.name}</div>
                {item.nextAction && (
                  <div className="text-2xs text-gallery-mid truncate">{item.nextAction}</div>
                )}
              </div>
              <span className={`text-2xs flex-shrink-0 ${overdue ? 'text-red-600 font-medium' : 'text-gallery-light'}`}>
                {formatDueDate(item.nextActionDate)}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}

export default function HomePage() {
  const [feed, setFeed] = useState([]);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    const cached = readCache();
    const todayStart = startOfTodayISO();

    // Solo confiamos en items cacheados de días ya cerrados
    const cachedPast = (cached?.items || []).filter(
      (i) => i.timestamp && i.timestamp < todayStart
    );

    // Pintamos de inmediato lo que ya tenemos (carga instantánea)
    if (cachedPast.length) {
      setFeed(cachedPast);
      setLoading(false);
    }

    // Si hay caché, pedimos solo desde el último día cerrado registrado.
    // Si no la hay (primera visita, caché borrada), pedimos todo.
    const after = cached?.lastClosedDay || null;
    const url = after
      ? `/api/activity?limit=500&after=${encodeURIComponent(after)}`
      : '/api/activity?limit=500';

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const fresh = data.feed || [];
        const merged = mergeFeeds(fresh, cachedPast);
        setFeed(merged);
        setToday(data.today != null ? data.today : null);
        setLoading(false);

        // Persistimos los días cerrados y movemos el corte a hoy
        writeCache(
          merged.filter((i) => i.timestamp && i.timestamp < todayStart),
          todayStart
        );
      })
      .catch(() => setLoading(false));
  }, []);

  // Build ordered day groups preserving feed order (already newest-first),
  // then collapse each day's items into one card per who+campaign.
  const dayGroups = [];
  let current = null;
  for (const item of feed) {
    const k = dayKey(item.timestamp);
    if (!current || current.key !== k) {
      current = { key: k, items: [] };
      dayGroups.push(current);
    }
    current.items.push(item);
  }
  for (const dg of dayGroups) {
    dg.cards = collapse(dg.items);
  }

  return (
    <div>
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif italic text-3xl mb-1">Activity</h1>
          <p className="text-sm text-gallery-mid">Latest engagement across all campaigns</p>
        </div>
        {today != null && (
          <div className="text-right">
            <div className="text-2xl font-medium tabular-nums leading-none">{today.toLocaleString()}</div>
            <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mt-1">
              move{today !== 1 ? 's' : ''} today
            </div>
          </div>
        )}
      </div>

      <DueThisWeekCard />

      <div className="border border-gallery-border bg-gallery-white">
        {loading ? (
          <div className="text-center py-16 text-gallery-light text-sm">Loading activity...</div>
        ) : feed.length === 0 ? (
          <div className="text-center py-16">
            <p className="font-serif italic text-lg text-gallery-mid mb-1">No activity yet</p>
            <p className="text-sm text-gallery-light">Engagement will appear here as recipients open and click.</p>
          </div>
        ) : (
          dayGroups.map((group) => (
            <div key={group.key}>
              <div className="px-4 sm:px-5 py-2 bg-gallery-bg border-b border-gallery-border text-2xs font-medium uppercase tracking-wider text-gallery-mid">
                {group.key}
              </div>
              {group.cards.map((card) => {
                const isOpen = expanded === card.key;
                const multi = card.total > 1;
                const artwork = card.artworks.size === 1 ? [...card.artworks][0] : null;
                return (
                  <div key={card.key} className="border-b border-gallery-border last:border-0">
                    <div
                      className={`flex items-start gap-3 px-4 sm:px-5 py-3 transition-colors ${
                        multi ? 'cursor-pointer hover:bg-gallery-bg' : ''
                      }`}
                      onClick={() => multi && setExpanded(isOpen ? null : card.key)}
                    >
                      <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${dotClass(card.primaryType)}`} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm leading-snug">
                          <span className="font-medium">{card.who}</span>{' '}
                          <span className="text-gallery-mid">{actionLabel(card.primaryType)}</span>{' '}
                          {card.campaign
                            ? <span className="font-medium">{card.campaign}</span>
                            : <span className="text-gallery-mid italic">a viewing room</span>}
                          {artwork && (
                            <span className="text-gallery-mid"> {'\u2014'} {artwork}</span>
                          )}
                        </div>
                        <div className="text-2xs text-gallery-light mt-0.5">
                          {timeAgo(card.latest)}
                          {multi && <span> · {card.breakdown.join(' · ')}</span>}
                        </div>
                      </div>
                      {multi && (
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-2xs tabular-nums text-gallery-mid bg-gallery-bg border border-gallery-border px-1.5 py-0.5">
                            {card.total}
                          </span>
                          <span className="text-gallery-light text-xs w-3 text-center">
                            {isOpen ? '\u2212' : '+'}
                          </span>
                        </div>
                      )}
                    </div>

                    {multi && isOpen && (
                      <div className="bg-gallery-bg px-4 sm:px-5 py-3 border-t border-gallery-border">
                        <div className="text-2xs font-medium uppercase tracking-wider text-gallery-mid mb-2">
                          All {card.total} events
                        </div>
                        <div className="space-y-1.5">
                          {card.events.map((ev) => (
                            <div key={ev.id} className="flex items-center gap-3 text-2xs">
                              <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotClass(ev.type)}`} />
                              <span className="text-gallery-dark flex-shrink-0 w-24">{eventNoun(ev.type)}</span>
                              {ev.artwork
                                ? <span className="text-gallery-mid truncate flex-1">{ev.artwork}</span>
                                : <span className="flex-1" />}
                              <span className="text-gallery-light flex-shrink-0">{fullDate(ev.timestamp)}</span>
                              {ev.device && (
                                <span className="text-gallery-light flex-shrink-0 w-16 text-right">{ev.device}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
