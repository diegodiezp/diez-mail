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

function dotClass(type) {
  switch (type) {
    case 'Inquire Click':     return 'bg-gallery-success';
    case 'Artwork View':      return 'bg-gallery-black';
    case 'Viewing Room Open': return 'bg-gallery-black';
    case 'Click':             return 'bg-gallery-mid';
    default:                  return 'bg-gallery-border';
  }
}

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

export default function HomePage() {
  const [feed, setFeed] = useState([]);
  const [today, setToday] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/activity?limit=60')
      .then((r) => r.json())
      .then((data) => {
        setFeed(data.feed || []);
        setToday(data.today != null ? data.today : null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Build ordered groups preserving feed order (already newest-first)
  const groups = [];
  let current = null;
  for (const item of feed) {
    const k = dayKey(item.timestamp);
    if (!current || current.key !== k) {
      current = { key: k, items: [] };
      groups.push(current);
    }
    current.items.push(item);
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
          groups.map((group) => (
            <div key={group.key}>
              <div className="px-4 sm:px-5 py-2 bg-gallery-bg border-b border-gallery-border text-2xs font-medium uppercase tracking-wider text-gallery-mid">
                {group.key}
              </div>
              {group.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 px-4 sm:px-5 py-3 border-b border-gallery-border last:border-0"
                >
                  <span className={`mt-1.5 h-2 w-2 rounded-full flex-shrink-0 ${dotClass(item.type)}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm leading-snug">
                      <span className="font-medium">{item.who}</span>{' '}
                      <span className="text-gallery-mid">{actionLabel(item.type)}</span>{' '}
                      {item.campaign
                        ? <span className="font-medium">{item.campaign}</span>
                        : <span className="text-gallery-mid italic">a viewing room</span>}
                      {item.artwork && (
                        <span className="text-gallery-mid"> {'\u2014'} {item.artwork}</span>
                      )}
                    </div>
                    <div className="text-2xs text-gallery-light mt-0.5">
                      {timeAgo(item.timestamp)}
                      {item.device ? ` · ${item.device}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
