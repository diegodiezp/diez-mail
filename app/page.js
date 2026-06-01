'use client';

import { useState, useEffect } from 'react';

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

export default function HomePage() {
  const [feed, setFeed] = useState([]);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch('/api/activity?limit=100')
      .then((r) => r.json())
      .then((data) => {
        setFeed(data.feed || []);
        setToday(data.today != null ? data.today : null);
        setLoading(false);
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
                              <span className="text-gallery-dark w-28 flex-shrink-0">{actionLabel(ev.type)}</span>
                              <span className="text-gallery-light flex-1">{fullDate(ev.timestamp)}</span>
                              {ev.device && (
                                <span className="text-gallery-light flex-shrink-0">{ev.device}</span>
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
